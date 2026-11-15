import type { SupabaseClient } from '@supabase/supabase-js';
import type { MissionPhase } from '@/domain/observations/observation';
import type {
  RemoteHistoryImporter,
  RemoteObservationSnapshot,
  RemoteSessionSnapshot,
} from '@/domain/repositories/remote-history';

export type PullStatus =
  | { kind: 'pulled'; sessions: number; observations: number; skipped: number }
  | { kind: 'not_authenticated' }
  | { kind: 'offline'; message: string }
  | { kind: 'remote_error'; message: string };

/** Paginación defensiva: PostgREST limita filas por respuesta. */
const PAGE_SIZE = 500;
const MAX_PAGES = 40;

interface SessionRow {
  id: string;
  client_request_id: string | null;
  subject_id: string;
  mission_phase: string;
  started_at: string;
  created_at: string;
}

interface ObservationRow {
  id: string;
  client_request_id: string | null;
  session_id: string | null;
  metric_code: string;
  value_numeric: number | string | null;
  value_text: string | null;
  value_boolean: boolean | null;
  unit_code: string | null;
  measured_at: string;
  quality_status: string;
  created_at: string;
}

interface LegacySessionRow {
  session_id: string;
  subject_id: string;
  mission_phase: string;
  recorded_at: string;
  created_at: string;
}

interface LegacyObservationRow {
  observation_id: string;
  session_id: string;
  metric_id: string;
  value_original: number | string;
  unit_original: string | null;
  observed_at: string;
  quality_state: string;
  created_at: string;
}

/**
 * Descarga el historial del usuario autenticado desde Supabase y lo
 * importa al almacén local.
 *
 * - Sin sesión remota no descarga (estado honesto).
 * - Es idempotente: las filas ya presentes no se duplican ni se
 *   sobrescriben.
 * - Una observación sin valor numérico/booleano mapeable, con métrica
 *   desconocida o sin sesión local se descarta y se cuenta; nunca se
 *   rellena con valores inventados.
 */
export class PullRemoteHistoryUseCase {
  private running: Promise<PullStatus> | null = null;

  constructor(
    private readonly supabase: SupabaseClient | null,
    private readonly importer: RemoteHistoryImporter,
  ) {}

  async execute(): Promise<PullStatus> {
    if (this.running !== null) return this.running;
    this.running = this.pull();
    try {
      return await this.running;
    } finally {
      this.running = null;
    }
  }

  private async pull(): Promise<PullStatus> {
    if (this.supabase === null) {
      return {
        kind: 'remote_error',
        message: 'Supabase no está configurado en esta compilación.',
      };
    }

    let userId: string | null = null;
    try {
      const { data, error } = await this.supabase.auth.getSession();
      if (error !== null) {
        return {
          kind: 'offline',
          message: 'Sin conexión: el historial se descargará al recuperar internet.',
        };
      }
      userId = data.session?.user?.id ?? null;
    } catch {
      return {
        kind: 'offline',
        message: 'Sin conexión: el historial se descargará al recuperar internet.',
      };
    }
    if (userId === null) return { kind: 'not_authenticated' };

    try {
      const sessionsPage = await this.fetchSessions(userId);
      if ('error' in sessionsPage) {
        return {
          kind: 'remote_error',
          message: remoteMessage(sessionsPage.error),
        };
      }

      const sessions: RemoteSessionSnapshot[] = [];
      const localIdByRemoteId = new Map<string, string>();
      for (const row of sessionsPage.rows) {
        if (!isMissionPhase(row.mission_phase)) continue;
        const localSessionId = row.client_request_id ?? row.id;
        localIdByRemoteId.set(row.id, localSessionId);
        sessions.push({
          localSessionId,
          remoteSessionId: row.id,
          subjectId: row.subject_id,
          missionPhase: row.mission_phase,
          startedAt: row.started_at,
          createdAt: row.created_at,
        });
      }

      const observationsPage = await this.fetchObservations(userId);
      if ('error' in observationsPage) {
        return {
          kind: 'remote_error',
          message: remoteMessage(observationsPage.error),
        };
      }

      const observations: RemoteObservationSnapshot[] = [];
      let mappingSkipped = 0;
      for (const row of observationsPage.rows) {
        const localSessionId =
          row.session_id === null ? null : (localIdByRemoteId.get(row.session_id) ?? null);
        if (localSessionId === null) {
          mappingSkipped += 1;
          continue;
        }

        const value = toLocalValue(row);
        if (value === null) {
          mappingSkipped += 1;
          continue;
        }

        const measuredAt = row.measured_at;
        observations.push({
          localObservationId:
            row.client_request_id ?? `${localSessionId}:${row.metric_code}`,
          localSessionId,
          metricId: normalizeMetricCode(row.metric_code),
          valueOriginal: value,
          unitOriginal: row.unit_code,
          observedAt: measuredAt,
          qualityState: toLocalQuality(row.quality_status),
          createdAt: row.created_at,
        });
      }

      const imported = await this.importer.importRemoteHistory({ sessions, observations });
      return {
        kind: 'pulled',
        sessions: imported.sessionsImported,
        observations: imported.observationsImported,
        skipped: imported.observationsSkipped + mappingSkipped,
      };
    } catch {
      return {
        kind: 'offline',
        message: 'Sin conexión: el historial se descargará al recuperar internet.',
      };
    }
  }

  /**
   * Descarga todas las páginas de sesiones. PostgREST limita las filas
   * por respuesta; sin paginar se perdería historial antiguo.
   *
   * Si el proyecto remoto usa el modelo antiguo (`session_id`/`recorded_at`
   * en vez de `id`/`client_request_id`/`started_at`), se reintenta con esa
   * forma. La app empuja el modelo v2, pero el pull tolera ambos para no
   * ocultar historial ya existente.
   */
  private async fetchSessions(
    userId: string,
  ): Promise<{ rows: SessionRow[] } | { error: string }> {
    const v2 = await this.fetchSessionsV2(userId);
    if (!('error' in v2) || !isSchemaMismatch(v2.error)) return v2;
    return this.fetchSessionsLegacy(userId);
  }

  private async fetchSessionsV2(
    userId: string,
  ): Promise<{ rows: SessionRow[] } | { error: string }> {
    const rows: SessionRow[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const from = page * PAGE_SIZE;
      const { data, error } = await this.supabase!
        .from('measurement_sessions')
        .select(
          'id, client_request_id, subject_id, mission_phase, started_at, created_at',
        )
        .eq('subject_id', userId)
        .order('started_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error !== null) return { error: error.message };
      const batch = (data ?? []) as SessionRow[];
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }
    return { rows };
  }

  private async fetchSessionsLegacy(
    userId: string,
  ): Promise<{ rows: SessionRow[] } | { error: string }> {
    const rows: SessionRow[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const from = page * PAGE_SIZE;
      const { data, error } = await this.supabase!
        .from('measurement_sessions')
        .select('session_id, subject_id, mission_phase, recorded_at, created_at')
        .eq('subject_id', userId)
        .order('recorded_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error !== null) return { error: error.message };
      const batch = (data ?? []) as LegacySessionRow[];
      for (const row of batch) {
        rows.push({
          id: row.session_id,
          client_request_id: null,
          subject_id: row.subject_id,
          mission_phase: row.mission_phase,
          started_at: row.recorded_at,
          created_at: row.created_at,
        });
      }
      if (batch.length < PAGE_SIZE) break;
    }
    return { rows };
  }

  /** Descarga todas las páginas de observaciones del usuario. */
  private async fetchObservations(
    userId: string,
  ): Promise<{ rows: ObservationRow[] } | { error: string }> {
    const v2 = await this.fetchObservationsV2(userId);
    if (!('error' in v2) || !isSchemaMismatch(v2.error)) return v2;
    return this.fetchObservationsLegacy();
  }

  private async fetchObservationsV2(
    userId: string,
  ): Promise<{ rows: ObservationRow[] } | { error: string }> {
    const rows: ObservationRow[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const from = page * PAGE_SIZE;
      const { data, error } = await this.supabase!
        .from('observations')
        .select(
          'id, client_request_id, session_id, metric_code, value_numeric, value_text, value_boolean, unit_code, measured_at, quality_status, created_at',
        )
        .eq('subject_id', userId)
        .order('measured_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error !== null) return { error: error.message };
      const batch = (data ?? []) as ObservationRow[];
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }
    return { rows };
  }

  /**
   * Modelo antiguo: no hay `subject_id` en observaciones. El alcance se
   * garantiza por RLS y, después, porque solo se importan observaciones
   * cuya sesión pertenezca al usuario descargado.
   */
  private async fetchObservationsLegacy(): Promise<
    { rows: ObservationRow[] } | { error: string }
  > {
    const rows: ObservationRow[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const from = page * PAGE_SIZE;
      const { data, error } = await this.supabase!
        .from('observations')
        .select(
          'observation_id, session_id, metric_id, value_original, unit_original, observed_at, quality_state, created_at',
        )
        .order('observed_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error !== null) return { error: error.message };
      const batch = (data ?? []) as LegacyObservationRow[];
      for (const row of batch) {
        rows.push({
          id: row.observation_id,
          client_request_id: row.observation_id,
          session_id: row.session_id,
          metric_code: row.metric_id,
          value_numeric: row.value_original,
          value_text: null,
          value_boolean: null,
          unit_code: row.unit_original,
          measured_at: row.observed_at,
          quality_status:
            row.quality_state === 'ok'
              ? 'accepted'
              : row.quality_state === 'invalid'
                ? 'rejected'
                : 'inconclusive',
          created_at: row.created_at,
        });
      }
      if (batch.length < PAGE_SIZE) break;
    }
    return { rows };
  }
}

/** Error de PostgREST por columna inexistente en un modelo remoto distinto. */
function isSchemaMismatch(message: string): boolean {
  return /client_request_id|schema cache|does not exist/i.test(message);
}

function isMissionPhase(value: string): value is MissionPhase {
  return value === 'preflight' || value === 'inflight' || value === 'postflight';
}

/** Devuelve un valor local honesto o null si no se puede mapear. */
function toLocalValue(row: ObservationRow): number | null {
  if (row.value_numeric !== null && row.value_numeric !== undefined) {
    const numeric = Number(row.value_numeric);
    return Number.isFinite(numeric) ? numeric : null;
  }
  // Un booleano false representa ausencia explícita: no se guarda como
  // valor numérico (el almacén local no inventa un 0 clínico).
  if (row.value_boolean === true) return 1;
  return null;
}

function toLocalQuality(status: string): 'ok' | 'suspect' | 'invalid' {
  if (status === 'accepted') return 'ok';
  if (status === 'rejected') return 'invalid';
  // 'inconclusive' y 'not_assessed' se conservan como no validados.
  return 'suspect';
}

function normalizeMetricCode(code: string): string {
  const fixes: Record<string, string> = {
    sympton_nausea: 'symptom_nausea',
    symptom_nauseas: 'symptom_nausea',
  };
  return fixes[code] ?? code;
}

function remoteMessage(message: string): string {
  if (/network|fetch|timeout|offline|connection/i.test(message)) {
    return 'Sin conexión: el historial se descargará al recuperar internet.';
  }
  return `No se pudo descargar el historial (${message}). Los datos locales siguen a salvo.`;
}

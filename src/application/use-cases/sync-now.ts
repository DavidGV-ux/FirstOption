import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OutboxRow,
  SyncOutboxStore,
} from '@/domain/repositories/sync-outbox';

export type SyncStatus =
  | { kind: 'synced'; pushed: number; remaining: number }
  | { kind: 'not_authenticated' }
  | { kind: 'offline'; message: string }
  | { kind: 'remote_error'; message: string };

const CURSOR_KEY = 'sessions_pushed_cursor';

/**
 * Caso de uso: sincronizar ahora (push hacia Supabase).
 *
 * Contrato:
 * - Idempotente: los UUID/generados en cliente son PK remotas (upsert).
 * - Sin last-write-wins silencioso: solo upsert de filas nuevas locales;
 *   los conflictos remotos quedan para revisión (Inc 6).
 * - Reintentos con registro de error; nunca se descarta una operación
 *   pendiente sin confirmación.
 * - Sin sesión remota → estado honesto 'not_authenticated'.
 */
export class SyncNowUseCase {
  constructor(
    private readonly supabase: SupabaseClient | null,
    private readonly store: SyncOutboxStore,
  ) {}

  async execute(): Promise<SyncStatus> {
    if (this.supabase === null) {
      return {
        kind: 'remote_error',
        message: 'Supabase no está configurado en esta compilación.',
      };
    }

    const { data: sessionData, error: sessionError } = await this.supabase.auth.getSession();
    if (sessionError !== null || sessionData?.session === null) {
      return { kind: 'not_authenticated' };
    }

    // La sesión remota puede estar expirada; si el refresh falla, se
    // reporta como autenticación requerida, no como error de red.
    const { data: refreshed, error: refreshError } = await this.supabase.auth.refreshSession();
    const activeSession = refreshed?.session ?? sessionData.session;
    if ((refreshError !== null && refreshed?.session === null) || activeSession === null) {
      return { kind: 'not_authenticated' };
    }
    const userId = activeSession.user.id;

    const pending = await this.store.listPendingOutbox(200);
    if (pending.length === 0) {
      return { kind: 'synced', pushed: 0, remaining: 0 };
    }

    // Orden determinista: sesiones antes que sus observaciones (FK remota),
    // luego por antigüedad.
    pending.sort((a, b) => {
      if (a.entity_type !== b.entity_type) {
        return a.entity_type === 'measurement_session' ? -1 : 1;
      }
      return a.outbox_id.localeCompare(b.outbox_id);
    });

    let pushed = 0;
    let failures = 0;
    let lastError: string | null = null;
    for (const row of pending) {
      try {
        await this.pushOne(row, userId);
        await this.store.markOutboxDone(row.outbox_id);
        await this.store.markEntitiesSynced(row.entity_type, row.entity_id);
        pushed += 1;
      } catch (error) {
        failures += 1;
        const message = error instanceof Error ? error.message : 'Error desconocido';
        lastError = message;
        await this.store.markOutboxFailed(row.outbox_id, message);
      }
    }

    const remaining = failures > 0 ? await this.countPending() : 0;
    await this.store.setCursor(CURSOR_KEY, new Date().toISOString());
    if (pushed === 0 && failures > 0) {
      return {
        kind: 'remote_error',
        message: `No se pudo sincronizar todavía (${lastError ?? 'error remoto'}). Los datos locales están a salvo; se reintentará.`,
      };
    }
    if (failures > 0) {
      return {
        kind: 'synced',
        pushed,
        remaining,
      };
    }
    return { kind: 'synced', pushed, remaining };
  }

  private async pushOne(row: OutboxRow, userId: string): Promise<void> {
    if (this.supabase === null) {
      throw new Error('Cliente Supabase ausente');
    }
    const raw = JSON.parse(row.payload) as Record<string, unknown>;
    // TEMP-DIAG: payload crudo del outbox antes de adaptar.
    console.log('[DIAG sync] pushOne', row.outbox_id, row.entity_type, 'rawPayload=', JSON.stringify(raw));
    const adapted = this.adaptPayloadForRemote(row.entity_type, row.entity_id, raw, userId);
    const table = adapted.table;
    // TEMP-DIAG: metric_code que se enviará al remoto.
    console.log('[DIAG sync] pushOne', row.outbox_id, '-> metric_code=', adapted.payload.metric_code, 'table=', table);
    const { error } = await this.supabase.from(table).upsert(adapted.payload, {
      onConflict: adapted.onConflict,
    });
    if (error !== null) {
      throw new Error(`${error.message}${error.code ? ` (${error.code})` : ''}`);
    }
  }

  /**
   * Adapta el payload local al esquema remoto.
   * Soporta el modelo remoto v2 (000_supabase_model_v2.sql) y, como
   * compatibilidad, el modelo antiguo por nombres de columnas.
   */
  private adaptPayloadForRemote(
    entityType: OutboxRow['entity_type'],
    entityId: string,
    raw: Record<string, unknown>,
    userId: string,
  ): { table: string; payload: Record<string, unknown>; onConflict: string } {
    if (entityType === 'measurement_session') {
      const sessionId = String(raw.session_id ?? entityId);
      const recordedAt = String(raw.recorded_at ?? raw.started_at ?? new Date().toISOString());
      return {
        table: 'measurement_sessions',
        onConflict: 'client_request_id',
        payload: {
          id: this.toUuid(sessionId),
          client_request_id: sessionId,
          subject_id: userId,
          created_by: userId,
          mission_phase: (raw.mission_phase as string) ?? 'preflight',
          started_at: recordedAt,
          ended_at: null,
          source_app: 'mobile_app',
          created_at: raw.created_at ?? recordedAt,
          updated_at: recordedAt,
        },
      };
    }

    // observation
    const observationId = String(raw.observation_id ?? entityId);
    const sessionId = String(raw.session_id ?? '');
    const rawMetricId = String(raw.metric_id ?? raw.metric_code ?? 'unknown_metric');
    const metricId = this.normalizeMetricCode(rawMetricId);
    const value = raw.value_original ?? raw.value_numeric ?? raw.value_boolean ?? null;
    const numericValue =
      typeof value === 'number' ? value : value === null || typeof value === 'boolean' ? null : Number(value);
    const measuredAt = String(raw.observed_at ?? raw.measured_at ?? raw.created_at ?? new Date().toISOString());
    const qualityState = String(raw.quality_state ?? raw.quality_status ?? 'ok');
    const qualityStatus =
      qualityState === 'ok'
        ? 'accepted'
        : qualityState === 'invalid' || qualityState === 'rejected'
          ? 'rejected'
          : qualityState === 'suspect' || qualityState === 'inconclusive'
            ? 'inconclusive'
            : 'not_assessed';

    // Síntomas/booleanos: el remoto exige value_boolean para métricas booleanas.
    const isBooleanMetric = metricId.startsWith('symptom_') || typeof value === 'boolean';
    const valueBoolean = isBooleanMetric
      ? (typeof value === 'boolean' ? value : Number(value) === 1)
      : null;
    const valueNumeric = isBooleanMetric ? null : (Number.isFinite(numericValue) ? numericValue : null);

    return {
      table: 'observations',
      onConflict: 'client_request_id',
      payload: {
        id: this.toUuid(observationId),
        client_request_id: observationId,
        subject_id: userId,
        created_by: userId,
        session_id: sessionId ? this.toUuid(sessionId) : null,
        metric_code: metricId,
        value_numeric: valueNumeric,
        value_text: null,
        value_boolean: valueBoolean,
        unit_code: (raw.unit_original as string | null) ?? (raw.unit_code as string | null) ?? null,
        measured_at: measuredAt,
        recorded_at: measuredAt,
        source: 'manual',
        quality_status: qualityStatus,
        mission_phase: (raw.mission_phase as string) ?? 'preflight',
        created_at: raw.created_at ?? measuredAt,
        updated_at: measuredAt,
      },
    };
  }

  /** Normaliza códigos de métricas legacy para compatibilidad con el catálogo remoto (v1, explícito). */
  private normalizeMetricCode(code: string): string {
    const LEGACY_METRIC_CODE_FIXES_V1: Record<string, string> = {
      sympton_nausea: 'symptom_nausea',
      symptom_nauseas: 'symptom_nausea',
    };
    return LEGACY_METRIC_CODE_FIXES_V1[code] ?? code;
  }

  /** Convierte un identificador estable a UUID determinístico (v4-like en formato, derivado por hash). */
  private toUuid(input: string): string {
    // Si ya es UUID, devolverlo tal cual.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)) {
      return input;
    }
    // Hash FNV-1a 128-bit simplificado en dos pasadas para derivar 16 bytes deterministas.
    let h1 = 0x811c9dc5;
    let h2 = 0x811c9dc5 ^ 0x5a5a5a5a;
    let h3 = 0x811c9dc5 ^ 0xa5a5a5a5;
    let h4 = 0x811c9dc5 ^ 0x12345678;
    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 0x01000193);
      h2 ^= c + i; h2 = Math.imul(h2, 0x01000193);
      h3 ^= c * 31; h3 = Math.imul(h3, 0x01000193);
      h4 ^= c ^ (i * 17); h4 = Math.imul(h4, 0x01000193);
    }
    const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
    const bytes = (hex(h1) + hex(h2) + hex(h3) + hex(h4)).slice(0, 32);
    // Ajustar bits de versión (4) y variante (8/9/a/b)
    const chars = bytes.split('');
    chars[12] = '4';
    const variant = parseInt(chars[16], 16);
    chars[16] = ((variant & 0x3) | 0x8).toString(16);
    const b = chars.join('');
    return `${b.slice(0, 8)}-${b.slice(8, 12)}-${b.slice(12, 16)}-${b.slice(16, 20)}-${b.slice(20, 32)}`;
  }

  private async countPending(): Promise<number> {
    const pending = await this.store.listPendingOutbox(1000);
    return pending.length;
  }
}

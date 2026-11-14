import type {
  MeasurementSession,
  MissionPhase,
  Observation,
  QualityState,
  SyncState,
} from '@/domain/observations/observation';
import type {
  NewObservationInput,
  ObservationRepository,
  SessionWithObservations,
} from '@/domain/repositories/observation-repository';
import type { MetricDefinition } from '@/domain/metrics/metric-definition';
import type { SqlDriver } from '../database/driver';

interface SessionRow {
  session_id: string;
  subject_id: string;
  mission_phase: string;
  recorded_at: string;
  recorded_local_date: string;
  source: string;
  note: string | null;
  sync_state: string;
  created_at: string;
}

interface ObservationRow {
  observation_id: string;
  session_id: string;
  metric_id: string;
  value_original: number;
  unit_original: string | null;
  value_normalized: number | null;
  unit_normalized: string | null;
  observed_at: string;
  local_date: string;
  quality_state: string;
  sync_state: string;
  created_at: string;
}

interface MetricRow {
  metric_id: string;
  name_es: string;
  short_name_es: string | null;
  category: string;
  value_type: string;
  canonical_unit: string | null;
  scale_min: number | null;
  scale_max: number | null;
  plausible_min: number | null;
  plausible_max: number | null;
  max_decimals: number | null;
  definition_version: number;
}

function mapSession(row: SessionRow): MeasurementSession {
  return {
    sessionId: row.session_id,
    subjectId: row.subject_id,
    missionPhase: row.mission_phase as MissionPhase,
    recordedAt: row.recorded_at,
    recordedLocalDate: row.recorded_local_date,
    source: row.source,
    note: row.note,
    syncState: row.sync_state as SyncState,
    createdAt: row.created_at,
  };
}

function mapObservation(row: ObservationRow): Observation {
  return {
    observationId: row.observation_id,
    sessionId: row.session_id,
    metricId: row.metric_id,
    valueOriginal: row.value_original,
    unitOriginal: row.unit_original,
    valueNormalized: row.value_normalized,
    unitNormalized: row.unit_normalized,
    observedAt: row.observed_at,
    localDate: row.local_date,
    qualityState: row.quality_state as QualityState,
    syncState: row.sync_state as SyncState,
    createdAt: row.created_at,
  };
}

function mapMetric(row: MetricRow): MetricDefinition {
  return {
    metricId: row.metric_id,
    nameEs: row.name_es,
    shortNameEs: row.short_name_es ?? undefined,
    category: row.category as MetricDefinition['category'],
    valueType: row.value_type as MetricDefinition['valueType'],
    canonicalUnit: row.canonical_unit,
    scaleMin: row.scale_min ?? undefined,
    scaleMax: row.scale_max ?? undefined,
    plausibleMin: row.plausible_min ?? undefined,
    plausibleMax: row.plausible_max ?? undefined,
    maxDecimals: row.max_decimals ?? undefined,
    definitionVersion: row.definition_version,
  };
}

/**
 * Repositorio de observaciones sobre SQLite. SQL siempre parametrizado;
 * ninguna consulta concatena entradas de la persona usuaria.
 */
export class SqliteObservationRepository implements ObservationRepository {
  constructor(private readonly driver: SqlDriver) {}

  async saveSessionWithObservations(
    session: MeasurementSession,
    observations: readonly NewObservationInput[],
  ): Promise<void> {
    await this.driver.withTransaction(async () => {
      await this.driver.run(
        `INSERT INTO measurement_sessions
           (session_id, subject_id, mission_phase, recorded_at, recorded_local_date,
            source, note, sync_state, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.sessionId,
          session.subjectId,
          session.missionPhase,
          session.recordedAt,
          session.recordedLocalDate,
          session.source,
          session.note,
          session.syncState,
          session.createdAt,
        ],
      );

      const createdAt = session.createdAt;
      for (const obs of observations) {
        await this.driver.run(
          `INSERT INTO observations
             (observation_id, session_id, metric_id, value_original, unit_original,
              value_normalized, unit_normalized, observed_at, local_date,
              quality_state, sync_state, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            this.observationId(session.sessionId, obs),
            session.sessionId,
            obs.metricId,
            obs.valueOriginal,
            obs.unitOriginal,
            null,
            null,
            obs.observedAt,
            obs.localDate,
            obs.qualityState ?? 'ok',
            session.syncState,
            createdAt,
          ],
        );
      }
    });
  }

  /**
   * Identificador de observación determinista dentro de la sesión:
   * evita duplicados accidentales del mismo par (métrica, sesión) que
   * llegaran dos veces por reintento local, sin perder el registro
   * original de la sesión.
   */
  private observationId(sessionId: string, obs: NewObservationInput): string {
    return `${sessionId}:${obs.metricId}`;
  }

  async listRecentSessions(limit: number): Promise<SessionWithObservations[]> {
    const safeLimit = Math.max(1, Math.floor(limit));
    const sessionRows = await this.driver.getAll<SessionRow>(
      `SELECT * FROM measurement_sessions
       ORDER BY recorded_at DESC
       LIMIT ?`,
      [safeLimit],
    );
    if (sessionRows.length === 0) {
      return [];
    }
    const ids = sessionRows.map((r) => r.session_id);
    const placeholders = ids.map(() => '?').join(', ');
    const obsRows = await this.driver.getAll<ObservationRow>(
      `SELECT * FROM observations
       WHERE session_id IN (${placeholders})
       ORDER BY observed_at ASC, metric_id ASC`,
      ids,
    );
    const bySession = new Map<string, Observation[]>();
    for (const row of obsRows) {
      const list = bySession.get(row.session_id) ?? [];
      list.push(mapObservation(row));
      bySession.set(row.session_id, list);
    }
    return sessionRows.map((row) => ({
      session: mapSession(row),
      observations: bySession.get(row.session_id) ?? [],
    }));
  }

  async countPendingSync(): Promise<{ sessions: number; observations: number }> {
    const sessions = await this.driver.getFirst<{ n: number }>(
      `SELECT COUNT(*) AS n FROM measurement_sessions
       WHERE sync_state IN ('local_only', 'pending_sync', 'sync_failed')`,
    );
    const observations = await this.driver.getFirst<{ n: number }>(
      `SELECT COUNT(*) AS n FROM observations
       WHERE sync_state IN ('local_only', 'pending_sync', 'sync_failed')`,
    );
    return { sessions: sessions?.n ?? 0, observations: observations?.n ?? 0 };
  }

  async listMetricDefinitions(): Promise<MetricDefinition[]> {
    const rows = await this.driver.getAll<MetricRow>(
      `SELECT * FROM metric_definitions ORDER BY category, metric_id`,
    );
    return rows.map(mapMetric);
  }
}

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
import type { OutboxRow, SyncOutboxStore } from '@/domain/repositories/sync-outbox';
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
 *
 * El guardado de una sesión escribe también las entradas de
 * `sync_outbox` en la MISMA transacción (offline-first): guardar una
 * medición y encolarla para sincronizar es una única operación atómica.
 */
export class SqliteObservationRepository implements ObservationRepository, SyncOutboxStore {
  constructor(private readonly driver: SqlDriver) {}

  async saveSessionWithObservations(
    session: MeasurementSession,
    observations: readonly NewObservationInput[],
  ): Promise<void> {
    await this.driver.withTransaction(async () => {
      await this.driver.run(
        `INSERT INTO measurement_sessions
           (session_id, subject_id, mission_phase, recorded_at, recorded_local_date,
            source, note, sync_state, created_at, remote_user_id, client_request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          null, // remote_user_id se actualiza al sincronizar
          session.sessionId, // client_request_id = session_id para idempotencia
        ],
      );

      const createdAt = session.createdAt;
      for (const obs of observations) {
        await this.driver.run(
          `INSERT INTO observations
             (observation_id, session_id, metric_id, value_original, unit_original,
              value_normalized, unit_normalized, observed_at, local_date,
              quality_state, sync_state, created_at, remote_user_id, client_request_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            null,
            this.observationId(session.sessionId, obs),
          ],
        );
        // Entrada de outbox (misma transacción, idempotente por entidad).
        await this.enqueueOutbox(
          'observation',
          this.observationId(session.sessionId, obs),
          {
            observation_id: this.observationId(session.sessionId, obs),
            session_id: session.sessionId,
            metric_id: obs.metricId,
            value_original: obs.valueOriginal,
            unit_original: obs.unitOriginal,
            observed_at: obs.observedAt,
            local_date: obs.localDate,
            quality_state: obs.qualityState ?? 'ok',
            created_at: createdAt,
            client_request_id: this.observationId(session.sessionId, obs),
          },
          createdAt,
        );
      }

      // Encolar también la sesión.
      await this.enqueueOutbox('measurement_session', session.sessionId, {
        session_id: session.sessionId,
        subject_id: session.subjectId,
        mission_phase: session.missionPhase,
        recorded_at: session.recordedAt,
        recorded_local_date: session.recordedLocalDate,
        source: session.source,
        note: session.note,
        created_at: session.createdAt,
        client_request_id: session.sessionId,
      }, createdAt);
    });
  }

  /** Inserta (o conserva) una entrada de outbox dentro de la transacción actual. */
  private async enqueueOutbox(
    entityType: 'measurement_session' | 'observation',
    entityId: string,
    payload: Record<string, unknown>,
    createdAt: string,
  ): Promise<void> {
    await this.driver.run(
      `INSERT INTO sync_outbox
         (outbox_id, entity_type, entity_id, operation, payload, created_at, state)
       VALUES (?, ?, ?, 'upsert', ?, ?, 'pending')
       ON CONFLICT (entity_type, entity_id) DO NOTHING`,
      [`${entityType}:${entityId}`, entityType, entityId, JSON.stringify(payload), createdAt],
    );
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

  async listRecentSessions(limit: number, subjectId?: string): Promise<SessionWithObservations[]> {
    const safeLimit = Math.max(1, Math.floor(limit));
    const sessionRows = subjectId === undefined
      ? await this.driver.getAll<SessionRow>(
          `SELECT * FROM measurement_sessions
           ORDER BY recorded_at DESC
           LIMIT ?`,
          [safeLimit],
        )
      : await this.driver.getAll<SessionRow>(
          `SELECT * FROM measurement_sessions
           WHERE subject_id = ?
           ORDER BY recorded_at DESC
           LIMIT ?`,
          [subjectId, safeLimit],
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

  async countPendingSync(subjectId?: string): Promise<{ sessions: number; observations: number }> {
    const sessionSql = subjectId === undefined
      ? `SELECT COUNT(*) AS n FROM measurement_sessions
         WHERE sync_state IN ('local_only', 'pending_sync', 'sync_failed')`
      : `SELECT COUNT(*) AS n FROM measurement_sessions
         WHERE subject_id = ? AND sync_state IN ('local_only', 'pending_sync', 'sync_failed')`;
    const obsSql = subjectId === undefined
      ? `SELECT COUNT(*) AS n FROM observations o
         JOIN measurement_sessions s ON s.session_id = o.session_id
         WHERE o.sync_state IN ('local_only', 'pending_sync', 'sync_failed')`
      : `SELECT COUNT(*) AS n FROM observations o
         JOIN measurement_sessions s ON s.session_id = o.session_id
         WHERE s.subject_id = ? AND o.sync_state IN ('local_only', 'pending_sync', 'sync_failed')`;
    const sessions = await this.driver.getFirst<{ n: number }>(
      sessionSql,
      subjectId === undefined ? [] : [subjectId],
    );
    const observations = await this.driver.getFirst<{ n: number }>(
      obsSql,
      subjectId === undefined ? [] : [subjectId],
    );
    return { sessions: sessions?.n ?? 0, observations: observations?.n ?? 0 };
  }

  async adoptSubjectScope(fromSubjectId: string, toSubjectId: string): Promise<number> {
    if (fromSubjectId === toSubjectId) return 0;
    // Adoptar sesiones (y sus observaciones siguen enlazadas por session_id).
    await this.driver.withTransaction(async () => {
      await this.driver.run(
        `UPDATE measurement_sessions SET subject_id = ? WHERE subject_id = ?`,
        [toSubjectId, fromSubjectId],
      );
      // Laboratorio (si existe la tabla).
      try {
        await this.driver.run(
          `UPDATE lab_panels SET subject_id = ? WHERE subject_id = ?`,
          [toSubjectId, fromSubjectId],
        );
      } catch {
        // Tabla puede no existir aún (migración v3 no aplicada): ignorar.
      }
      try {
        await this.driver.run(
          `UPDATE lab_documents SET subject_id = ? WHERE subject_id = ?`,
          [toSubjectId, fromSubjectId],
        );
      } catch {
        // Ignorar si la tabla no existe.
      }
      try {
        await this.driver.run(
          `UPDATE baseline_versions SET subject_id = ? WHERE subject_id = ?`,
          [toSubjectId, fromSubjectId],
        );
      } catch {
        // Ignorar si la tabla no existe.
      }
    });
    const row = await this.driver.getFirst<{ n: number }>(
      `SELECT COUNT(*) AS n FROM measurement_sessions WHERE subject_id = ?`,
      [toSubjectId],
    );
    return row?.n ?? 0;
  }

  async countRecordsBySubject(subjectId: string): Promise<number> {
    const row = await this.driver.getFirst<{ n: number }>(
      `SELECT COUNT(*) AS n FROM measurement_sessions WHERE subject_id = ?`,
      [subjectId],
    );
    return row?.n ?? 0;
  }

  async listMetricDefinitions(): Promise<MetricDefinition[]> {
    const rows = await this.driver.getAll<MetricRow>(
      `SELECT * FROM metric_definitions ORDER BY category, metric_id`,
    );
    return rows.map(mapMetric);
  }

  // ------------------------------------------------------------------
  // Outbox y cursores (Incremento 2)
  // ------------------------------------------------------------------

  /** Entradas pendientes o fallidas, más antiguas primero. */
  async listPendingOutbox(limit = 200): Promise<OutboxRow[]> {
    return this.driver.getAll<OutboxRow>(
      `SELECT outbox_id, entity_type, entity_id, payload, attempts
       FROM sync_outbox
       WHERE state IN ('pending', 'failed')
       ORDER BY created_at ASC
       LIMIT ?`,
      [Math.max(1, Math.floor(limit))],
    );
  }

  async markOutboxDone(outboxId: string): Promise<void> {
    await this.driver.run(
      `UPDATE sync_outbox
       SET state = 'done', last_attempt_at = ?, last_error = NULL
       WHERE outbox_id = ?`,
      [new Date().toISOString(), outboxId],
    );
  }

  async markOutboxFailed(outboxId: string, error: string): Promise<void> {
    const now = new Date().toISOString();
    await this.driver.run(
      `UPDATE sync_outbox
       SET state = 'failed', attempts = attempts + 1,
           last_attempt_at = ?, last_error = ?
       WHERE outbox_id = ?`,
      [now, error.slice(0, 500), outboxId],
    );
  }

  /** Marca como sincronizadas las filas clínicas correspondientes. */
  async markEntitiesSynced(entityType: 'measurement_session' | 'observation', entityId: string): Promise<void> {
    const table = entityType === 'measurement_session' ? 'measurement_sessions' : 'observations';
    const idColumn = entityType === 'measurement_session' ? 'session_id' : 'observation_id';
    await this.driver.run(
      `UPDATE ${table} SET sync_state = 'synced' WHERE ${idColumn} = ?`,
      [entityId],
    );
  }

  async getCursor(key: string): Promise<string | null> {
    const row = await this.driver.getFirst<{ value: string }>(
      'SELECT value FROM sync_cursors WHERE key = ?',
      [key],
    );
    return row?.value ?? null;
  }

  async setCursor(key: string, value: string): Promise<void> {
    await this.driver.run(
      `INSERT INTO sync_cursors (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, new Date().toISOString()],
    );
  }
}

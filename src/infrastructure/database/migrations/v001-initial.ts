/**
 * Migraciones locales versionadas. Cada versión es idempotente y no
 * destructiva: nunca se eliminan columnas ni datos clínicos.
 * El número de versión se guarda en PRAGMA user_version.
 */

/** SQL v1: catálogo de métricas, sesiones y observaciones. */
export const MIGRATION_V1_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS metric_definitions (
    metric_id TEXT PRIMARY KEY,
    name_es TEXT NOT NULL,
    short_name_es TEXT,
    category TEXT NOT NULL CHECK (category IN ('daily_self_report','symptom','vital','hematology')),
    value_type TEXT NOT NULL CHECK (value_type IN ('ordinal_scale','integer','decimal','boolean')),
    canonical_unit TEXT,
    scale_min INTEGER,
    scale_max INTEGER,
    plausible_min REAL,
    plausible_max REAL,
    max_decimals INTEGER,
    definition_version INTEGER NOT NULL DEFAULT 1
  )`,

  `CREATE TABLE IF NOT EXISTS measurement_sessions (
    session_id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    mission_phase TEXT NOT NULL CHECK (mission_phase IN ('preflight','inflight','postflight')),
    recorded_at TEXT NOT NULL,
    recorded_local_date TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual_entry',
    note TEXT,
    sync_state TEXT NOT NULL DEFAULT 'local_only'
      CHECK (sync_state IN ('local_only','pending_sync','synced','sync_failed','conflict')),
    created_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_sessions_recorded_at
    ON measurement_sessions (recorded_at DESC)`,

  `CREATE TABLE IF NOT EXISTS observations (
    observation_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES measurement_sessions (session_id),
    metric_id TEXT NOT NULL REFERENCES metric_definitions (metric_id),
    value_original REAL NOT NULL,
    unit_original TEXT,
    value_normalized REAL,
    unit_normalized TEXT,
    observed_at TEXT NOT NULL,
    local_date TEXT NOT NULL,
    quality_state TEXT NOT NULL DEFAULT 'ok' CHECK (quality_state IN ('ok','suspect','invalid')),
    sync_state TEXT NOT NULL DEFAULT 'local_only'
      CHECK (sync_state IN ('local_only','pending_sync','synced','sync_failed','conflict')),
    created_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_observations_session
    ON observations (session_id)`,

  `CREATE INDEX IF NOT EXISTS idx_observations_metric_time
    ON observations (metric_id, observed_at)`,

  `INSERT INTO schema_meta (key, value) VALUES ('schema_started_at_utc', datetime('now'))
    ON CONFLICT(key) DO NOTHING`,
];

/** Catálogo semilla v1 (se genera desde el dominio, única fuente de verdad). */
export const MIGRATION_V1_CATALOG_SQL: readonly string[] = [
  `INSERT INTO metric_definitions
    (metric_id, name_es, short_name_es, category, value_type, canonical_unit,
     scale_min, scale_max, plausible_min, plausible_max, max_decimals, definition_version)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(metric_id) DO NOTHING`,
];

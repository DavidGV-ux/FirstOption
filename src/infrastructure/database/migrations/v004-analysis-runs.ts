/**
 * Migración v4: análisis reproducibles (Incremento 4).
 *
 * analysis_runs registra cada ejecución con su corte, método, versión,
 * parámetros, línea basal y limitaciones. analysis_input_observations
 * relaciona explícitamente las observaciones utilizadas (reproducibilidad).
 * forecast_points guarda proyecciones experimentales (Inc 5).
 *
 * Sin datos futuros en análisis retrospectivos: el corte (cutoff_at) se
 * registra y las consultas deben filtrar observed_at <= cutoff_at.
 */

export const MIGRATION_V4_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS analysis_definitions (
    analysis_definition_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version INTEGER NOT NULL,
    method TEXT NOT NULL,
    parameters_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS analysis_runs (
    analysis_run_id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    metric_id TEXT NOT NULL REFERENCES metric_definitions(metric_id),
    analysis_definition_id TEXT REFERENCES analysis_definitions(analysis_definition_id),
    cutoff_at TEXT NOT NULL,
    horizon_days INTEGER,
    method TEXT NOT NULL,
    method_version INTEGER NOT NULL DEFAULT 1,
    parameters_json TEXT NOT NULL DEFAULT '{}',
    baseline_id TEXT REFERENCES baseline_versions(baseline_id),
    status TEXT NOT NULL DEFAULT 'completed'
      CHECK (status IN ('completed','insufficient_data','inconclusive','not_comparable','unsupported','failed')),
    result_json TEXT,
    limitations TEXT,
    created_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_analysis_runs_subject_metric
    ON analysis_runs (subject_id, metric_id, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS analysis_input_observations (
    analysis_run_id TEXT NOT NULL REFERENCES analysis_runs(analysis_run_id) ON DELETE CASCADE,
    observation_id TEXT NOT NULL,
    metric_id TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    value_original REAL NOT NULL,
    unit_original TEXT NOT NULL,
    PRIMARY KEY (analysis_run_id, observation_id)
  )`,

  `CREATE TABLE IF NOT EXISTS forecast_points (
    forecast_point_id TEXT PRIMARY KEY,
    analysis_run_id TEXT NOT NULL REFERENCES analysis_runs(analysis_run_id) ON DELETE CASCADE,
    metric_id TEXT NOT NULL,
    target_date TEXT NOT NULL,
    estimate REAL NOT NULL,
    lower_bound REAL,
    upper_bound REAL,
    interval_level REAL,
    created_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_forecast_points_run
    ON forecast_points (analysis_run_id)`,
];

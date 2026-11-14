/**
 * Migración v3: laboratorio local (paneles, documentos privados y
 * líneas basales versionadas). Incremento 3.
 *
 * El panel se guarda como sesión local (fuente manual/lab_panel) y como
 * registro propio; los resultados se guardan en `lab_results` con su
 * conversión verificada; los documentos viven en el sandbox privado de
 * la app (metadatos en BD, contenido fuera de BD en el directorio privado).
 */

export const MIGRATION_V3_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS lab_panels (
    panel_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES measurement_sessions(session_id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL,
    mission_phase TEXT NOT NULL CHECK (mission_phase IN ('preflight','inflight','postflight')),
    collected_at TEXT NOT NULL,
    reported_at TEXT,
    laboratory TEXT,
    sample_id TEXT,
    method TEXT,
    reference_interval_original REAL,
    verification_state TEXT NOT NULL DEFAULT 'unverified'
      CHECK (verification_state IN ('unverified','verified','corrected')),
    note TEXT,
    created_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_lab_panels_subject
    ON lab_panels (subject_id, collected_at DESC)`,

  `CREATE TABLE IF NOT EXISTS lab_results (
    result_id TEXT PRIMARY KEY,
    panel_id TEXT NOT NULL REFERENCES lab_panels(panel_id) ON DELETE CASCADE,
    metric_id TEXT NOT NULL REFERENCES metric_definitions(metric_id),
    value_original REAL NOT NULL,
    unit_original TEXT NOT NULL,
    value_normalized REAL,
    unit_normalized TEXT,
    conversion_id TEXT,
    conversion_version INTEGER,
    quality_state TEXT NOT NULL DEFAULT 'ok' CHECK (quality_state IN ('ok','suspect','invalid')),
    created_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_lab_results_panel ON lab_results (panel_id)`,
  `CREATE INDEX IF NOT EXISTS idx_lab_results_metric_time ON lab_results (metric_id, created_at)`,

  `CREATE TABLE IF NOT EXISTS lab_documents (
    document_id TEXT PRIMARY KEY,
    panel_id TEXT REFERENCES lab_panels(panel_id) ON DELETE SET NULL,
    subject_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('lab_document','audio_note','other')),
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    retention_policy TEXT NOT NULL DEFAULT 'until_consent_revoked',
    created_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_lab_documents_subject
    ON lab_documents (subject_id, kind)`,

  `CREATE TABLE IF NOT EXISTS baseline_versions (
    baseline_id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    metric_id TEXT NOT NULL REFERENCES metric_definitions(metric_id),
    version INTEGER NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    method TEXT NOT NULL,
    method_version INTEGER NOT NULL DEFAULT 1,
    parameters_json TEXT NOT NULL DEFAULT '{}',
    conditions_json TEXT NOT NULL DEFAULT '{}',
    state TEXT NOT NULL DEFAULT 'provisional'
      CHECK (state IN ('provisional','reviewed','superseded')),
    source_observation_ids TEXT NOT NULL DEFAULT '[]',
    computed_at TEXT NOT NULL,
    computed_by TEXT NOT NULL DEFAULT 'client',
    UNIQUE (subject_id, metric_id, version)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_baselines_subject_metric
    ON baseline_versions (subject_id, metric_id, version DESC)`,
];

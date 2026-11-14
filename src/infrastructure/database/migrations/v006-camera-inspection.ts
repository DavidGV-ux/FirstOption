/**
 * Migración v6: Captura asistida por cámara para inspección pupilar.
 *
 * Tablas:
 * - camera_inspection_sessions: metadatos de sesión, dispositivo y fase.
 * - camera_captures: metadatos de la captura puntual (ojo, modo, calidad, privacidad).
 * - capture_quality_metrics: métricas computadas de señal (brillo, contraste, nitidez, movimiento).
 * - pupil_estimates: estimación pupilar relativa experimental (adimensional, con limitaciones explícitas).
 * - inspection_comparisons: comparación responsable entre capturas del mismo sujeto.
 *
 * Principio:
 * No se guardan imágenes ni buffers en SQLite. Si el usuario consiente guardar
 * la imagen, esta vive en el sandbox privado de la app y la BD solo registra su ruta y SHA-256.
 */

export const MIGRATION_V6_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS camera_inspection_sessions (
    session_id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    mission_phase TEXT NOT NULL CHECK (mission_phase IN ('preflight','inflight','postflight')),
    started_at TEXT NOT NULL,
    ended_at TEXT,
    device_model TEXT NOT NULL,
    os_version TEXT NOT NULL,
    app_version TEXT NOT NULL,
    camera_facing TEXT NOT NULL CHECK (camera_facing IN ('front','back')),
    sync_state TEXT NOT NULL DEFAULT 'local_only'
      CHECK (sync_state IN ('local_only','pending_sync','synced','sync_failed','conflict')),
    created_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_inspection_sessions_subject
    ON camera_inspection_sessions (subject_id, started_at DESC)`,

  `CREATE TABLE IF NOT EXISTS camera_captures (
    capture_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES camera_inspection_sessions(session_id) ON DELETE CASCADE,
    captured_at TEXT NOT NULL,
    eye_side TEXT NOT NULL CHECK (eye_side IN ('left','right')),
    capture_mode TEXT NOT NULL CHECK (capture_mode IN ('front_camera','back_camera','manual_only')),
    lighting_condition TEXT NOT NULL CHECK (lighting_condition IN ('low','adequate','excessive','direct_glare')),
    approximate_distance TEXT NOT NULL CHECK (approximate_distance IN ('close','medium','far')),
    image_saved INTEGER NOT NULL DEFAULT 0 CHECK (image_saved IN (0, 1)),
    image_storage_path TEXT,
    image_sha256 TEXT,
    quality_status TEXT NOT NULL CHECK (quality_status IN ('good','acceptable','limited','insufficient','rejected')),
    quality_notes TEXT,
    created_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_camera_captures_session
    ON camera_captures (session_id)`,

  `CREATE INDEX IF NOT EXISTS idx_camera_captures_time
    ON camera_captures (captured_at DESC)`,

  `CREATE TABLE IF NOT EXISTS capture_quality_metrics (
    capture_id TEXT PRIMARY KEY REFERENCES camera_captures(capture_id) ON DELETE CASCADE,
    brightness REAL NOT NULL,
    contrast REAL NOT NULL,
    sharpness REAL NOT NULL,
    motion_score REAL NOT NULL,
    blink_detected INTEGER NOT NULL CHECK (blink_detected IN (0, 1)),
    eye_open INTEGER NOT NULL CHECK (eye_open IN (0, 1)),
    eye_in_guide INTEGER NOT NULL CHECK (eye_in_guide IN (0, 1)),
    lighting_score REAL NOT NULL,
    resolution_width INTEGER NOT NULL,
    resolution_height INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS pupil_estimates (
    estimate_id TEXT PRIMARY KEY,
    capture_id TEXT NOT NULL REFERENCES camera_captures(capture_id) ON DELETE CASCADE,
    method_code TEXT NOT NULL,
    method_version TEXT NOT NULL,
    relative_scale REAL,
    confidence REAL NOT NULL,
    quality_status TEXT NOT NULL CHECK (quality_status IN ('good','acceptable','limited','insufficient','rejected')),
    limitations TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_pupil_estimates_capture
    ON pupil_estimates (capture_id)`,

  `CREATE TABLE IF NOT EXISTS inspection_comparisons (
    comparison_id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    baseline_capture_id TEXT NOT NULL REFERENCES camera_captures(capture_id),
    current_capture_id TEXT NOT NULL REFERENCES camera_captures(capture_id),
    relative_change REAL,
    direction TEXT NOT NULL CHECK (direction IN ('increase','decrease','no_clear_change')),
    confidence REAL NOT NULL,
    comparable INTEGER NOT NULL CHECK (comparable IN (0, 1)),
    limitations TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_inspection_comparisons_subject
    ON inspection_comparisons (subject_id, created_at DESC)`,
];

/**
 * Migración v2: sincronización offline-first.
 * - sync_outbox: cola transaccional de operaciones pendientes.
 *   Se escribe en la MISMA transacción que la medición: si el guardado
 *   local falla, no hay entrada de outbox huérfana, y viceversa.
 * - sync_cursors: posición de descarga controlada por el servidor.
 */

export const MIGRATION_V2_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS sync_outbox (
    outbox_id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('measurement_session','observation')),
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL DEFAULT 'upsert' CHECK (operation IN ('upsert')),
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TEXT,
    last_error TEXT,
    state TEXT NOT NULL DEFAULT 'pending'
      CHECK (state IN ('pending','failed','done')),
    UNIQUE (entity_type, entity_id)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_outbox_pending
    ON sync_outbox (state, created_at)`,

  `CREATE TABLE IF NOT EXISTS sync_cursors (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
];

/**
 * Migración v5: identidad local, autenticación local y trazabilidad (v004
 * del modelo proporcionado). No destructiva: crea tablas si no existen y
 * agrega columnas si faltan (SQLite no soporta ADD COLUMN IF NOT EXISTS en
 * versiones antiguas, así que se protege con try/catch en el aplicador).
 */

export const MIGRATION_V5_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS local_identities (
    local_subject_id TEXT PRIMARY KEY,
    remote_user_id TEXT,
    remote_email TEXT,
    device_id TEXT,
    device_name TEXT,
    linked_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_local_identities_remote_user
    ON local_identities (remote_user_id)`,

  `CREATE TABLE IF NOT EXISTS local_accounts (
    account_id TEXT PRIMARY KEY,
    remote_user_id TEXT,
    email TEXT,
    display_name TEXT,
    password_verifier TEXT,
    auth_provider TEXT NOT NULL DEFAULT 'supabase_email_password',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT,
    last_logout_at TEXT
  )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS idx_local_accounts_remote_user
    ON local_accounts (remote_user_id)
    WHERE remote_user_id IS NOT NULL`,

  `CREATE INDEX IF NOT EXISTS idx_local_accounts_email
    ON local_accounts (email)`,

  `CREATE TABLE IF NOT EXISTS local_sessions (
    session_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES local_accounts (account_id) ON DELETE CASCADE,
    remote_user_id TEXT,
    remote_session_id TEXT,
    started_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL,
    expires_at TEXT,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active','expired','revoked')),
    created_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_local_sessions_account
    ON local_sessions (account_id, started_at DESC)`,

  `CREATE INDEX IF NOT EXISTS idx_local_sessions_remote_user
    ON local_sessions (remote_user_id)`,

  `CREATE TABLE IF NOT EXISTS local_auth_events (
    event_id TEXT PRIMARY KEY,
    account_id TEXT REFERENCES local_accounts (account_id) ON DELETE SET NULL,
    local_subject_id TEXT REFERENCES local_identities (local_subject_id) ON DELETE SET NULL,
    event_type TEXT NOT NULL
      CHECK (event_type IN (
        'local_account_created','remote_sign_in','remote_sign_up','remote_sign_out',
        'remote_session_expired','local_sign_in','local_sign_out',
        'identity_linked','identity_unlinked'
      )),
    occurred_at TEXT NOT NULL,
    detail TEXT
  )`,

  `CREATE INDEX IF NOT EXISTS idx_local_auth_events_account
    ON local_auth_events (account_id, occurred_at DESC)`,

  `CREATE INDEX IF NOT EXISTS idx_local_auth_events_subject
    ON local_auth_events (local_subject_id, occurred_at DESC)`,

  `CREATE TABLE IF NOT EXISTS local_audit_events (
    event_id TEXT PRIMARY KEY,
    local_subject_id TEXT REFERENCES local_identities (local_subject_id) ON DELETE SET NULL,
    actor_local_subject_id TEXT REFERENCES local_identities (local_subject_id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    occurred_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_local_audit_subject_time
    ON local_audit_events (local_subject_id, occurred_at DESC)`,

  `CREATE INDEX IF NOT EXISTS idx_local_audit_actor_time
    ON local_audit_events (actor_local_subject_id, occurred_at DESC)`,
];

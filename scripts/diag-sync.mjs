#!/usr/bin/env node
/**
 * Diagnóstico de sincronización (SQLite local, NO cifrado).
 * Uso: node scripts/diag-sync.mjs /ruta/a/orbita_salud_local.db
 *
 * Nota: si la app corre en dev build con SQLCipher (cifrado), este script
 * no puede abrir la base con node:sqlite. En ese caso inspecciona desde la
 * app/dispositivo o exporta una copia descifrada según tu flujo de desarrollo.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('Uso: node scripts/diag-sync.mjs /ruta/a/la-base.db');
  process.exit(1);
}
if (!existsSync(dbPath)) {
  console.error(`No existe el archivo: ${dbPath}`);
  process.exit(1);
}

let db;
try {
  // Abrir en modo lectura para no modificar datos.
  db = new DatabaseSync(dbPath, { readOnly: true });
} catch (e) {
  console.error('No se pudo abrir la base (¿cifrada/SQLCipher o en uso?).', e instanceof Error ? e.message : e);
  process.exit(1);
}

function all(sql, params = []) {
  try {
    return db.prepare(sql).all(...params);
  } catch (e) {
    return { __error: e instanceof Error ? e.message : String(e), sql };
  }
}
function first(sql, params = []) {
  try {
    return db.prepare(sql).get(...params) ?? null;
  } catch (e) {
    return { __error: e instanceof Error ? e.message : String(e), sql };
  }
}

const report = {
  dbPath,
  pragma_user_version: first('select * from pragma_user_version'),
  observations_symptom_nauseas: all(
    `select observation_id, session_id, metric_id, value_original, observed_at, sync_state, created_at
     from observations where metric_id = 'symptom_nauseas'`,
  ),
  observations_symptom_nausea: all(
    `select observation_id, session_id, metric_id, value_original, observed_at, sync_state, created_at
     from observations where metric_id = 'symptom_nausea'`,
  ),
  outbox_pending_failed: all(
    `select outbox_id, entity_type, entity_id, operation, state, attempts, last_error, created_at, payload
     from sync_outbox where state in ('pending','failed') order by created_at asc`,
  ),
  outbox_contains_symptom_nauseas: all(
    `select outbox_id, entity_type, entity_id, state, attempts, last_error, payload
     from sync_outbox where payload like '%symptom_nauseas%'`,
  ),
  pending_metrics: all(
    `select o.metric_id, count(*) as total, min(o.observed_at) primera_observacion, max(o.observed_at) ultima_observacion
     from observations o
     where o.sync_state in ('local_only','pending_sync','sync_failed','conflict')
     group by o.metric_id order by total desc`,
  ),
  sessions_not_synced: all(
    `select session_id, subject_id, mission_phase, recorded_at, source, sync_state, created_at
     from measurement_sessions
     where sync_state in ('local_only','pending_sync','sync_failed','conflict')
     order by created_at asc`,
  ),
  recent_errors: all(
    `select outbox_id, entity_type, entity_id, state, attempts, last_error, created_at
     from sync_outbox where last_error is not null order by created_at desc limit 20`,
  ),
};

console.log(JSON.stringify(report, null, 2));

const badObs = Array.isArray(report.observations_symptom_nauseas) ? report.observations_symptom_nauseas.length : -1;
const badOutbox = Array.isArray(report.outbox_contains_symptom_nauseas) ? report.outbox_contains_symptom_nauseas.length : -1;
const uv = report.pragma_user_version && !report.pragma_user_version.__error ? report.pragma_user_version.user_version : 'desconocida';

console.error('\n--- Resumen ---');
console.error(`user_version: ${uv} (esperado >= 7 si la app actualizada ya inició)`);
console.error(`observations con metric_id='symptom_nauseas': ${badObs}`);
console.error(`sync_outbox con payload '%symptom_nauseas%': ${badOutbox}`);
if (badObs === 0 && badOutbox === 0) {
  console.error('No hay restos locales de "symptom_nauseas". Si el error persiste, revisa outbox_pending_failed/recent_errors/pending_metrics (puede ser otra métrica o causa).');
} else {
  console.error('Hay datos legados locales. Recarga la app con la migración v7 aplicada y vuelve a sincronizar.');
}

try { db.close(); } catch { /* ignore */ }

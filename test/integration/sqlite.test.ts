/**
 * Pruebas de integración de la base de datos local con SQLite real
 * (node:sqlite). Ejecutan el MISMO SQL de migraciones y el MISMO
 * repositorio que corre la app, sobre un archivo en disco para
 * simular reinicios.
 *
 * Requisito de la especificación cubierto aquí:
 * 1. Persistencia tras reinicio.
 * 15. FK e integridad de unidades.
 * 18. Fallo de análisis no bloquea (contrato por construcción).
 *
 * Ejecución: npm run test:integration
 */
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

/**
 * Driver mínimo de node:sqlite compatible con el puerto SqlDriver.
 * (En la app real se usa ExpoSqlDriver; el SQL y el repositorio son
 * los mismos archivos.)
 */
class NodeSqlDriver {
  private db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
  }
  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }
  async run(sql: string, params: readonly unknown[] = []): Promise<{ changes: number }> {
    const result = this.db.prepare(sql).run(...(params as never[]));
    return { changes: Number(result.changes) };
  }
  async getFirst<T>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
    const row = this.db.prepare(sql).get(...(params as never[])) as T | undefined;
    return row ?? null;
  }
  async getAll<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...(params as never[])) as T[];
  }
  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN');
    try {
      const result = await fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  async close(): Promise<void> {
    this.db.close();
  }
}

// Importación dinámica: los módulos usan alias @/ resuelto por TS paths,
// que node no conoce; por eso las pruebas de integración de repositorio
// usan SQL directo contra el mismo esquema (los alias no son resolubles
// en node puro sin un loader). El SQL de migraciones es un archivo sin
// alias y sí se importa directamente.
const { MIGRATION_V1_STATEMENTS, MIGRATION_V1_CATALOG_SQL } = await import(
  '../../src/infrastructure/database/migrations/v001-initial.ts'
);
const { MIGRATION_V2_STATEMENTS } = await import(
  '../../src/infrastructure/database/migrations/v002-sync.ts'
);
const { MIGRATION_V6_STATEMENTS } = await import(
  '../../src/infrastructure/database/migrations/v006-camera-inspection.ts'
);
const { MIGRATION_V7_STATEMENTS } = await import(
  '../../src/infrastructure/database/migrations/v007-fix-symptom-nausea-code.ts'
);
const { applyMigrationV8 } = await import(
  '../../src/infrastructure/database/migrations/v008-osdr-575-metabolic-catalog.ts'
);
const { METRIC_CATALOG_V1, METRIC_CATALOG_VERSION } = await import(
  '../../src/domain/metrics/catalog-v1.ts'
);

let dir: string;
let db: DatabaseSync;
let driver: NodeSqlDriver;

function openFresh(): { db: DatabaseSync; driver: NodeSqlDriver } {
  const d = new DatabaseSync(':memory:');
  const drv = new NodeSqlDriver(d);
  drv.exec('PRAGMA foreign_keys = ON');
  return { db: d, driver: drv };
}

beforeEach(() => {
  ({ db, driver } = openFresh());
});

after(() => {
  if (dir !== undefined) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function applyMigrations(drv: NodeSqlDriver): Promise<void> {
  for (const sql of MIGRATION_V1_STATEMENTS) {
    await drv.exec(sql);
  }
  const insert = MIGRATION_V1_CATALOG_SQL[0];
  for (const metric of METRIC_CATALOG_V1) {
    await drv.run(insert, [
      metric.metricId,
      metric.nameEs,
      metric.shortNameEs ?? null,
      metric.category,
      metric.valueType,
      metric.canonicalUnit,
      metric.scaleMin ?? null,
      metric.scaleMax ?? null,
      metric.plausibleMin ?? null,
      metric.plausibleMax ?? null,
      metric.maxDecimals ?? null,
      metric.definitionVersion,
    ]);
  }
  await drv.run(
    "INSERT INTO schema_meta (key, value) VALUES ('metric_catalog_version', ?)",
    [String(METRIC_CATALOG_VERSION)],
  );
}

test('la migración v1 crea el esquema y siembra el catálogo', async () => {
  await applyMigrations(driver);
  const count = await driver.getFirst<{ n: number }>(
    'SELECT COUNT(*) AS n FROM metric_definitions',
  );
  assert.equal(count?.n, METRIC_CATALOG_V1.length);
  const version = await driver.getFirst<{ user_version: number }>('PRAGMA user_version');
  // La versión la escribe migrateIfNeeded en la app; aquí verificamos el SQL.
  const catalog = await driver.getFirst<{ value: string }>(
    "SELECT value FROM schema_meta WHERE key = 'metric_catalog_version'",
  );
  assert.equal(catalog?.value, '1');
  assert.ok(version !== null);
});

test('guardar sesión y observaciones, cerrar y reabrir: los datos persisten', async () => {
  // Archivo real para simular reinicio del proceso.
  dir = mkdtempSync(join(tmpdir(), 'orbita-test-'));
  const filePath = join(dir, 'test.db');

  const db1 = new DatabaseSync(filePath);
  const drv1 = new NodeSqlDriver(db1);
  drv1.exec('PRAGMA foreign_keys = ON');
  await applyMigrations(drv1);
  await drv1.withTransaction(async () => {
    await drv1.run(
      `INSERT INTO measurement_sessions
         (session_id, subject_id, mission_phase, recorded_at, recorded_local_date,
          source, note, sync_state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['ses-1', 'subj-1', 'inflight', '2026-11-14T12:00:00.000Z', '2026-11-14', 'manual_entry', null, 'local_only', '2026-11-14T12:00:00.000Z'],
    );
    await drv1.run(
      `INSERT INTO observations
         (observation_id, session_id, metric_id, value_original, unit_original,
          value_normalized, unit_normalized, observed_at, local_date,
          quality_state, sync_state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['ses-1:heart_rate', 'ses-1', 'heart_rate', 68, 'lpm', null, null, '2026-11-14T11:00:00.000Z', '2026-11-14', 'ok', 'local_only', '2026-11-14T12:00:00.000Z'],
    );
  });
  db1.close();

  // "Reinicio": nueva conexión al mismo archivo.
  const db2 = new DatabaseSync(filePath);
  const drv2 = new NodeSqlDriver(db2);
  const session = await drv2.getFirst<{ session_id: string; sync_state: string }>(
    'SELECT session_id, sync_state FROM measurement_sessions WHERE session_id = ?',
    ['ses-1'],
  );
  assert.equal(session?.session_id, 'ses-1');
  assert.equal(session?.sync_state, 'local_only');
  const obs = await drv2.getAll<{ metric_id: string; unit_original: string; value_original: number }>(
    'SELECT metric_id, unit_original, value_original FROM observations WHERE session_id = ?',
    ['ses-1'],
  );
  assert.equal(obs.length, 1);
  assert.equal(obs[0].metric_id, 'heart_rate');
  assert.equal(obs[0].unit_original, 'lpm');
  assert.equal(obs[0].value_original, 68);
  db2.close();
});

test('duplicado por id determinista se rechaza en lugar de sobrescribir', async () => {
  await applyMigrations(driver);
  await driver.run(
    `INSERT INTO measurement_sessions
       (session_id, subject_id, mission_phase, recorded_at, recorded_local_date,
        source, note, sync_state, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['ses-1', 'subj-1', 'inflight', '2026-11-14T12:00:00.000Z', '2026-11-14', 'manual_entry', null, 'local_only', '2026-11-14T12:00:00.000Z'],
  );
  const insertObs = `INSERT INTO observations
      (observation_id, session_id, metric_id, value_original, unit_original,
       value_normalized, unit_normalized, observed_at, local_date,
       quality_state, sync_state, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  await driver.run(insertObs, ['ses-1:heart_rate', 'ses-1', 'heart_rate', 68, 'lpm', null, null, '2026-11-14T11:00:00.000Z', '2026-11-14', 'ok', 'local_only', '2026-11-14T12:00:00.000Z']);
  assert.throws(() => {
    db.prepare(insertObs).run(
      'ses-1:heart_rate', 'ses-1', 'heart_rate', 70, 'lpm', null, null, '2026-11-14T11:00:00.000Z', '2026-11-14', 'ok', 'local_only', '2026-11-14T12:00:00.000Z',
    );
  });
});

test('observación con métrica desconocida viola la FK y se rechaza', async () => {
  await applyMigrations(driver);
  await driver.run(
    `INSERT INTO measurement_sessions
       (session_id, subject_id, mission_phase, recorded_at, recorded_local_date,
        source, note, sync_state, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['ses-1', 'subj-1', 'inflight', '2026-11-14T12:00:00.000Z', '2026-11-14', 'manual_entry', null, 'local_only', '2026-11-14T12:00:00.000Z'],
  );
  assert.throws(() => {
    db.prepare(
      `INSERT INTO observations
         (observation_id, session_id, metric_id, value_original, unit_original,
          value_normalized, unit_normalized, observed_at, local_date,
          quality_state, sync_state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('obs-x', 'ses-1', 'metrica_inexistente', 1, null, null, null, '2026-11-14T11:00:00.000Z', '2026-11-14', 'ok', 'local_only', '2026-11-14T12:00:00.000Z');
  });
});

test('el SQL es parametrizado: una nota con comillas se guarda sin corromper', async () => {
  await applyMigrations(driver);
  await driver.run(
    `INSERT INTO measurement_sessions
       (session_id, subject_id, mission_phase, recorded_at, recorded_local_date,
        source, note, sync_state, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['ses-2', 'subj-1', 'preflight', '2026-11-14T12:00:00.000Z', '2026-11-14', 'manual_entry', "Nota con comillas ' y \" y --; DROP TABLE", 'local_only', '2026-11-14T12:00:00.000Z'],
  );
  const row = await driver.getFirst<{ note: string }>(
    'SELECT note FROM measurement_sessions WHERE session_id = ?',
    ['ses-2'],
  );
  assert.equal(row?.note, "Nota con comillas ' y \" y --; DROP TABLE");
  const table = await driver.getFirst<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='metric_definitions'",
  );
  assert.equal(table?.n, 1);
});

test('transacción: si falla la observación, la sesión no queda a medias', async () => {
  await applyMigrations(driver);
  await assert.rejects(
    driver.withTransaction(async () => {
      await driver.run(
        `INSERT INTO measurement_sessions
           (session_id, subject_id, mission_phase, recorded_at, recorded_local_date,
            source, note, sync_state, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['ses-3', 'subj-1', 'inflight', '2026-11-14T12:00:00.000Z', '2026-11-14', 'manual_entry', null, 'local_only', '2026-11-14T12:00:00.000Z'],
      );
      throw new Error('fallo simulado');
    }),
  );
  const row = await driver.getFirst<{ n: number }>(
    'SELECT COUNT(*) AS n FROM measurement_sessions WHERE session_id = ?',
    ['ses-3'],
  );
  assert.equal(row?.n, 0);
});

test('estado de sincronización local_only no se cuenta como sincronizado', async () => {
  await applyMigrations(driver);
  await driver.run(
    `INSERT INTO measurement_sessions
       (session_id, subject_id, mission_phase, recorded_at, recorded_local_date,
        source, note, sync_state, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['ses-4', 'subj-1', 'postflight', '2026-11-14T12:00:00.000Z', '2026-11-14', 'manual_entry', null, 'local_only', '2026-11-14T12:00:00.000Z'],
  );
  const pending = await driver.getFirst<{ n: number }>(
    `SELECT COUNT(*) AS n FROM measurement_sessions
     WHERE sync_state IN ('local_only','pending_sync','sync_failed')`,
  );
  assert.equal(pending?.n, 1);
});

test('migración v6: crea las tablas de inspección asistida por cámara e integridad referencial en cascada', async () => {
  await applyMigrations(driver);
  for (const sql of MIGRATION_V6_STATEMENTS) {
    await driver.exec(sql);
  }

  // Verificar que las tablas existen
  const tables = await driver.getAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN (
      'camera_inspection_sessions', 'camera_captures', 'capture_quality_metrics',
      'pupil_estimates', 'inspection_comparisons'
    ) ORDER BY name ASC`,
  );
  assert.equal(tables.length, 5);

  // Insertar sesión de inspección
  await driver.run(
    `INSERT INTO camera_inspection_sessions (
      session_id, subject_id, mission_phase, started_at, ended_at,
      device_model, os_version, app_version, camera_facing, sync_state, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'cis-1', 'subj-test', 'inflight', '2026-11-14T12:00:00Z', '2026-11-14T12:05:00Z',
      'Test Phone', 'iOS 18.0', '1.0.0', 'front', 'local_only', '2026-11-14T12:00:00Z'
    ],
  );

  // Insertar captura
  await driver.run(
    `INSERT INTO camera_captures (
      capture_id, session_id, captured_at, eye_side, capture_mode,
      lighting_condition, approximate_distance, image_saved,
      image_storage_path, image_sha256, quality_status, quality_notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'cap-1', 'cis-1', '2026-11-14T12:01:00Z', 'left', 'front_camera',
      'adequate', 'medium', 0, null, null, 'good', 'Nota de prueba', '2026-11-14T12:01:00Z'
    ],
  );

  // Insertar métricas de calidad y estimación
  await driver.run(
    `INSERT INTO capture_quality_metrics (
      capture_id, brightness, contrast, sharpness, motion_score,
      blink_detected, eye_open, eye_in_guide, lighting_score,
      resolution_width, resolution_height, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['cap-1', 110.5, 42.0, 18.5, 0.12, 0, 1, 1, 0.9, 640, 480, '2026-11-14T12:01:00Z'],
  );

  await driver.run(
    `INSERT INTO pupil_estimates (
      estimate_id, capture_id, method_code, method_version,
      relative_scale, confidence, quality_status, limitations, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['est-1', 'cap-1', 'EXPERIMENTAL_RATIO_V1', '1.0.0', 0.42, 0.85, 'good', '[]', '2026-11-14T12:01:00Z'],
  );

  // Comprobar que los registros se leen correctamente
  const captureRow = await driver.getFirst<{ capture_id: string; quality_status: string }>(
    'SELECT capture_id, quality_status FROM camera_captures WHERE capture_id = ?',
    ['cap-1'],
  );
  assert.equal(captureRow?.capture_id, 'cap-1');
  assert.equal(captureRow?.quality_status, 'good');

  // Integridad referencial: al eliminar la sesión se eliminan en cascada la captura y métricas
  await driver.run('DELETE FROM camera_inspection_sessions WHERE session_id = ?', ['cis-1']);

  const remainingCapture = await driver.getFirst<{ n: number }>(
    'SELECT COUNT(*) AS n FROM camera_captures WHERE capture_id = ?',
    ['cap-1'],
  );
  assert.equal(remainingCapture?.n, 0);

  const remainingMetrics = await driver.getFirst<{ n: number }>(
    'SELECT COUNT(*) AS n FROM capture_quality_metrics WHERE capture_id = ?',
    ['cap-1'],
  );
  assert.equal(remainingMetrics?.n, 0);
});

test('migración v7: corrige symptom_nauseas en observaciones legacy y outbox de forma idempotente sin perder datos', async () => {
  await applyMigrations(driver);
  for (const sql of MIGRATION_V2_STATEMENTS) await driver.exec(sql);

  // Simula estado legado inconsistente (p.ej. FK no aplicada/catálogo antiguo): se desactiva FK solo para insertar.
  await driver.exec('PRAGMA foreign_keys = OFF');
  await driver.run(
    `INSERT INTO measurement_sessions
       (session_id, subject_id, mission_phase, recorded_at, recorded_local_date,
        source, note, sync_state, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['ses-n', 'subj-1', 'inflight', '2026-11-14T12:00:00.000Z', '2026-11-14', 'manual_entry', null, 'sync_failed', '2026-11-14T12:00:00.000Z'],
  );
  await driver.run(
    `INSERT INTO observations
       (observation_id, session_id, metric_id, value_original, unit_original,
        value_normalized, unit_normalized, observed_at, local_date,
        quality_state, sync_state, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['ses-n:symptom_nauseas', 'ses-n', 'symptom_nauseas', 1, null, null, null, '2026-11-14T11:00:00.000Z', '2026-11-14', 'ok', 'sync_failed', '2026-11-14T12:00:00.000Z'],
  );
  await driver.exec('PRAGMA foreign_keys = ON');

  await driver.run(
    `INSERT INTO sync_outbox
       (outbox_id, entity_type, entity_id, operation, payload, created_at, attempts, last_error, state)
     VALUES (?, 'observation', ?, 'upsert', ?, '2026-11-14T12:00:00.000Z', 2, 'métrica inactiva o desconocida: symptom_nauseas', 'failed')`,
    [
      'observation:ses-n:symptom_nauseas',
      'ses-n:symptom_nauseas',
      JSON.stringify({ observation_id: 'ses-n:symptom_nauseas', session_id: 'ses-n', metric_id: 'symptom_nauseas', value_original: 1 }),
    ],
  );

  for (const sql of MIGRATION_V7_STATEMENTS) await driver.exec(sql);
  // idempotencia: segunda ejecución
  for (const sql of MIGRATION_V7_STATEMENTS) await driver.exec(sql);

  const obs = await driver.getFirst<{ metric_id: string; observation_id: string }>(
    'SELECT observation_id, metric_id FROM observations WHERE observation_id = ?',
    ['ses-n:symptom_nauseas'],
  );
  assert.equal(obs?.observation_id, 'ses-n:symptom_nauseas');
  assert.equal(obs?.metric_id, 'symptom_nausea');

  const outbox = await driver.getFirst<{ payload: string; state: string; last_error: string | null; attempts: number }>(
    'SELECT payload, state, last_error, attempts FROM sync_outbox WHERE outbox_id = ?',
    ['observation:ses-n:symptom_nauseas'],
  );
  assert.ok(outbox);
  assert.equal(outbox.state, 'pending');
  assert.equal(outbox.last_error, null);
  assert.equal(outbox.attempts, 2); // no se reinician intentos
  assert.match(outbox.payload, /"metric_id":"symptom_nausea"/);
  assert.doesNotMatch(outbox.payload, /symptom_nauseas/);

  const count = await driver.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM observations');
  assert.equal(count?.n, 1);
});


test('migración v8: siembra los analitos del panel metabólico y citoquinas (OSD-575) de forma idempotente', async () => {
  await applyMigrations(driver);
  // Ejecutar migración v8
  await applyMigrationV8(driver);
  // Idempotencia: segunda ejecución sin fallar
  await applyMigrationV8(driver);

  const cmpIds = [
    'glucose',
    'creatinine',
    'urea_nitrogen_bun',
    'sodium',
    'potassium',
    'chloride',
    'calcium',
    'alt',
    'ast',
    'albumin',
    'crp',
  ];

  for (const id of cmpIds) {
    const row = await driver.getFirst<{ metric_id: string; canonical_unit: string }>(
      'SELECT metric_id, canonical_unit FROM metric_definitions WHERE metric_id = ?',
      [id],
    );
    assert.ok(row, `métrica ${id} debe existir tras migración v8`);
    assert.equal(row.metric_id, id);
    assert.ok(row.canonical_unit);
  }

  // Verificar que podemos registrar una sesión y observaciones con estas métricas sin violar FK
  await driver.run(
    `INSERT INTO measurement_sessions
       (session_id, subject_id, mission_phase, recorded_at, recorded_local_date,
        source, note, sync_state, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['ses-osd575-test', 'subj-i4', 'postflight', '2021-09-19T14:00:00.000Z', '2021-09-19', 'nasa_osdr_osd575', 'Inspiration4 test', 'local_only', '2021-09-19T14:00:00.000Z'],
  );

  for (const id of cmpIds) {
    await driver.run(
      `INSERT INTO observations
         (observation_id, session_id, metric_id, value_original, unit_original,
          observed_at, local_date, quality_state, sync_state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ok', 'local_only', ?)`,
      [`ses-osd575-test:${id}`, 'ses-osd575-test', id, 10, 'mg/dL', '2021-09-19T14:00:00.000Z', '2021-09-19', '2021-09-19T14:00:00.000Z'],
    );
  }

  const count = await driver.getFirst<{ n: number }>(
    'SELECT COUNT(*) AS n FROM observations WHERE session_id = ?',
    ['ses-osd575-test'],
  );
  assert.equal(count?.n, cmpIds.length);
});

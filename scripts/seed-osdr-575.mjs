#!/usr/bin/env node
/**
 * Sembrador de datos espaciales NASA OSDR OSD-575 (SpaceX Inspiration4)
 * para pruebas y desarrollo en SQLite local (no cifrado).
 *
 * Uso:
 *   node scripts/seed-osdr-575.mjs /ruta/a/orbita_salud_local.db [C001|C002|C003|C004|ALL]
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = process.argv[2];
const targetCrew = (process.argv[3] || 'C001').toUpperCase();

if (!dbPath) {
  console.log('Uso: node scripts/seed-osdr-575.mjs <ruta-a-base.db> [C001|C002|C003|C004|ALL]');
  process.exit(1);
}

if (!existsSync(dbPath)) {
  console.error(`Error: No existe el archivo de base de datos en: ${dbPath}`);
  process.exit(1);
}

let db;
try {
  db = new DatabaseSync(dbPath);
} catch (e) {
  console.error('No se pudo abrir la base de datos (¿cifrada con SQLCipher o bloqueada?).', e.message);
  process.exit(1);
}

// Cargar registros empaquetados desde osd-575-data.ts o json
let records = [];
try {
  const scratchPath = resolve(__dirname, '../src/infrastructure/nasa-osdr/osd-575-data.ts');
  const content = readFileSync(scratchPath, 'utf8');
  const jsonMatch = content.match(/OSD_575_RECORDS:\s*readonly\s*Osd575Record\[\]\s*=\s*(\[[\s\S]*?\])\s*as const;/);
  if (jsonMatch) {
    records = JSON.parse(jsonMatch[1]);
  } else {
    throw new Error('No se pudo parsear el bloque de registros en osd-575-data.ts');
  }
} catch (err) {
  console.error('Error cargando registros OSD-575:', err.message);
  process.exit(1);
}

console.log(`\n🚀 Sembrador NASA OSDR OSD-575 (SpaceX Inspiration4)`);
console.log(`Base de datos: ${dbPath}`);
console.log(`Tripulante(s): ${targetCrew}`);
console.log(`Registros totales disponibles: ${records.length}`);

// 1. Verificar si existen las métricas en metric_definitions
const insertMetric = db.prepare(`
  INSERT OR IGNORE INTO metric_definitions (
    metric_id, name_es, short_name_es, category, value_type,
    canonical_unit, scale_min, scale_max, plausible_min, plausible_max,
    max_decimals, definition_version
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const METRIC_DEFS = [
  ['glucose', 'Glucosa sérica', 'Glucosa', 'hematology', 'decimal', 'mg/dL', null, null, 20, 600, 1, 1],
  ['creatinine', 'Creatinina sérica', 'Creatinina', 'hematology', 'decimal', 'mg/dL', null, null, 0.1, 15, 2, 1],
  ['urea_nitrogen_bun', 'Nitrógeno ureico en sangre (BUN)', 'BUN', 'hematology', 'decimal', 'mg/dL', null, null, 1, 150, 1, 1],
  ['sodium', 'Sodio sérico', 'Na⁺', 'hematology', 'decimal', 'mmol/L', null, null, 110, 175, 1, 1],
  ['potassium', 'Potasio sérico', 'K⁺', 'hematology', 'decimal', 'mmol/L', null, null, 1.5, 9.0, 2, 1],
  ['chloride', 'Cloro sérico', 'Cl⁻', 'hematology', 'decimal', 'mmol/L', null, null, 70, 140, 1, 1],
  ['calcium', 'Calcio sérico', 'Ca²⁺', 'hematology', 'decimal', 'mg/dL', null, null, 4.0, 18.0, 2, 1],
  ['alt', 'Alanina aminotransferasa (ALT)', 'ALT', 'hematology', 'integer', 'U/L', null, null, 1, 1000, null, 1],
  ['ast', 'Aspartato aminotransferasa (AST)', 'AST', 'hematology', 'integer', 'U/L', null, null, 1, 1000, null, 1],
  ['albumin', 'Albúmina sérica', 'Albúmina', 'hematology', 'decimal', 'g/dL', null, null, 1.0, 7.0, 2, 1],
  ['crp', 'Proteína C reactiva (PCR)', 'PCR', 'hematology', 'decimal', 'mg/L', null, null, 0, 300, 2, 1],
];

for (const m of METRIC_DEFS) {
  insertMetric.run(...m);
}
console.log('✓ Definiciones de métricas verificadas e insertadas.');

// 2. Filtrar registros según crewId
const filtered = targetCrew === 'ALL'
  ? records
  : records.filter((r) => r.crewId === targetCrew);

if (filtered.length === 0) {
  console.error(`No se encontraron registros para el tripulante: ${targetCrew}`);
  process.exit(1);
}

// 3. Insertar sesiones y observaciones
const insertSession = db.prepare(`
  INSERT OR IGNORE INTO measurement_sessions (
    session_id, subject_id, mission_phase, recorded_at, recorded_local_date,
    source, note, sync_state, created_at, client_request_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'local_only', ?, ?)
`);

const insertObs = db.prepare(`
  INSERT OR IGNORE INTO observations (
    observation_id, session_id, metric_id, value_original, unit_original,
    observed_at, local_date, quality_state, sync_state, created_at, client_request_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ok', 'local_only', ?, ?)
`);

let insertedSessions = 0;
let insertedObs = 0;

for (const rec of filtered) {
  const tpClean = rec.timepoint.replace('+', 'plus').replace('-', 'minus');
  const sessionId = `osd575-${rec.crewId.toLowerCase()}-${tpClean}`;
  const subjectId = `astronaut_${rec.crewId.toLowerCase()}`;
  const note = `NASA OSDR OSD-575 Inspiration4 (${rec.crewId}, ${rec.timepoint})`;

  insertSession.run(
    sessionId,
    subjectId,
    rec.missionPhase,
    rec.observedAt,
    rec.localDate,
    'nasa_osdr_osd575',
    note,
    rec.observedAt,
    sessionId
  );
  insertedSessions++;

  for (const [metricId, val] of Object.entries(rec.values)) {
    const obsId = `${sessionId}:${metricId}`;
    const def = METRIC_DEFS.find((d) => d[0] === metricId);
    const unit = def ? def[5] : null;

    insertObs.run(
      obsId,
      sessionId,
      metricId,
      val,
      unit,
      rec.observedAt,
      rec.localDate,
      rec.observedAt,
      obsId
    );
    insertedObs++;
  }
}

console.log(`\n🎉 Ingestión completada:`);
console.log(` - Sesiones procesadas: ${insertedSessions}`);
console.log(` - Observaciones procesadas: ${insertedObs}`);
console.log(`\nPara ver los datos en la app, abre la pestaña 'Estado' o 'Historial'.`);

import type { SqlDriver } from '../driver';
import { MIGRATION_V1_STATEMENTS, MIGRATION_V1_CATALOG_SQL } from './v001-initial';
import { MIGRATION_V2_STATEMENTS } from './v002-sync';
import { MIGRATION_V3_STATEMENTS } from './v003-lab-baselines-documents';
import { MIGRATION_V4_STATEMENTS } from './v004-analysis-runs';
import { MIGRATION_V5_STATEMENTS } from './v005-local-auth';
import { MIGRATION_V6_STATEMENTS } from './v006-camera-inspection';
import { MIGRATION_V7_STATEMENTS } from './v007-fix-symptom-nausea-code';
import { applyMigrationV8 } from './v008-osdr-575-metabolic-catalog';
import { METRIC_CATALOG_V1, METRIC_CATALOG_VERSION } from '@/domain/metrics/catalog-v1';

export interface Migration {
  version: number;
  apply(driver: SqlDriver): Promise<void>;
}

/**
 * Registro de migraciones. Para agregar una versión: añadir un objeto
 * con el siguiente número; nunca editar versiones ya aplicadas.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    async apply(driver) {
      for (const sql of MIGRATION_V1_STATEMENTS) {
        await driver.exec(sql);
      }
      const insert = MIGRATION_V1_CATALOG_SQL[0];
      for (const metric of METRIC_CATALOG_V1) {
        await driver.run(insert, [
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
      await driver.run(
        "INSERT INTO schema_meta (key, value) VALUES ('metric_catalog_version', ?) " +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [String(METRIC_CATALOG_VERSION)],
      );
    },
  },
  {
    version: 2,
    async apply(driver) {
      for (const sql of MIGRATION_V2_STATEMENTS) {
        await driver.exec(sql);
      }
    },
  },
  {
    version: 3,
    async apply(driver) {
      for (const sql of MIGRATION_V3_STATEMENTS) {
        await driver.exec(sql);
      }
    },
  },
  {
    version: 4,
    async apply(driver) {
      for (const sql of MIGRATION_V4_STATEMENTS) {
        await driver.exec(sql);
      }
    },
  },
  {
    version: 5,
    async apply(driver) {
      for (const sql of MIGRATION_V5_STATEMENTS) {
        await driver.exec(sql);
      }
      // Columnas nuevas en tablas existentes (idempotente vía try/catch).
      const alters = [
        `ALTER TABLE measurement_sessions ADD COLUMN remote_user_id TEXT`,
        `ALTER TABLE measurement_sessions ADD COLUMN client_request_id TEXT`,
        `ALTER TABLE observations ADD COLUMN remote_user_id TEXT`,
        `ALTER TABLE observations ADD COLUMN client_request_id TEXT`,
      ];
      for (const sql of alters) {
        try {
          await driver.exec(sql);
        } catch {
          // Columna ya existe: ignorar.
        }
      }
      // Índices únicos (idempotentes).
      const indexes = [
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_client_request ON measurement_sessions (client_request_id) WHERE client_request_id IS NOT NULL`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_observations_client_request ON observations (client_request_id) WHERE client_request_id IS NOT NULL`,
        `CREATE INDEX IF NOT EXISTS idx_sessions_remote_user ON measurement_sessions (remote_user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_observations_remote_user ON observations (remote_user_id)`,
      ];
      for (const sql of indexes) {
        await driver.exec(sql);
      }
    },
  },
  {
    version: 6,
    async apply(driver) {
      for (const sql of MIGRATION_V6_STATEMENTS) {
        await driver.exec(sql);
      }
    },
  },
  {
    version: 7,
    async apply(driver) {
      for (const sql of MIGRATION_V7_STATEMENTS) {
        await driver.exec(sql);
      }
    },
  },
  {
    version: 8,
    async apply(driver) {
      await applyMigrationV8(driver);
    },
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Reparaciones idempotentes y acotadas para datos legados conocidos.
 * Se ejecutan tras migrar para sanar instalaciones donde una migración
 * ya aplicada no corrigió completamente (p.ej. app no recargada a tiempo).
 * No elimina datos ni altera IDs clínicos.
 */
async function applyKnownDataRepairs(driver: SqlDriver): Promise<void> {
  // symptom_nauseas -> symptom_nausea (legacy). Seguro e idempotente.
  // Corre el outbox legacy aunque user_version ya sea 7 (app no recargada tras v7).
  await driver.run(
    `UPDATE observations SET metric_id = 'symptom_nausea' WHERE metric_id = 'symptom_nauseas'`,
  );
  await driver.run(
    `UPDATE sync_outbox SET payload = replace(payload, 'symptom_nauseas', 'symptom_nausea'),
         state = CASE WHEN state IN ('pending', 'failed') THEN 'pending' ELSE state END,
         last_error = CASE WHEN state IN ('pending', 'failed') THEN NULL ELSE last_error END
     WHERE payload LIKE '%symptom_nauseas%'`,
  );
}

/** Aplica migraciones pendientes de forma idempotente. */
export async function migrateIfNeeded(driver: SqlDriver): Promise<number> {
  const row = await driver.getFirst<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;
  if (current < LATEST_SCHEMA_VERSION) {
    for (const migration of MIGRATIONS) {
      if (migration.version > current) {
        await driver.withTransaction(async () => {
          await migration.apply(driver);
          await driver.exec(`PRAGMA user_version = ${migration.version}`);
        });
        current = migration.version;
      }
    }
  }
  await applyKnownDataRepairs(driver);
  return LATEST_SCHEMA_VERSION;
}

import type { SqlDriver } from '../driver';
import { MIGRATION_V1_STATEMENTS, MIGRATION_V1_CATALOG_SQL } from './v001-initial';
import { MIGRATION_V2_STATEMENTS } from './v002-sync';
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
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/** Aplica migraciones pendientes de forma idempotente. */
export async function migrateIfNeeded(driver: SqlDriver): Promise<number> {
  const row = await driver.getFirst<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= LATEST_SCHEMA_VERSION) {
    return current;
  }
  for (const migration of MIGRATIONS) {
    if (migration.version > current) {
      await driver.withTransaction(async () => {
        await migration.apply(driver);
        await driver.exec(`PRAGMA user_version = ${migration.version}`);
      });
    }
  }
  return LATEST_SCHEMA_VERSION;
}

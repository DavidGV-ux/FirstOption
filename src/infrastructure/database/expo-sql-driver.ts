import type { SqlDriver } from './driver';

/**
 * Adaptador expo-sqlite del puerto SqlDriver.
 * Todas las consultas usan SQL parametrizado.
 */
export class ExpoSqlDriver implements SqlDriver {
  constructor(private readonly db: import('expo-sqlite').SQLiteDatabase) {}

  async exec(sql: string): Promise<void> {
    await this.db.execAsync(sql);
  }

  async run(sql: string, params?: readonly unknown[]): Promise<{ changes: number }> {
    if (params && params.length > 0) {
      const result = await this.db.runAsync(sql, params as never[]);
      return { changes: result.changes };
    }
    const result = await this.db.runAsync(sql);
    return { changes: result.changes };
  }

  async getFirst<T>(sql: string, params?: readonly unknown[]): Promise<T | null> {
    if (params && params.length > 0) {
      return (await this.db.getFirstAsync<T>(sql, params as never[])) ?? null;
    }
    return (await this.db.getFirstAsync<T>(sql)) ?? null;
  }

  async getAll<T>(sql: string, params?: readonly unknown[]): Promise<T[]> {
    if (params && params.length > 0) {
      return this.db.getAllAsync<T>(sql, params as never[]);
    }
    return this.db.getAllAsync<T>(sql);
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    let result: T;
    await this.db.withTransactionAsync(async () => {
      result = await fn();
    });
    return result!;
  }

  async close(): Promise<void> {
    await this.db.closeAsync();
  }
}

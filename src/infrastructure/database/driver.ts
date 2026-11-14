/**
 * Puerto mínimo de base de datos SQL parametrizada.
 * El dominio y la aplicación no lo conocen; la infraestructura lo
 * implementa con expo-sqlite y, en pruebas, con node:sqlite.
 */
export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly unknown[]): Promise<{ changes: number }>;
  getFirst<T>(sql: string, params?: readonly unknown[]): Promise<T | null>;
  getAll<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

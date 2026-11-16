/*
 * Driver SQL para web basado en sql.js (SQLite compilado a WebAssembly SIN
 * hilos). No depende de OPFS ni de SharedArrayBuffer, por lo que funciona
 * en Safari/iOS y en hosts sin cabeceras COOP/COEP (p. ej. GitHub Pages).
 *
 * La base se persiste en localStorage (serializada con db.export()) tras
 * cada escritura y al ocultar/cerrar la página. El almacenamiento es
 * mejor esfuerzo: localStorage tiene cuota (~5MB) y la base vive en memoria
 * mientras la pestaña está abierta.
 */
import type { SqlDriver } from './driver';

const STORAGE_KEY = 'orbita_salud_db_v1';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export class SqlJsDriver implements SqlDriver {
  private db: any;
  private readonly storageKey: string;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(db: any, storageKey = STORAGE_KEY) {
    this.db = db;
    this.storageKey = storageKey;
    this.schedulePersist = this.schedulePersist.bind(this);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.persistNow();
      });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.persistNow());
    }
  }

  private persistNow() {
    try {
      const bytes = this.db.export() as Uint8Array;
      window.localStorage.setItem(this.storageKey, bytesToBase64(bytes));
    } catch {
      // Cuota llena o bloqueo: no bloqueamos la app.
    }
  }

  private schedulePersist() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistNow();
    }, 500);
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
    this.schedulePersist();
  }

  async run(sql: string, params?: readonly unknown[]): Promise<{ changes: number }> {
    const stmt = this.db.prepare(sql);
    try {
      if (params && params.length > 0) stmt.bind(Array.from(params));
      stmt.step();
      const changes = this.db.getRowsModified() as number;
      return { changes };
    } finally {
      stmt.free();
      this.schedulePersist();
    }
  }

  async getFirst<T>(sql: string, params?: readonly unknown[]): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    try {
      if (params && params.length > 0) stmt.bind(Array.from(params));
      if (!stmt.step()) return null;
      return stmt.getAsObject() as T;
    } finally {
      stmt.free();
    }
  }

  async getAll<T>(sql: string, params?: readonly unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    const out: T[] = [];
    try {
      if (params && params.length > 0) stmt.bind(Array.from(params));
      while (stmt.step()) out.push(stmt.getAsObject() as T);
      return out;
    } finally {
      stmt.free();
    }
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN');
    try {
      const r = await fn();
      this.db.exec('COMMIT');
      this.schedulePersist();
      return r;
    } catch (e) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    }
  }

  async close(): Promise<void> {
    this.persistNow();
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.db.close();
  }

  /** Carga bytes desde localStorage para hidratar la base en el arranque. */
  static loadStoredBytes(storageKey = STORAGE_KEY): Uint8Array | null {
    try {
      const b64 = window.localStorage.getItem(storageKey);
      if (!b64) return null;
      return base64ToBytes(b64);
    } catch {
      return null;
    }
  }
}

export async function openSqlJsDatabase(): Promise<SqlDriver> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' });
  const bytes = SqlJsDriver.loadStoredBytes();
  const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  return new SqlJsDriver(db);
}

export { STORAGE_KEY };
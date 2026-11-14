import * as SQLite from 'expo-sqlite';
import type { EncryptionKeyProvider } from '../security/db-key-store';
import type { SqlDriver } from './driver';
import { ExpoSqlDriver } from './expo-sql-driver';
import { migrateIfNeeded } from './migrations';

/**
 * Errores de almacenamiento. Nunca degradamos SILENCIOSAMENTE a una
 * base sin cifrar: si SQLCipher no está disponible y no hay permiso
 * explícito de modo de prueba, la app se detiene con un mensaje claro.
 */
export class DatabaseEncryptionUnavailableError extends Error {
  constructor() {
    super(
      'El almacenamiento cifrado (SQLCipher) no está disponible en esta compilación. ' +
        'Se requiere un development build con useSQLCipher=true, o activar el modo de ' +
        'prueba sin cifrado con EXPO_PUBLIC_ALLOW_UNENCRYPTED_DB=1 (solo datos demo).',
    );
    this.name = 'DatabaseEncryptionUnavailableError';
  }
}

export interface OpenedDatabase {
  driver: SqlDriver;
  schemaVersion: number;
  cipherVersion: string | null;
  /** false solo en modo de prueba sin cifrado (Expo Go), con banner visible. */
  encrypted: boolean;
}

/**
 * Modo Expo Go: SQLite plano sin cifrar (Expo Go no incluye SQLCipher).
 * Es EXPLÍCITO y condicionado: EXPO_PUBLIC_ALLOW_UNENCRYPTED_DB=1.
 * Usa un archivo distinto para no mezclar datos de una base cifrada
 * con una sin cifrar, y la UI muestra un aviso factual permanente.
 */
export function isUnencryptedDemoModeAllowed(): boolean {
  return process.env.EXPO_PUBLIC_ALLOW_UNENCRYPTED_DB === '1';
}

/**
 * Abre la base local: verifica cifrado, aplica la clave y ejecuta
 * migraciones pendientes.
 *
 * Importante (documentación de expo-sqlite): si el binario no incluye
 * SQLCipher, `PRAGMA key` NO lanza error y la base quedaría sin
 * cifrar. Por eso se consulta `PRAGMA cipher_version` ANTES de
 * escribir nada y se decide de forma explícita.
 */
export async function openAppDatabase(
  databaseName: string,
  keys: EncryptionKeyProvider,
): Promise<OpenedDatabase> {
  const db = await SQLite.openDatabaseAsync(databaseName);

  const cipherRow = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
  const cipherVersion = cipherRow?.cipher_version ?? null;

  if (cipherVersion === null) {
    if (!isUnencryptedDemoModeAllowed()) {
      try {
        await db.closeAsync();
      } catch {
        // Si el cierre falla, el error de cifrado sigue siendo el relevante.
      }
      throw new DatabaseEncryptionUnavailableError();
    }
    // Modo Expo Go explícito: base separada, sin clave, aviso visible.
    const driver: SqlDriver = new ExpoSqlDriver(db);
    const schemaVersion = await migrateIfNeeded(driver);
    return { driver, schemaVersion, cipherVersion: null, encrypted: false };
  }

  const key = await keys.getOrCreateKey();
  // Clave en formato hexadecimal explícito.
  await db.execAsync(`PRAGMA key = "x'${key}'"`);
  await db.execAsync('PRAGMA cipher_memory_security = ON');

  const driver: SqlDriver = new ExpoSqlDriver(db);
  const schemaVersion = await migrateIfNeeded(driver);
  return { driver, schemaVersion, cipherVersion, encrypted: true };
}

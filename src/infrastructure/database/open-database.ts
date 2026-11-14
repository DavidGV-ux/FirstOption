import * as SQLite from 'expo-sqlite';
import type { EncryptionKeyProvider } from '../security/db-key-store';
import type { SqlDriver } from './driver';
import { ExpoSqlDriver } from './expo-sql-driver';
import { migrateIfNeeded } from './migrations';

/**
 * Errores de almacenamiento. Nunca degradamos silenciosamente a una
 * base sin cifrar: si SQLCipher no está disponible en la compilación,
 * la app se detiene con un mensaje explícito.
 */
export class DatabaseEncryptionUnavailableError extends Error {
  constructor() {
    super(
      'El almacenamiento cifrado (SQLCipher) no está disponible en esta compilación. ' +
        'Se requiere un development build con useSQLCipher=true.',
    );
    this.name = 'DatabaseEncryptionUnavailableError';
  }
}

export interface OpenedDatabase {
  driver: SqlDriver;
  schemaVersion: number;
  cipherVersion: string | null;
}

/**
 * Abre la base local: verifica cifrado, aplica la clave y ejecuta
 * migraciones pendientes.
 *
 * Importante (documentación de expo-sqlite): si el binario no incluye
 * SQLCipher, `PRAGMA key` NO lanza error y la base quedaría sin
 * cifrar. Por eso se consulta `PRAGMA cipher_version` ANTES de
 * escribir nada y se rechaza la apertura si no hay cifrado.
 */
export async function openAppDatabase(
  databaseName: string,
  keys: EncryptionKeyProvider,
): Promise<OpenedDatabase> {
  const db = await SQLite.openDatabaseAsync(databaseName);

  const cipherRow = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
  const cipherVersion = cipherRow?.cipher_version ?? null;
  if (cipherVersion === null) {
    try {
      await db.closeAsync();
    } catch {
      // Si el cierre falla, el error de cifrado sigue siendo el relevante.
    }
    throw new DatabaseEncryptionUnavailableError();
  }

  const key = await keys.getOrCreateKey();
  // Clave en formato hexadecimal explícito.
  await db.execAsync(`PRAGMA key = "x'${key}'"`);
  // Saneamiento silencioso tras aplicar la clave.
  await db.execAsync('PRAGMA cipher_memory_security = ON');

  const driver: SqlDriver = new ExpoSqlDriver(db);
  const schemaVersion = await migrateIfNeeded(driver);
  return { driver, schemaVersion, cipherVersion };
}

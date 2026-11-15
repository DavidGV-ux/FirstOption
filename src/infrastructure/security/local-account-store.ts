import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type {
  LocalAccountRecord,
  LocalAccountStore,
  LocalSessionRecord,
} from '@/application/use-cases/manage-auth';

const ACCOUNT_KEY = 'firstOption_local_account_v1';
const SESSION_KEY = 'firstOption_local_session_v1';

/**
 * Cuenta y sesión local.
 *
 * - Nativo: expo-secure-store (Keychain/Keystore), protegido por el SO.
 * - Web: localStorage solo para desarrollo; no hay protección del SO.
 * - La contraseña temporal de una cuenta pendiente se guarda únicamente
 *   aquí y se borra al vincular la cuenta con Supabase.
 */
export class SecureLocalAccountStore implements LocalAccountStore {
  async loadAccount(): Promise<LocalAccountRecord | null> {
    return readJson<LocalAccountRecord>(ACCOUNT_KEY);
  }

  async saveAccount(account: LocalAccountRecord): Promise<void> {
    await writeJson(ACCOUNT_KEY, account);
  }

  async loadSession(): Promise<LocalSessionRecord | null> {
    return readJson<LocalSessionRecord>(SESSION_KEY);
  }

  async saveSession(session: LocalSessionRecord): Promise<void> {
    await writeJson(SESSION_KEY, session);
  }

  async clearSession(): Promise<void> {
    await remove(SESSION_KEY);
  }
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await read(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await write(key, JSON.stringify(value));
}

async function read(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function write(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch {
      throw new Error('No hay almacenamiento local disponible en el navegador.');
    }
  }
  await SecureStore.setItemAsync(key, value);
}

async function remove(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Sin almacenamiento disponible: nada que borrar.
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

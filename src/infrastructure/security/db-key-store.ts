import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';

/**
 * Clave de cifrado SQLCipher por instalación.
 * - Se genera una vez con bytes aleatorios (expo-crypto).
 * - Se guarda en Keychain (iOS) / Keystore (Android) vía expo-secure-store.
 * - Nunca se registra en logs ni se sincroniza.
 */
const DB_KEY_STORAGE_KEY = 'orbita_salud_db_key_v1';

export interface EncryptionKeyProvider {
  getOrCreateKey(): Promise<string>;
}

export class SecureStoreKeyProvider implements EncryptionKeyProvider {
  async getOrCreateKey(): Promise<string> {
    const existing = await SecureStore.getItemAsync(DB_KEY_STORAGE_KEY, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    if (existing) {
      return existing;
    }
    const hex = Array.from(getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(DB_KEY_STORAGE_KEY, hex, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return hex;
  }
}

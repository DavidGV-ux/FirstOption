import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';

/**
 * Clave de cifrado SQLCipher por instalación.
 * - Se genera una vez con bytes aleatorios (expo-crypto).
 * - Se guarda en Keychain (iOS) / Keystore (Android) vía expo-secure-store.
 * - Nunca se registra en logs ni se sincroniza.
 *
 * En web, expo-secure-store no expone las APIs nativas (es un stub vacío),
 * así que se usa localStorage como respaldo con un aviso explícito: la web
 * es solo para desarrollo/preview y no ofrece la protección del keystore.
 */
const DB_KEY_STORAGE_KEY = 'orbita_salud_db_key_v1';

export interface EncryptionKeyProvider {
  getOrCreateKey(): Promise<string>;
}

export class SecureStoreKeyProvider implements EncryptionKeyProvider {
  async getOrCreateKey(): Promise<string> {
    if (Platform.OS === 'web') {
      if (typeof console !== 'undefined') {
        // Una sola advertencia por carga; no se repite en cada llamada.
        if (!(globalThis as { __orbitaWebKeyWarned?: boolean }).__orbitaWebKeyWarned) {
          (globalThis as { __orbitaWebKeyWarned?: boolean }).__orbitaWebKeyWarned = true;
          console.warn(
            '[Órbita Salud] Modo web: la clave de la base se guarda en localStorage (sin Keychain/Keystore). Solo para desarrollo/preview.',
          );
        }
      }
      const existing = window.localStorage.getItem(DB_KEY_STORAGE_KEY);
      if (existing) {
        return existing;
      }
      const hex = Array.from(getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
      window.localStorage.setItem(DB_KEY_STORAGE_KEY, hex);
      return hex;
    }

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

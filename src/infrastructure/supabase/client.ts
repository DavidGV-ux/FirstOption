import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

/**
 * Adaptador de almacenamiento de sesión.
 * - Nativo: expo-secure-store (Keychain/Keystore).
 * - Web: localStorage (expo-secure-store es un stub vacío en web y
 *   lanzaría "getValueWithKeyAsync is not a function"). La web es solo
 *   para desarrollo/preview; la sesión no queda protegida por el SO.
 */
const SUPABASE_SESSION_KEY = 'orbita_salud_supabase_session_v1';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const secureStoreAuthStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Sin almacenamiento disponible en web: no bloqueamos la app.
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Sin almacenamiento disponible en web: no bloqueamos la app.
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client !== null) {
    return client;
  }
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      'Supabase no configurado: faltan EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY',
    );
  }
  client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: secureStoreAuthStorage,
      storageKey: SUPABASE_SESSION_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    // Sin Realtime como mecanismo único de sincronización.
    realtime: { params: { eventsPerSecond: 0 } },
  });
  return client;
}

/** Indica si hay configuración de Supabase disponible (sin llamar a la red). */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

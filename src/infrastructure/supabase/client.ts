import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

/**
 * Cliente Supabase con clave PUBLISHABLE. Nunca se usan secret keys ni
 * service_role en el cliente; toda la autorización se resuelve con RLS.
 *
 * La sesión se persiste en SecureStore (Keychain/Keystore) para que el
 * usuario siga autenticado entre ejecuciones. Sin conexión, la app
 * sigue leyendo/escribiendo localmente: NO se promete re-autenticación
 * remota sin internet.
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const SUPABASE_SESSION_KEY = 'orbita_salud_supabase_session_v1';

/** Adaptador de almacenamiento de sesión sobre expo-secure-store. */
export const secureStoreAuthStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
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

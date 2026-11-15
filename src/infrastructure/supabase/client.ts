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

/**
 * SecureStore rechaza cargas grandes en algunos dispositivos (límite
 * histórico ~2048 bytes en iOS/Android). La sesión de Supabase incluye
 * JWT de acceso + refresh token y puede superarlo, lo que hacía que la
 * cuenta "desapareciera" al reabrir la app. Se guarda en fragmentos con
 * un manifiesto de generación para que la escritura sea atómica: el
 * manifiesto se actualiza solo después de escribir todos los trozos.
 */
const CHUNK_SIZE = 1800;
const MANIFEST_SUFFIX = '__chunks_v1';

interface ChunkManifest {
  generation: string;
  count: number;
}

function manifestKey(key: string): string {
  return `${key}${MANIFEST_SUFFIX}`;
}

function chunkKey(key: string, generation: string, index: number): string {
  return `${key}__${generation}__${index}`;
}

async function readManifest(key: string): Promise<ChunkManifest | null> {
  try {
    const raw = await SecureStore.getItemAsync(manifestKey(key));
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<ChunkManifest>;
    if (
      typeof parsed.generation !== 'string' ||
      typeof parsed.count !== 'number' ||
      parsed.count < 0
    ) {
      return null;
    }
    return { generation: parsed.generation, count: Math.floor(parsed.count) };
  } catch {
    return null;
  }
}

async function deleteChunks(key: string, manifest: ChunkManifest): Promise<void> {
  for (let index = 0; index < manifest.count; index += 1) {
    try {
      await SecureStore.deleteItemAsync(chunkKey(key, manifest.generation, index));
    } catch {
      // Si un fragmento ya no existe, no es un error recuperable.
    }
  }
}


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
    try {
      const manifest = await readManifest(key);
      if (manifest !== null) {
        const parts: string[] = [];
        for (let index = 0; index < manifest.count; index += 1) {
          const chunk = await SecureStore.getItemAsync(
            chunkKey(key, manifest.generation, index),
          );
          if (chunk === null) {
            // Manifiesto inconsistente: no fingir una sesión a medias.
            return SecureStore.getItemAsync(key);
          }
          parts.push(chunk);
        }
        return parts.join('');
      }
      // Compatibilidad con sesiones guardadas antes del fragmentado.
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
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
    const previous = await readManifest(key);
    const generation = `${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    let count = 0;
    for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
      await SecureStore.setItemAsync(
        chunkKey(key, generation, count),
        value.slice(offset, offset + CHUNK_SIZE),
      );
      count += 1;
    }
    // Publicar el manifiesto solo cuando todos los fragmentos existen.
    await SecureStore.setItemAsync(
      manifestKey(key),
      JSON.stringify({ generation, count } satisfies ChunkManifest),
    );
    if (previous !== null && previous.generation !== generation) {
      await deleteChunks(key, previous);
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // La sesión antigua sin fragmentar ya no se usa.
    }
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
    const manifest = await readManifest(key);
    if (manifest !== null) {
      await deleteChunks(key, manifest);
      try {
        await SecureStore.deleteItemAsync(manifestKey(key));
      } catch {
        // Ignorar: el manifiesto ya no es legible.
      }
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

import { useEffect, useRef, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * Hook que sincroniza automáticamente cuando se recupera la conexión a internet.
 *
 * Reglas:
 * - Solo sincroniza si hay sesión remota activa y syncNow está configurado.
 * - Espera 2 segundos tras detectar conexión para evitar sincronizaciones
 *   precipitadas si la red es inestable (debounce).
 * - Nunca sobrescribe datos: usa el mismo flujo idempotente de sync-now.
 * - Los errores de sync automático se silencian (no interrumpen la UI).
 */
export function useAutoSync({
  syncNow,
  supabase,
}: {
  syncNow: { execute: () => Promise<unknown> } | null;
  supabase: { auth: { getSession: () => Promise<{ data: { session: { user: { id: string } | null } | null } }> } } | null;
}) {
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSync = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(async () => {
      try {
        if (syncNow === null || supabase === null) {
          return;
        }
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          return;
        }
        await syncNow.execute();
      } catch {
        // Errores de sync automático no se muestran al usuario;
        // el botón manual de Sincronizar sigue disponible.
      } finally {
        syncTimeoutRef.current = null;
      }
    }, 2000);
  }, [syncNow, supabase]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isInternetReachable === true;
      if (connected) {
        scheduleSync();
      }
    });

    // Comprobar conectividad inicial al montar.
    NetInfo.fetch().then((state) => {
      if (state.isInternetReachable === true) {
        scheduleSync();
      }
    });

    return () => {
      unsubscribe();
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [scheduleSync]);
}

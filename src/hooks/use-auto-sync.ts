import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import type {
  AuthSession,
  ReconcileOutcome,
} from '@/application/use-cases/manage-auth';
import type { SyncStatus } from '@/application/use-cases/sync-now';

/** Espera breve para no sincronizar con una red aún inestable. */
const DEBOUNCE_MS = 1500;
/** Verificación periódica aunque NetInfo no emita cambios. */
const DEFAULT_INTERVAL_MS = 120_000;

interface SyncNowLike {
  execute(): Promise<SyncStatus>;
}

interface AuthLike {
  getSession(): Promise<AuthSession | null>;
  reconcilePendingAccount(): Promise<ReconcileOutcome>;
}

/**
 * Sincronización automática.
 *
 * - Al recuperar internet: valida una cuenta local pendiente y luego
 *   empuja la cola de sincronización.
 * - Verifica la conexión cada 2 minutos y al volver la app a primer plano.
 * - Nunca bloquea la UI: los errores se silencian y el botón manual de
 *   Sincronizar sigue disponible.
 * - Solo empuja datos con sesión remota; una cuenta local pendiente
 *   primero debe quedar vinculada en Supabase.
 */
export function useAutoSync({
  syncNow,
  auth,
  intervalMs = DEFAULT_INTERVAL_MS,
}: {
  syncNow: SyncNowLike | null;
  auth: AuthLike | null;
  intervalMs?: number;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);

  const runSync = useCallback(async () => {
    if (auth === null || runningRef.current) return;
    runningRef.current = true;
    try {
      let session = await auth.getSession();
      if (session === null) return;

      if (session.pendingRemoteUpload) {
        const outcome = await auth.reconcilePendingAccount();
        if (outcome.kind !== 'linked') return;
        session = await auth.getSession();
      }

      // Sin sesión remota no se puede empujar: la cuenta local (o una
      // cuenta pendiente de confirmar correo) no tiene token válido.
      if (session === null || session.kind !== 'remote') return;
      if (syncNow === null) return;
      await syncNow.execute();
    } catch {
      // Un fallo de sincronización automática no interrumpe la app.
    } finally {
      runningRef.current = false;
    }
  }, [auth, syncNow]);

  const scheduleSync = useCallback(
    (delayMs = DEBOUNCE_MS) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void runSync();
      }, delayMs);
    },
    [runSync],
  );

  useEffect(() => {
    const onNetworkState = (state: NetInfoState) => {
      const connected =
        state.isConnected === true && state.isInternetReachable !== false;
      if (connected) scheduleSync();
    };

    const unsubscribe = NetInfo.addEventListener(onNetworkState);

    const checkNow = () => {
      NetInfo.fetch().then(onNetworkState).catch(() => undefined);
    };

    // Verificación inicial al montar.
    checkNow();
    const interval = setInterval(checkNow, intervalMs);
    const appStateSubscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') checkNow();
    });

    return () => {
      unsubscribe();
      clearInterval(interval);
      appStateSubscription.remove();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [scheduleSync, intervalMs]);
}

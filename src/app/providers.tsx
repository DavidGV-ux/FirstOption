import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  RegisterDailyLogUseCase,
} from '@/application/use-cases/register-daily-log';
import { ListRecentActivityUseCase } from '@/application/use-cases/list-recent-activity';
import { SyncNowUseCase } from '@/application/use-cases/sync-now';
import { SqliteObservationRepository } from '@/infrastructure/repositories/sqlite-observation-repository';
import {
  openAppDatabase,
  DatabaseEncryptionUnavailableError,
  isUnencryptedDemoModeAllowed,
} from '@/infrastructure/database/open-database';
import { SecureStoreKeyProvider } from '@/infrastructure/security/db-key-store';
import {
  LocalSubjectIdentity,
  type RemoteSubjectProvider,
} from '@/infrastructure/security/local-subject-identity';
import { CryptoIdGenerator } from '@/infrastructure/ids/uuid-generator';
import { SystemClock } from '@/infrastructure/clock/system-clock';
import {
  getSupabaseClient,
  isSupabaseConfigured,
} from '@/infrastructure/supabase/client';
import { palette, spacing, typography } from '@/presentation/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Si el control del splash ya se perdió, seguimos sin bloquear la app.
});

const DATABASE_NAME = 'orbita_salud.db';
const EXPO_GO_DATABASE_NAME = 'orbita_salud_local.db';

interface AppServices {
  registerDailyLog: RegisterDailyLogUseCase;
  listRecentActivity: ListRecentActivityUseCase;
  syncNow: SyncNowUseCase | null;
  supabase: SupabaseClient | null;
  /** true si Supabase está configurado por variables de entorno. */
  remoteConfigured: boolean;
}

const AppServicesContext = createContext<AppServices | null>(null);

export function useAppServices(): AppServices {
  const ctx = useContext(AppServicesContext);
  if (ctx === null) {
    throw new Error('AppServices no disponible: la base de datos no está lista');
  }
  return ctx;
}

type BootState =
  | { phase: 'loading' }
  | { phase: 'ready'; services: AppServices; encrypted: boolean }
  | { phase: 'error'; kind: 'encryption'; message: string };

/**
 * Proveedor raíz: abre la base (cifrada si el binario lo permite)
 * antes de montar la navegación. Sin cifrado, solo continúa en modo
 * demo explícito con banner permanente; en cualquier otro caso muestra
 * un bloqueo claro: nunca degrada silenciosamente.
 */
export function AppServicesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BootState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const keys = new SecureStoreKeyProvider();
        const allowed = isUnencryptedDemoModeAllowed();
        const opened = await openAppDatabase(
          allowed ? EXPO_GO_DATABASE_NAME : DATABASE_NAME,
          keys,
        );
        if (cancelled) return;
        const repository = new SqliteObservationRepository(opened.driver);
        const clock = new SystemClock();
        const ids = new CryptoIdGenerator();
        let supabase: SupabaseClient | null = null;
        if (isSupabaseConfigured()) {
          try {
            supabase = getSupabaseClient();
          } catch {
            supabase = null;
          }
        }
        const remoteSubject: RemoteSubjectProvider | null =
          supabase === null
            ? null
            : {
                async getUserId() {
                  const { data } = await supabase!.auth.getSession();
                  return data.session?.user?.id ?? null;
                },
              };
        const identity = new LocalSubjectIdentity(opened.driver, remoteSubject);
        setState({
          phase: 'ready',
          services: {
            registerDailyLog: new RegisterDailyLogUseCase(repository, identity, clock, ids),
            listRecentActivity: new ListRecentActivityUseCase(repository, clock),
            syncNow: supabase !== null ? new SyncNowUseCase(supabase, repository) : null,
            supabase,
            remoteConfigured: supabase !== null,
          },
          encrypted: opened.encrypted,
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          phase: 'error',
          kind: 'encryption',
          message:
            error instanceof DatabaseEncryptionUnavailableError
              ? error.message
              : 'No se pudo abrir el almacenamiento. Revisa la compilación de la app.',
        });
      } finally {
        SplashScreen.hideAsync().catch(() => undefined);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === 'loading') {
    return null;
  }

  if (state.phase === 'error') {
    return <StorageBlockedScreen message={state.message} />;
  }

  return (
    <AppServicesContext.Provider value={state.services}>
      <View style={styles.root}>
        {!state.encrypted && <UnencryptedModeBanner />}
        <View style={styles.root}>{children}</View>
      </View>
    </AppServicesContext.Provider>
  );
}

/** Banner permanente: el modo sin cifrado nunca es silencioso. */
function UnencryptedModeBanner() {
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel="Modo Expo Go: los datos se guardan sin cifrado en este dispositivo. Para cifrado, usa el development build."
      style={styles.banner}
    >
      <Text style={styles.bannerText}>
        Modo Expo Go: datos guardados sin cifrado en este dispositivo.
      </Text>
    </View>
  );
}

/** Pantalla de bloqueo: sin almacenamiento cifrado no hay uso de la app. */
function StorageBlockedScreen({ message }: { message: string }) {
  return (
    <View style={styles.blocked} accessible accessibilityRole="alert">
      <View style={styles.blockedCard}>
        <Text style={styles.blockedTitle}>Almacenamiento cifrado no disponible</Text>
        <Text style={styles.blockedText}>{message}</Text>
        <Text style={styles.blockedHint}>
          Órbita Salud es un prototipo con datos de salud: requiere una
          development build con SQLCipher (no Expo Go).
        </Text>
      </View>
    </View>
  );
}

const styles = {
  root: { flex: 1 },
  banner: {
    backgroundColor: palette.attention,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  bannerText: {
    ...typography.small,
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  blocked: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  blockedCard: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.priority,
    padding: spacing.lg,
    gap: spacing.sm,
    maxWidth: 480,
  },
  blockedTitle: { ...typography.subtitle, color: palette.priority, fontWeight: '600' },
  blockedText: { ...typography.body, color: palette.textPrimary },
  blockedHint: { ...typography.secondary, color: palette.textSecondary },
} as const;

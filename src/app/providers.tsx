import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import {
  RegisterDailyLogUseCase,
} from '@/application/use-cases/register-daily-log';
import { ListRecentActivityUseCase } from '@/application/use-cases/list-recent-activity';
import { SqliteObservationRepository } from '@/infrastructure/repositories/sqlite-observation-repository';
import {
  openAppDatabase,
  DatabaseEncryptionUnavailableError,
  isUnencryptedDemoModeAllowed,
} from '@/infrastructure/database/open-database';
import { SecureStoreKeyProvider } from '@/infrastructure/security/db-key-store';
import { LocalSubjectIdentity } from '@/infrastructure/security/local-subject-identity';
import { CryptoIdGenerator } from '@/infrastructure/ids/uuid-generator';
import { SystemClock } from '@/infrastructure/clock/system-clock';
import { palette, spacing, typography } from '@/presentation/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Si el control del splash ya se perdió, seguimos sin bloquear la app.
});

const DATABASE_NAME = 'orbita_salud.db';
const DEMO_DATABASE_NAME = 'orbita_salud_demo.db';

interface AppServices {
  registerDailyLog: RegisterDailyLogUseCase;
  listRecentActivity: ListRecentActivityUseCase;
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
          allowed ? DEMO_DATABASE_NAME : DATABASE_NAME,
          keys,
        );
        if (cancelled) return;
        const repository = new SqliteObservationRepository(opened.driver);
        const clock = new SystemClock();
        const ids = new CryptoIdGenerator();
        const identity = new LocalSubjectIdentity(opened.driver);
        setState({
          phase: 'ready',
          services: {
            registerDailyLog: new RegisterDailyLogUseCase(repository, identity, clock, ids),
            listRecentActivity: new ListRecentActivityUseCase(repository, clock),
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
        {!state.encrypted && <UnencryptedDemoBanner />}
        <View style={styles.root}>{children}</View>
      </View>
    </AppServicesContext.Provider>
  );
}

/** Banner permanente: el modo sin cifrado nunca es silencioso. */
function UnencryptedDemoBanner() {
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel="Modo demostración sin cifrado: almacenamiento no cifrado, solo datos de prueba."
      style={styles.banner}
    >
      <Text style={styles.bannerText}>
        Sin cifrado (Expo Go) — almacenamiento de prueba, no para datos reales.
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

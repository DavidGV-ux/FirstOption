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
  | { phase: 'ready'; services: AppServices; cipherVersion: string }
  | { phase: 'error'; kind: 'encryption'; message: string };

/**
 * Proveedor raíz: abre la base cifrada antes de montar la navegación.
 * Si el cifrado no está disponible (p. ej. Expo Go), muestra un bloqueo
 * explícito: nunca degrada a una base sin cifrar.
 */
export function AppServicesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BootState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const keys = new SecureStoreKeyProvider();
        const opened = await openAppDatabase(DATABASE_NAME, keys);
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
          cipherVersion: opened.cipherVersion ?? 'unknown',
        });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DatabaseEncryptionUnavailableError) {
          setState({ phase: 'error', kind: 'encryption', message: error.message });
        } else {
          // Los mensajes de error no incluyen datos clínicos ni claves.
          setState({
            phase: 'error',
            kind: 'encryption',
            message:
              'No se pudo abrir el almacenamiento cifrado. Revisa la compilación de la app.',
          });
        }
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
      {children}
    </AppServicesContext.Provider>
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

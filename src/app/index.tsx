import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import type { LatestLogStatus } from '@/application/use-cases/list-recent-activity';
import type { SyncStatus } from '@/application/use-cases/sync-now';
import { StatusBadge, Card, SyncStatusCard, SectionHeader } from '@/presentation/components/ui';
import { useAppServices } from './_providers';
import { useResponsive } from '@/presentation/hooks/use-responsive';
import { palette, radius, spacing, typography } from '@/presentation/theme/tokens';

export default function HomeScreen() {
  const services = useAppServices();
  const r = useResponsive();
  const [status, setStatus] = useState<LatestLogStatus | null>(null);
  const [pending, setPending] = useState<{ sessions: number; observations: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [authState, setAuthState] = useState<'checking' | 'signed_in' | 'signed_out'>('checking');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [accountScope, setAccountScope] = useState<{ subjectId: string; kind: 'remote' | 'device'; email: string | null } | null>(null);
  const [localCount, setLocalCount] = useState(0);
  const [adoptMsg, setAdoptMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [latest, pendingCount, scope, lc] = await Promise.all([
        services.listRecentActivity.latestLogStatus(),
        services.listRecentActivity.countPendingSync(),
        services.manageAccount.current(),
        services.manageAccount.localRecordCount(),
      ]);
      setStatus(latest);
      setPending(pendingCount);
      setAccountScope(scope);
      setLocalCount(lc);
      setError(null);
    } catch {
      setError('No se pudieron leer los registros locales. Inténtalo de nuevo.');
    }
    if (services.supabase !== null) {
      const { data } = await services.supabase.auth.getSession();
      setAuthState(data.session !== null ? 'signed_in' : 'signed_out');
    } else {
      setAuthState('signed_out');
    }
  }, [services]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const syncNow = useCallback(async () => {
    if (services.syncNow === null) {
      setSyncMessage('Sincronización no disponible en esta compilación.');
      return;
    }
    if (authState !== 'signed_in') {
      setSyncMessage('Inicia sesión para sincronizar con el servidor.');
      return;
    }
    setSyncMessage('Sincronizando…');
    const result: SyncStatus = await services.syncNow.execute();
    switch (result.kind) {
      case 'synced':
        setSyncMessage(
          result.pushed === 0
            ? 'Nada pendiente de sincronizar.'
            : `Sincronizadas ${result.pushed} operación(es). Pendientes: ${result.remaining}.`,
        );
        break;
      case 'not_authenticated':
        setSyncMessage('La sesión remota expiró. Vuelve a iniciar sesión cuando haya internet.');
        break;
      case 'offline':
        setSyncMessage('Sin conexión: los datos siguen guardados en el dispositivo.');
        break;
      case 'remote_error':
        setSyncMessage(result.message);
        break;
    }
    await load();
  }, [services, authState, load]);

  const entry = status?.entry ?? null;

  return (
    <>
      <Stack.Screen options={{ title: 'Órbita Salud' }} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: r.horizontalMargin, maxWidth: r.contentMaxWidth, alignSelf: 'center', width: '100%' },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {error !== null && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Registro de hoy */}
        <Card title="Registro de hoy">
          {status !== null && status.isToday ? (
            <Text style={styles.bodyText}>
              Ya existe un registro con fecha de hoy. Puedes registrar otro
              momento del día si lo necesitas.
            </Text>
          ) : entry !== null ? (
            <Text style={styles.bodyText}>
              El último registro no es de hoy. Registrar el seguimiento diario
              es una tarea pendiente.
            </Text>
          ) : (
            <Text style={styles.bodyText}>
              Aún no hay mediciones registradas. Registrar el primer seguimiento
              es una tarea pendiente.
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Registrar seguimiento"
            onPress={() => router.push('/registrar')}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonLabel}>Registrar seguimiento</Text>
          </Pressable>
        </Card>

        {/* Última medición */}
        <Card title="Última medición">
          {entry !== null ? (
            <>
              <Text style={styles.summaryText}>
                {entry.summaryParts.length > 0
                  ? entry.summaryParts.join(' · ')
                  : 'Sin observaciones en esta sesión.'}
              </Text>
              <Text style={styles.noteText}>
                {entry.missionPhase} · {entry.age.label} ·{' '}
                {entry.syncState === 'local_only' ? 'Solo en dispositivo' : entry.syncState}
              </Text>
              {entry.note !== null && (
                <Text style={styles.noteText} numberOfLines={2}>
                  {entry.note}
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.bodyText}>Aún no hay mediciones registradas.</Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver evolución en historial"
            onPress={() => router.push('/historial')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonLabel}>Ver evolución</Text>
          </Pressable>
        </Card>

        {/* Actividad reciente */}
        <Card title="Actividad reciente">
          {entry !== null ? (
            <View style={styles.row}>
              <StatusBadge
                label={entry.syncState === 'local_only' ? 'Pendiente' : entry.syncState}
                tone={entry.syncState === 'local_only' ? 'attention' : 'success'}
              />
              <Text style={styles.bodyText}>
                {entry.age.label} · {entry.observationCount} observación(es)
              </Text>
            </View>
          ) : (
            <Text style={styles.bodyText}>Sin actividad reciente.</Text>
          )}
        </Card>

        {/* Cuenta y alcance por usuario */}
        <Card title="Cuenta">
          <Text style={styles.bodyText}>
            {accountScope?.kind === 'remote'
              ? `Sesión iniciada: ${accountScope.email ?? 'cuenta remota'}`
              : 'Sesión local (sin cuenta). Los registros se asocian a este dispositivo.'}
          </Text>
          {authState !== 'signed_in' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión o crear cuenta"
              onPress={() => router.push('/acceso')}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryButtonLabel}>Iniciar sesión / crear cuenta</Text>
            </Pressable>
          ) : (
            <>
              {localCount > 0 && (
                <>
                  <Text style={styles.noteText}>
                    Tienes {localCount} registro(s) del dispositivo sin asociar a
                    tu cuenta. Puedes asociarlos explícitamente.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Asociar registros locales a mi cuenta"
                    onPress={async () => {
                      try {
                        const n = await services.manageAccount.adoptLocalRecords();
                        setAdoptMsg(`Se asociaron ${n} registro(s) a tu cuenta.`);
                        await load();
                      } catch (e) {
                        setAdoptMsg(
                          e instanceof Error ? e.message : 'No se pudo asociar. Inténtalo de nuevo.',
                        );
                      }
                    }}
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.secondaryButtonLabel}>Asociar registros locales</Text>
                  </Pressable>
                </>
              )}
              {adoptMsg !== null && (
                <Text style={styles.noteText}>{adoptMsg}</Text>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar sesión"
                onPress={async () => {
                  if (services.supabase !== null) {
                    await services.supabase.auth.signOut();
                  }
                  setAdoptMsg(null);
                  await load();
                }}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryButtonLabel}>Cerrar sesión</Text>
              </Pressable>
            </>
          )}
        </Card>

        <SyncStatusCard
          pending={pending?.sessions ?? 0}
          message={syncMessage}
          onSync={() => void syncNow()}
          onSignIn={() => router.push('/acceso')}
          signedIn={authState === 'signed_in'}
          configured={services.remoteConfigured}
        />

        {/* Accesos */}
        <SectionHeader title="Más" />
        <View style={[styles.row, { flexWrap: 'wrap' }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir historial"
            onPress={() => router.push('/historial')}
            style={({ pressed }) => [styles.linkCard, pressed && styles.pressed]}
          >
            <Text style={styles.linkTitle}>Historial</Text>
            <Text style={styles.bodyText}>Registros guardados en este dispositivo.</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir análisis descriptivo"
            onPress={() => router.push('/analisis')}
            style={({ pressed }) => [styles.linkCard, pressed && styles.pressed]}
          >
            <Text style={styles.linkTitle}>Análisis</Text>
            <Text style={styles.bodyText}>Resumen estadístico por tiempo real.</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir linterna de inspección"
            onPress={() => router.push('/linterna')}
            style={({ pressed }) => [styles.linkCard, pressed && styles.pressed]}
          >
            <Text style={styles.linkTitle}>Linterna</Text>
            <Text style={styles.bodyText}>Inspección pupilar documentada.</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Registrar resultado hematológico"
            onPress={() => router.push('/laboratorio')}
            style={({ pressed }) => [styles.linkCard, pressed && styles.pressed]}
          >
            <Text style={styles.linkTitle}>Laboratorio</Text>
            <Text style={styles.bodyText}>Registrar resultado hematológico.</Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { paddingVertical: spacing.lg, gap: spacing.md },
  bodyText: { ...typography.body, color: palette.textSecondary },
  summaryText: { ...typography.body, color: palette.textPrimary },
  noteText: { ...typography.secondary, color: palette.textSecondary, fontStyle: 'italic' },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  primaryButton: {
    minHeight: 48,
    borderRadius: radius.sm,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  primaryButtonLabel: { ...typography.body, color: palette.accentOnSurface, fontWeight: '600' },
  secondaryButton: {
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  secondaryButtonLabel: { ...typography.secondary, color: palette.accent, fontWeight: '600' },
  linkCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  linkTitle: { ...typography.cardTitle, color: palette.accent },
  pressed: { opacity: 0.85 },
  errorBox: {
    backgroundColor: 'rgba(163,52,58,0.08)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.priority,
    padding: spacing.sm,
  },
  errorText: { ...typography.secondary, color: palette.priority, fontWeight: '600' },
});

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

  const todayDone = status?.isToday === true;

  return (
    <>
      <Stack.Screen options={{ title: 'Inicio' }} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: r.horizontalMargin, maxWidth: r.contentMaxWidth, alignSelf: 'center', width: '100%' },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Tu espacio de bienestar</Text>
          <Text style={styles.heroTitle}>firstOption</Text>
          <Text style={styles.heroDescription}>
            Seguimiento personal de salud: registra tu día, consulta tu historial y análisis, y usa
            herramientas experimentales con enfoque privado y offline.
          </Text>
          <View style={styles.heroRow}>
            <StatusBadge label={todayDone ? 'Hoy registrado' : 'Pendiente hoy'} tone={todayDone ? 'success' : 'attention'} />
            <Text style={styles.heroMeta}>
              {accountScope?.kind === 'remote'
                ? `Cuenta: ${accountScope.email ?? 'activa'}`
                : 'Modo local en este dispositivo'}
            </Text>
          </View>
          <View style={styles.heroActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Registrar seguimiento"
              onPress={() => router.push('/registrar')}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, styles.heroPrimary]}
            >
              <Text style={styles.primaryButtonLabel}>Registrar seguimiento</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ver historial"
              onPress={() => router.push('/historial')}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, styles.heroSecondary]}
            >
              <Text style={styles.secondaryButtonLabel}>Ver historial</Text>
            </Pressable>
          </View>
        </View>

        {error !== null && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Resumen */}
        <SectionHeader title="Resumen" />
        <View style={styles.gridRow}>
          <Card title="Registro de hoy" style={styles.gridCard}>
            {status !== null && status.isToday ? (
              <Text style={styles.bodyText}>Ya registraste hoy. Puedes añadir otro momento si lo necesitas.</Text>
            ) : entry !== null ? (
              <Text style={styles.bodyText}>El último registro no es de hoy. Es un buen momento para actualizar tu seguimiento.</Text>
            ) : (
              <Text style={styles.bodyText}>Aún no hay mediciones. Empieza con tu primer registro.</Text>
            )}
          </Card>

          <Card title="Última medición" style={styles.gridCard}>
            {entry !== null ? (
              <>
                <Text style={styles.summaryText} numberOfLines={3}>
                  {entry.summaryParts.length > 0 ? entry.summaryParts.join(' · ') : 'Sin observaciones en esta sesión.'}
                </Text>
                <Text style={styles.noteText}>
                  {entry.missionPhase} · {entry.age.label} · {entry.syncState === 'local_only' ? 'Solo en dispositivo' : entry.syncState}
                </Text>
              </>
            ) : (
              <Text style={styles.bodyText}>Sin registros recientes.</Text>
            )}
          </Card>
        </View>

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

        {/* Cuenta y sincronización */}
        <SectionHeader title="Cuenta y sincronización" />
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
                    Tienes {localCount} registro(s) del dispositivo sin asociar a tu cuenta. Puedes asociarlos explícitamente.
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
                        setAdoptMsg(e instanceof Error ? e.message : 'No se pudo asociar. Inténtalo de nuevo.');
                      }
                    }}
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.secondaryButtonLabel}>Asociar registros locales</Text>
                  </Pressable>
                </>
              )}
              {adoptMsg !== null && <Text style={styles.noteText}>{adoptMsg}</Text>}
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

        {/* Accesos rápidos */}
        <SectionHeader title="Accesos rápidos" />
        <View style={styles.quickGrid}>
          {[
            { title: 'Historial', desc: 'Registros guardados en este dispositivo.', route: '/historial' as const, label: 'Abrir historial' },
            { title: 'Análisis', desc: 'Resumen estadístico y tendencias.', route: '/analisis' as const, label: 'Abrir análisis descriptivo' },
            { title: 'Linterna', desc: 'Inspección y pulso óptico experimental.', route: '/linterna' as const, label: 'Abrir linterna de inspección' },
            { title: 'Laboratorio', desc: 'Resultados hematológicos y conversiones.', route: '/laboratorio' as const, label: 'Registrar resultado hematológico' },
            { title: 'Basales', desc: 'Líneas basales versionadas.', route: '/basales' as const, label: 'Gestionar líneas basales' },
          ].map((item) => (
            <Pressable
              key={item.route}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={() => router.push(item.route)}
              style={({ pressed }) => [styles.linkCard, pressed && styles.pressed]}
            >
              <Text style={styles.linkTitle}>{item.title}</Text>
              <Text style={styles.bodyText}>{item.desc}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.footerNote}>
          firstOption no es un dispositivo médico. Las estimaciones experimentales se muestran con sus limitaciones.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { paddingVertical: spacing.lg, gap: spacing.lg },
  hero: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heroKicker: {
    ...typography.small,
    color: palette.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroTitle: { ...typography.title, color: palette.textPrimary },
  heroDescription: { ...typography.body, color: palette.textSecondary },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  heroMeta: { ...typography.secondary, color: palette.textSecondary },
  heroActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.xs },
  heroPrimary: { marginTop: 0, flexGrow: 1 },
  heroSecondary: { marginTop: 0, alignSelf: 'center' },
  gridRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  gridCard: { flex: 1, minWidth: 220 },
  quickGrid: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  bodyText: { ...typography.body, color: palette.textSecondary },
  summaryText: { ...typography.body, color: palette.textPrimary },
  noteText: { ...typography.secondary, color: palette.textSecondary, fontStyle: 'italic' },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  primaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
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
    borderRadius: radius.md,
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
    flexGrow: 1,
    flexBasis: 160,
    minWidth: 150,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  linkTitle: { ...typography.cardTitle, color: palette.textPrimary },
  pressed: { opacity: 0.9 },
  errorBox: {
    backgroundColor: 'rgba(163,52,58,0.08)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.priority,
    padding: spacing.sm,
  },
  errorText: { ...typography.secondary, color: palette.priority, fontWeight: '600' },
  footerNote: { ...typography.small, color: palette.textSecondary, textAlign: 'center', marginTop: spacing.xs },
});

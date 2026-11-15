import * as SecureStore from 'expo-secure-store';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LatestLogStatus } from '@/application/use-cases/list-recent-activity';
import type { SyncStatus } from '@/application/use-cases/sync-now';
import { Card } from '@/presentation/components/ui';
import { useAppServices } from './_providers';
import { useResponsive } from '@/presentation/hooks/use-responsive';
import { palette, radius, spacing, typography } from '@/presentation/theme/tokens';

const DISPLAY_NAME_KEY = 'firstOption_display_name';

export default function HomeScreen() {
  const services = useAppServices();
  const r = useResponsive();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<LatestLogStatus | null>(null);
  const [pending, setPending] = useState<{ sessions: number; observations: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [authState, setAuthState] = useState<'checking' | 'signed_in' | 'signed_out'>('checking');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [accountScope, setAccountScope] = useState<{ subjectId: string; kind: 'remote' | 'device'; email: string | null } | null>(null);
  const [localCount, setLocalCount] = useState(0);
  const [adoptMsg, setAdoptMsg] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

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

  /** Lee el nombre para mostrar guardado localmente (y del perfil remoto si hay sesión). */
  const loadDisplayName = useCallback(async () => {
    try {
      const local = await SecureStore.getItemAsync(DISPLAY_NAME_KEY);
      if (local) {
        setDisplayName(local);
        return;
      }
      if (services.supabase !== null) {
        const { data: sessionData } = await services.supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (userId) {
          const { data: profile } = await services.supabase
            .from('profiles')
            .select('display_name')
            .eq('id', userId)
            .single();
          if (profile?.display_name) {
            setDisplayName(profile.display_name);
            await SecureStore.setItemAsync(DISPLAY_NAME_KEY, profile.display_name);
          }
        }
      }
    } catch {
      // Ignorar errores de lectura del nombre.
    }
  }, [services]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void loadDisplayName();
    }, [load, loadDisplayName]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const syncNow = useCallback(async () => {
    if (services.syncNow === null) {
      setSyncMessage(null);
      setSyncMessage('Sincronización no disponible en esta compilación.');
      return;
    }
    if (authState !== 'signed_in') {
      setSyncMessage(null);
      setSyncMessage('Inicia sesión para sincronizar con el servidor.');
      return;
    }
    setSyncMessage(null);
    setSyncMessage('Sincronizando…');
    const result: SyncStatus = await services.syncNow.execute();
    // TEMP-DIAG: resultado final de la sincronización.
    console.log('[DIAG sync] syncNow.execute result=', JSON.stringify(result));
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
  const pendingSessions = pending?.sessions ?? 0;
  const userInitials = displayName
    ? displayName.slice(0, 2).toUpperCase()
    : accountScope?.email
      ? accountScope.email.slice(0, 2).toUpperCase()
      : 'FO';

  const quickItems = [
    { title: 'Estado general', desc: 'Resumen de bienestar', route: '/estado' as const },
    { title: 'Historial', desc: 'Registros guardados', route: '/historial' as const },
    { title: 'Análisis', desc: 'Tendencias y estadísticas', route: '/analisis' as const },
    { title: 'Linterna', desc: 'Inspección pupilar y pulso con linterna', route: '/linterna' as const },
  ];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.md,
            paddingHorizontal: r.horizontalMargin,
            maxWidth: r.contentMaxWidth,
            alignSelf: 'center',
            width: '100%',
          },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topbar}>
          <View style={styles.brandRow}>
            <Text style={styles.brand}>first</Text>
            <Text style={[styles.brand, styles.brandAccent]}>Option</Text>
          </View>
          <View style={styles.topActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Tu cuenta" onPress={() => {
              if (authState === 'signed_in') {
                void router.push('/perfil');
              } else {
                void router.push('/acceso');
              }
            }} style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}>
              <Text style={styles.avatarText}>{userInitials}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.pill}>
            <View style={styles.dot} />
            <Text style={styles.pillText}>Modo privado</Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillText}>Datos protegidos</Text>
          </View>
          {accountScope?.kind === 'remote' ? (
            <View style={styles.pill}>
              <Text style={styles.pillText} numberOfLines={1}>{accountScope.email ?? 'Cuenta activa'}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.welcome}>
          <Text style={styles.eyebrow}>Tu espacio de bienestar</Text>
          <Text style={styles.welcomeTitle}>
            Hola{displayName ? `, ${displayName}` : accountScope?.email ? `, ${accountScope.email.split('@')[0]}` : ''}.
          </Text>
          <Text style={styles.welcomeText}>Haz seguimiento de tu bienestar, registra tus mediciones y consulta tu evolución en un solo lugar.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Registrar seguimiento"
            onPress={() => router.push('/registrar')}
            style={({ pressed }) => [styles.primaryCta, pressed && styles.pressed]}
          >
            <Text style={styles.primaryCtaText}>＋  Registrar seguimiento</Text>
          </Pressable>
        </View>

        {error !== null && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Resumen de hoy</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/historial')}><Text style={styles.textButton}>Ver historial ›</Text></Pressable>
        </View>
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Registro de hoy</Text>
            <Text style={styles.metricValue}>{todayDone ? '1+' : '0'}</Text>
            <Text style={[styles.metricNote, { color: todayDone ? palette.success : palette.textSecondary }]}>
              {todayDone ? '● Registro completado' : 'Añade tu registro'}
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Última medición</Text>
            <Text style={styles.metricValue}>{entry ? String(entry.observationCount) : '—'}</Text>
            <Text style={[styles.metricNote, { color: palette.textSecondary }]}>
              {entry ? entry.age.label : 'Aún no hay datos recientes'}
            </Text>
          </View>
        </View>

        <View style={styles.activity}>
          <View style={styles.activityIcon}><Text style={styles.activityIconText}>!</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.activityTitle}>Actividad reciente</Text>
            <Text style={styles.activityText}>
              {entry
                ? `${entry.summaryParts.length > 0 ? entry.summaryParts.join(' · ') : 'Sesión registrada'} · ${entry.syncState === 'local_only' ? 'solo en dispositivo' : entry.syncState}`
                : 'Tu información está al día. Los registros nuevos aparecerán aquí.'}
            </Text>
          </View>
        </View>

        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Accesos rápidos</Text></View>
        <View style={styles.quickGrid}>
          {quickItems.map((item) => (
            <Pressable
              key={item.route}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              onPress={() => router.push(item.route)}
              style={({ pressed }) => [styles.quick, pressed && styles.quickPressed]}
            >
              <Text style={styles.quickTitle}>{item.title}</Text>
              <Text style={styles.quickDesc}>{item.desc}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Cuenta y sincronización</Text></View>
        <View style={styles.syncCard}>
          <View style={styles.syncSymbol}><Text style={styles.syncSymbolText}>↻</Text></View>
          <View style={styles.syncInfo}>
            <Text style={styles.syncTitle}>Sincronización</Text>
            <Text style={styles.syncText}>
              {services.remoteConfigured
                ? (authState === 'signed_in'
                    ? (pendingSessions > 0 ? `${pendingSessions} registro(s) pendiente(s) de sincronizar` : 'Sin pendientes de sincronizar')
                    : 'Inicia sesión para sincronizar')
                : 'No configurada en esta compilación'}
            </Text>
          </View>
          {services.remoteConfigured && authState === 'signed_in' ? (
            <Pressable accessibilityRole="button" onPress={() => void syncNow()} style={({ pressed }) => [styles.syncBtn, pressed && styles.pressed]}>
              <Text style={styles.syncBtnText}>Sincronizar</Text>
            </Pressable>
          ) : services.remoteConfigured ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/acceso')} style={({ pressed }) => [styles.syncBtn, pressed && styles.pressed]}>
              <Text style={styles.syncBtnText}>Acceder</Text>
            </Pressable>
          ) : null}
        </View>
        {syncMessage ? <Text style={styles.syncMessage}>{syncMessage}</Text> : null}

        {authState === 'signed_in' ? (
          <Card title="Cuenta">
            <Text style={styles.bodyText}>Sesión: {accountScope?.email ?? 'cuenta remota'}</Text>
            {localCount > 0 ? (
              <>
                <Text style={styles.noteText}>Tienes {localCount} registro(s) locales sin asociar a tu cuenta.</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={async () => {
                    try {
                      const n = await services.manageAccount.adoptLocalRecords();
                      setAdoptMsg(`Se asociaron ${n} registro(s) a tu cuenta.`);
                      await load();
                    } catch (e) {
                      setAdoptMsg(e instanceof Error ? e.message : 'No se pudo asociar. Inténtalo de nuevo.');
                    }
                  }}
                  style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.secondaryBtnText}>Asociar registros locales</Text>
                </Pressable>
              </>
            ) : null}
            {adoptMsg ? <Text style={styles.noteText}>{adoptMsg}</Text> : null}
            <Pressable
              accessibilityRole="button"
              onPress={async () => {
                if (services.supabase !== null) await services.supabase.auth.signOut();
                setAdoptMsg(null);
                await load();
              }}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryBtnText}>Cerrar sesión</Text>
            </Pressable>
          </Card>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => router.push('/acceso')} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}>
            <Text style={styles.secondaryBtnText}>Iniciar sesión / crear cuenta</Text>
          </Pressable>
        )}

        <Text style={styles.disclaimer}>
          firstOption es una herramienta de registro y seguimiento personal. No sustituye la valoración, el diagnóstico ni las recomendaciones de un profesional de salud.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { paddingBottom: spacing.xxl, gap: spacing.md },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl },
  brandRow: { flexDirection: 'row', alignItems: 'baseline' },
  brand: { fontSize: 29, fontWeight: '700', letterSpacing: -1.45, color: palette.textPrimary },
  brandAccent: { color: palette.accent },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 43, height: 43, borderRadius: 21.5, backgroundColor: palette.surfaceAlt, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: palette.textPrimary, fontSize: 14, fontWeight: '600' },
  statusRow: { flexDirection: 'row', gap: 9, flexWrap: 'wrap', marginTop: spacing.md, marginBottom: spacing.sm },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: palette.border, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 13, backgroundColor: palette.surfaceAlt },
  pillText: { fontSize: 12, color: palette.textSecondary },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: palette.success },
  welcome: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, marginBottom: spacing.xs },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase', color: palette.textSecondary, fontWeight: '600' },
  welcomeTitle: { fontSize: 30, letterSpacing: -1.8, fontWeight: '700', color: palette.textPrimary },
  welcomeText: { ...typography.body, color: palette.textSecondary, lineHeight: 21 },
  primaryCta: { borderRadius: 14, backgroundColor: palette.accent, paddingHorizontal: 19, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  primaryCtaText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 15 },
  sectionTitle: { fontSize: 19, fontWeight: '600', letterSpacing: -0.45, color: palette.textPrimary },
  textButton: { color: '#62A6FF', fontSize: 13, fontWeight: '600', padding: 5 },
  metricsGrid: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', marginBottom: 16 },
  metricCard: { flex: 1, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: radius.lg, padding: 20, minHeight: 145, gap: 6 },
  metricLabel: { color: palette.textSecondary, fontSize: 13, marginBottom: 12 },
  metricValue: { fontSize: 37, fontWeight: '700', letterSpacing: -1.5, color: palette.textPrimary, lineHeight: 1 },
  metricNote: { fontSize: 12, fontWeight: '600' },
  activity: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: radius.lg, padding: 19, flexDirection: 'row', gap: 14, alignItems: 'flex-start', marginBottom: 34 },
  activityIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,181,71,0.12)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  activityIconText: { color: palette.attention, fontWeight: '700' },
  activityTitle: { fontSize: 14, fontWeight: '600', color: palette.textPrimary, marginVertical: 1 },
  activityText: { fontSize: 13, color: palette.textSecondary, marginTop: 0, lineHeight: 1.65 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 13, marginBottom: 34 },
  quick: { width: '33.333%', minWidth: 0, flexGrow: 1, minHeight: 132, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: radius.lg, padding: 19, justifyContent: 'flex-end', gap: 4 },
  quickPressed: { borderColor: 'rgba(10,132,255,0.6)', backgroundColor: palette.surfaceAlt },
  quickTitle: { fontSize: 14, fontWeight: '600', color: palette.textPrimary, marginBottom: 5 },
  quickDesc: { fontSize: 12, lineHeight: 1.45, color: palette.textSecondary },
  syncCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: radius.lg, padding: 19, marginBottom: 10 },
  syncSymbol: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(10,132,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  syncSymbolText: { color: '#58A6FF', fontWeight: '700', fontSize: 16 },
  syncInfo: { flex: 1 },
  syncTitle: { fontSize: 14, fontWeight: '600', color: palette.textPrimary },
  syncText: { fontSize: 12, color: palette.textSecondary, marginTop: 4 },
  syncBtn: { borderRadius: 11, borderWidth: 1, borderColor: 'rgba(10,132,255,0.55)', backgroundColor: 'rgba(10,132,255,0.08)', color: '#69B0FF', paddingVertical: 10, paddingHorizontal: 15, fontWeight: '600', fontSize: 13 },
  syncBtnText: { fontSize: 13, fontWeight: '600', color: '#69B0FF' },
  syncMessage: { ...typography.small, color: palette.textSecondary },
  secondaryBtn: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: palette.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, alignSelf: 'flex-start' },
  secondaryBtnText: { ...typography.secondary, color: palette.accent, fontWeight: '700' },
  bodyText: { ...typography.body, color: palette.textSecondary },
  noteText: { ...typography.secondary, color: palette.textSecondary, fontStyle: 'italic' },
  pressed: { opacity: 0.9 },
  errorBox: { backgroundColor: `${palette.priority}14`, borderRadius: radius.sm, borderWidth: 1, borderColor: palette.priority, padding: spacing.sm },
  errorText: { ...typography.secondary, color: palette.priority, fontWeight: '600' },
  disclaimer: { fontSize: 10, lineHeight: 1.6, color: '#707580', textAlign: 'center', padding: 15, paddingTop: 5, paddingBottom: 5 },
});

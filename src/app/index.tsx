import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import type { LatestLogStatus } from '@/application/use-cases/list-recent-activity';
import type { SyncStatus } from '@/application/use-cases/sync-now';
import { StatusChip } from '@/presentation/components/screen';
import { useAppServices } from './providers';
import { cardStyle, palette, radius, spacing, typography } from '@/presentation/theme/tokens';

const PHASE_LABELS: Record<string, string> = {
  preflight: 'Preflight',
  inflight: 'En vuelo',
  postflight: 'Postflight',
};

const SYNC_LABELS: Record<string, string> = {
  local_only: 'Solo en el dispositivo',
  pending_sync: 'Pendiente de sincronizar',
  synced: 'Sincronizado',
  sync_failed: 'Sincronización fallida (se reintenta)',
  conflict: 'Conflicto de sincronización',
};

const SYNC_TONES: Record<string, 'neutral' | 'attention'> = {
  local_only: 'attention',
  pending_sync: 'attention',
  synced: 'neutral',
  sync_failed: 'attention',
  conflict: 'attention',
};

export default function HomeScreen() {
  const services = useAppServices();
  const [status, setStatus] = useState<LatestLogStatus | null>(null);
  const [pending, setPending] = useState<{ sessions: number; observations: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [authState, setAuthState] = useState<'checking' | 'signed_in' | 'signed_out'>('checking');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [latest, pendingCount] = await Promise.all([
        services.listRecentActivity.latestLogStatus(),
        services.listRecentActivity.countPendingSync(),
      ]);
      setStatus(latest);
      setPending(pendingCount);
      setError(null);
    } catch {
      setError('No se pudieron leer los registros locales. Inténtalo de nuevo.');
    }
    // Estado de sesión remota (sin red: sigue en signed_out pero honesto).
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
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
        }
      >
        {error !== null && (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Último registro con antigüedad */}
        <View style={[cardStyle, styles.section]}>
          <Text style={styles.sectionTitle}>Último registro</Text>
          {entry === null ? (
            <Text style={styles.bodyText}>
              Aún no hay registros guardados en este dispositivo.
            </Text>
          ) : (
            <View style={styles.gap}>
              <Text style={styles.bodyText}>{entry.age.label}</Text>
              {entry.summaryParts.length > 0 ? (
                <Text style={styles.summaryText}>{entry.summaryParts.join(' · ')}</Text>
              ) : null}
              {entry.note !== null ? (
                <Text style={styles.noteText} numberOfLines={2}>
                  Nota: {entry.note}
                </Text>
              ) : null}
              <View style={styles.row}>
                <StatusChip
                  label={PHASE_LABELS[entry.missionPhase] ?? entry.missionPhase}
                  tone="neutral"
                />
                <StatusChip
                  label={SYNC_LABELS[entry.syncState] ?? entry.syncState}
                  tone={SYNC_TONES[entry.syncState] ?? 'attention'}
                />
              </View>
            </View>
          )}
        </View>

        {/* Estado de sincronización */}
        <View style={[cardStyle, styles.section]}>
          <Text style={styles.sectionTitle}>Sincronización</Text>
          <Text style={styles.bodyText}>
            {pending !== null && pending.sessions > 0
              ? `${pending.sessions} registro(s) guardados en este dispositivo, pendientes de sincronizar.`
              : 'Sin registros pendientes de sincronizar. Los nuevos registros se encolan automáticamente y se envían con "Sincronizar ahora".'}
          </Text>
          {services.remoteConfigured ? (
            authState === 'signed_in' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sincronizar ahora con el servidor"
                onPress={() => void syncNow()}
                style={styles.syncButton}
              >
                <Text style={styles.syncButtonText}>Sincronizar ahora</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Iniciar sesión para sincronizar"
                onPress={() => router.push('/acceso')}
                style={styles.syncButton}
              >
                <Text style={styles.syncButtonText}>Iniciar sesión para sincronizar</Text>
              </Pressable>
            )
          ) : (
            <Text style={styles.hintText}>
              Sincronización no configurada en esta compilación.
            </Text>
          )}
          {syncMessage !== null && (
            <Text style={styles.syncStatusText} accessibilityRole="status">
              {syncMessage}
            </Text>
          )}
        </View>

        {/* Tareas pendientes: registro de hoy */}
        <View style={[cardStyle, styles.section]}>
          <Text style={styles.sectionTitle}>Pendiente</Text>
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
              No hay registros: registrar el primer seguimiento es una tarea
              pendiente.
            </Text>
          )}
        </View>

        {/* Acceso al historial */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir historial de registros"
          onPress={() => router.push('/historial')}
          style={({ pressed }) => [cardStyle, pressed && styles.pressed]}
        >
          <Text style={styles.linkTitle}>Historial</Text>
          <Text style={styles.bodyText}>Registros guardados en este dispositivo.</Text>
        </Pressable>

        {/* Linterna de inspección pupilar */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir linterna de inspección pupilar"
          onPress={() => router.push('/linterna')}
          style={({ pressed }) => [cardStyle, pressed && styles.pressed]}
        >
          <Text style={styles.linkTitle}>Linterna de inspección</Text>
          <Text style={styles.bodyText}>
            Luz LED para inspección pupilar y registro de lo observado.
            La linterna no mide ni deriva valores.
          </Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  flex2: { flex: 1 },
  section: { gap: spacing.xs },
  sectionTitle: { ...typography.subtitle, color: palette.textPrimary },
  bodyText: { ...typography.body, color: palette.textSecondary },
  summaryText: { ...typography.body, color: palette.textPrimary },
  noteText: { ...typography.secondary, color: palette.textSecondary, fontStyle: 'italic' },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs, flexWrap: 'wrap' },
  gap: { gap: spacing.xs },
  linkTitle: { ...typography.subtitle, color: palette.accent, marginBottom: spacing.xs },
  pressed: { opacity: 0.8 },
  ctaSpace: { height: spacing.xl },
  syncButton: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  syncButtonText: { ...typography.secondary, color: palette.accent, fontWeight: '600' },
  syncStatusText: { ...typography.small, color: palette.textSecondary, marginTop: spacing.xs },
  hintText: { ...typography.small, color: palette.textSecondary, marginTop: spacing.xs },
  errorBox: {
    backgroundColor: 'rgba(163,52,58,0.08)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.priority,
    padding: spacing.sm,
  },
  errorText: { ...typography.secondary, color: palette.priority, fontWeight: '600' },
});

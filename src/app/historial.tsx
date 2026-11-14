import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import type { RecentLogEntry } from '@/application/use-cases/list-recent-activity';
import { EmptyState, StatusChip } from '@/presentation/components/screen';
import { cardStyle, palette, spacing, typography } from '@/presentation/theme/tokens';
import { useAppServices } from './providers';

const PHASE_LABELS: Record<string, string> = {
  preflight: 'Preflight',
  inflight: 'En vuelo',
  postflight: 'Postflight',
};

const SYNC_LABELS: Record<string, string> = {
  local_only: 'Solo en el dispositivo',
  pending_sync: 'Pendiente de sincronizar',
  synced: 'Sincronizado',
  sync_failed: 'Sincronización fallida',
  conflict: 'Conflicto de sincronización',
};

const SYNC_TONES: Record<string, 'neutral' | 'attention'> = {
  local_only: 'attention',
  pending_sync: 'attention',
  synced: 'neutral',
  sync_failed: 'attention',
  conflict: 'attention',
};

/**
 * Historial de registros locales. Solo datos reales: sin promedios
 * fantasma ni análisis (llegan en los incrementos 4–5).
 */
export default function HistoryScreen() {
  const services = useAppServices();
  const [entries, setEntries] = useState<RecentLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await services.listRecentActivity.listRecent(60);
      setEntries(list);
      setError(null);
    } catch {
      setError('No se pudo leer el historial local.');
    }
  }, [services]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error !== null) {
    return (
      <>
        <Stack.Screen options={{ title: 'Historial' }} />
        <View style={styles.container}>
          <EmptyState title="Historial no disponible" description={error} />
        </View>
      </>
    );
  }

  if (entries === null) {
    return (
      <>
        <Stack.Screen options={{ title: 'Historial' }} />
        <View style={styles.container} accessible accessibilityLabel="Cargando historial">
          <Text style={styles.loadingText}>Cargando…</Text>
        </View>
      </>
    );
  }

  if (entries.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: 'Historial' }} />
        <View style={styles.container}>
          <EmptyState
            title="Sin registros todavía"
            description="Cuando registres seguimiento, aparecerá aquí. La ausencia de datos no se interpreta como normalidad."
          />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Historial' }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Text style={styles.countText}>
          {entries.length} registro(s), del más reciente al más antiguo. Guardados cifrados en este dispositivo.
        </Text>
        {entries.map((entry) => (
          <View key={entry.sessionId} style={[cardStyle, styles.gap]}>
            <View style={styles.row}>
              <Text style={styles.dateText}>{entry.age.label}</Text>
              <StatusChip
                label={SYNC_LABELS[entry.syncState] ?? entry.syncState}
                tone={SYNC_TONES[entry.syncState] ?? 'attention'}
              />
            </View>
            <Text style={styles.bodyText}>
              Fase: {PHASE_LABELS[entry.missionPhase] ?? entry.missionPhase}
            </Text>
            {entry.summaryParts.length > 0 ? (
              <View accessible accessibilityLabel={`Mediciones: ${entry.summaryParts.join(', ')}`}>
                {entry.summaryParts.map((part, i) => (
                  <Text key={`${entry.sessionId}-part-${i}`} style={styles.partText}>
                    • {part}
                  </Text>
                ))}
              </View>
            ) : null}
            {entry.note !== null ? (
              <Text style={styles.noteText}>Nota: {entry.note}</Text>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  container: { flex: 1, backgroundColor: palette.background, padding: spacing.lg, justifyContent: 'center' },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  gap: { gap: spacing.xs },
  countText: { ...typography.secondary, color: palette.textSecondary },
  dateText: { ...typography.subtitle, color: palette.textPrimary, flex: 1 },
  bodyText: { ...typography.body, color: palette.textSecondary },
  partText: { ...typography.body, color: palette.textPrimary },
  noteText: { ...typography.secondary, color: palette.textSecondary, fontStyle: 'italic' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  loadingText: { ...typography.body, color: palette.textSecondary, textAlign: 'center' },
});

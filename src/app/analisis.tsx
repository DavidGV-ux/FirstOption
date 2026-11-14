import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { cardStyle, palette, radius, spacing, typography } from '@/presentation/theme/tokens';
import { useAppServices } from './_providers';
import { windowSummary, slopePerDay } from '@/domain/analytics/descriptive';
import { evaluateEligibility } from '@/domain/analytics/eligibility';
import type { SessionWithObservations } from '@/domain/repositories/observation-repository';

const METRICS = [
  { id: 'heart_rate', name: 'Frecuencia cardíaca', unit: 'lpm' },
  { id: 'bp_systolic', name: 'Presión arterial sistólica', unit: 'mmHg' },
  { id: 'bp_diastolic', name: 'Presión arterial diastólica', unit: 'mmHg' },
  { id: 'spo2', name: 'Saturación de oxígeno', unit: '%' },
  { id: 'hemoglobin', name: 'Hemoglobina', unit: 'g/L' },
];

interface MetricStats {
  id: string;
  name: string;
  unit: string;
  count: number;
  latest: number | null;
  latestUnit: string | null;
  latestAt: string | null;
  previous: number | null;
  change: number | null;
  min: number | null;
  max: number | null;
  mean: number | null;
  spanDays: number | null;
  slopePerDay: number | null;
  distinctUnits: string[];
  eligibility: { state: string; reason: string };
}

function compute(sessions: SessionWithObservations[]): MetricStats[] {
  return METRICS.map((m) => {
    const obs = sessions
      .flatMap((s) => s.observations)
      .filter((o) => o.metricId === m.id)
      .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));

    const distinctUnits = Array.from(new Set(obs.map((o) => o.unitOriginal ?? '')));
    const points = obs.map((o) => ({ at: o.observedAt, value: o.valueOriginal }));
    const ws = windowSummary(points);
    const slope = slopePerDay(points);
    const latest = obs.length > 0 ? obs[obs.length - 1].valueOriginal : null;
    const latestUnit = obs.length > 0 ? obs[obs.length - 1].unitOriginal : null;
    const latestAt = obs.length > 0 ? obs[obs.length - 1].observedAt : null;
    const previous = obs.length > 1 ? obs[obs.length - 2].valueOriginal : null;
    const change = latest !== null && previous !== null ? latest - previous : null;
    const eligibility = evaluateEligibility({
      count: obs.length,
      spanDays: ws.spanDays,
      distinctUnits,
      methodChanged: false,
      metricSupported: true,
    });

    return {
      id: m.id,
      name: m.name,
      unit: m.unit,
      count: obs.length,
      latest,
      latestUnit,
      latestAt,
      previous,
      change,
      min: ws.min,
      max: ws.max,
      mean: ws.mean,
      spanDays: ws.spanDays,
      slopePerDay: slope,
      distinctUnits,
      eligibility,
    };
  });
}

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatNum(v: number | null, decimals = 1): string {
  if (v === null) return '—';
  return Number.isInteger(v) ? String(v) : v.toFixed(decimals);
}

export default function AnalisisScreen() {
  const services = useAppServices();
  const [stats, setStats] = useState<MetricStats[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const sessions = await services.listRecentActivity.listRecentSessions(200);
      setStats(compute(sessions));
      setError(null);
    } catch {
      setError('No se pudieron leer los registros para el análisis.');
    }
  }, [services]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Análisis descriptivo' }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Text style={styles.subtitle} maxFontSizeMultiplier={1.4}>
          Descripción estadística de tus registros: valores recientes, cambio
          respecto al anterior, rango y tendencia por tiempo real. No es un
          diagnóstico ni una predicción.
        </Text>

        {error !== null && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {stats === null && error === null && (
          <Text style={styles.hintText}>Cargando análisis…</Text>
        )}

        {stats !== null &&
          stats.map((s) => (
            <View key={s.id} style={[cardStyle, styles.card]}>
              <Text style={styles.cardTitle}>{s.name}</Text>
              <Text style={styles.hintText}>
                {s.count} registro(s) · unidades: {s.distinctUnits.join(', ') || '—'}
              </Text>

              <View style={styles.row}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Último</Text>
                  <Text style={styles.statValue}>
                    {formatNum(s.latest)} {s.latestUnit ?? ''}
                  </Text>
                  <Text style={styles.statSub}>{formatDate(s.latestAt)}</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Cambio vs anterior</Text>
                  <Text style={styles.statValue}>
                    {s.change === null ? '—' : `${s.change > 0 ? '+' : ''}${formatNum(s.change)}`}
                  </Text>
                  <Text style={styles.statSub}>
                    {s.previous === null ? 'sin referencia' : `anterior ${formatNum(s.previous)}`}
                  </Text>
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Mín / Máx</Text>
                  <Text style={styles.statValue}>
                    {formatNum(s.min)} / {formatNum(s.max)}
                  </Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Media</Text>
                  <Text style={styles.statValue}>{formatNum(s.mean)}</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Pendiente/día</Text>
                  <Text style={styles.statValue}>
                    {s.slopePerDay === null ? '—' : formatNum(s.slopePerDay, 2)}
                  </Text>
                </View>
              </View>

              <View style={styles.eligibilityBox}>
                <Text style={styles.eligibilityState}>
                  Elegibilidad: {s.eligibility.state}
                </Text>
                <Text style={styles.hintText}>{s.eligibility.reason}</Text>
              </View>

              {s.count === 0 && (
                <Text style={styles.hintText}>
                  Sin registros para esta métrica. Registra seguimiento para ver
                  el análisis.
                </Text>
              )}
            </View>
          ))}

        <View style={[cardStyle, styles.card]}>
          <Text style={styles.cardTitle}>Funciones pendientes (honestas)</Text>
          <Text style={styles.bodyText}>
            • Tendencias con método versionado y criterio de estabilidad.
          </Text>
          <Text style={styles.bodyText}>
            • Proyección experimental (pronóstico de referencia) con intervalo
            de predicción real.
          </Text>
          <Text style={styles.bodyText}>
            • Líneas basales versionadas y comparación contra ellas.
          </Text>
          <Text style={styles.bodyText}>
            • Escenarios de cruce de umbral (desactivados por defecto).
          </Text>
          <Text style={styles.bodyText}>
            • Pronóstico clínico: desactivado hasta contar con modelo evaluado.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  subtitle: { ...typography.body, color: palette.textSecondary },
  card: { gap: spacing.xs },
  cardTitle: { ...typography.subtitle, color: palette.textPrimary },
  bodyText: { ...typography.body, color: palette.textSecondary },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.xs },
  stat: { flex: 1, minWidth: 90, gap: 2 },
  statLabel: { ...typography.small, color: palette.textSecondary },
  statValue: { ...typography.body, color: palette.textPrimary, fontWeight: '600' },
  statSub: { ...typography.small, color: palette.textSecondary },
  eligibilityBox: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  eligibilityState: { ...typography.secondary, color: palette.accent, fontWeight: '600' },
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

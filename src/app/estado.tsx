import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Card, SectionHeader, StatusBadge } from '@/presentation/components/ui';
import { useAppServices } from './_providers';
import { useResponsive } from '@/presentation/hooks/use-responsive';
import { cardStyle, palette, radius, spacing, typography } from '@/presentation/theme/tokens';
import type { SessionWithObservations } from '@/domain/repositories/observation-repository';
import { evaluateMetricRange, statusColor, statusLabelEs } from '@/domain/analytics/health-ranges';
import { getMetricDefinition } from '@/domain/metrics/catalog-v1';

type TrendPoint = { at: string; value: number };

type MetricView = {
  metricId: string;
  name: string;
  unit: string | null;
  latest: number | null;
  latestAt: string | null;
  points: TrendPoint[];
  status: ReturnType<typeof evaluateMetricRange>;
};

const WELLBEING = ['mood_self_report', 'stress_self_report', 'fatigue_self_report', 'sleep_quality_self_report', 'sleep_duration'];
const VITALS = ['heart_rate', 'bp_systolic', 'bp_diastolic', 'spo2'];
const SYMPTOMS = ['symptom_headache', 'symptom_nausea', 'symptom_dizziness', 'symptom_msk_pain', 'symptom_visual_disturbance', 'symptom_nasal_congestion'];
const HEMA = ['hemoglobin', 'hematocrit', 'rbc_count', 'mcv', 'rdw', 'reticulocyte_pct', 'reticulocyte_absolute', 'ferritin'];

function buildMetricViews(sessions: SessionWithObservations[], ids: string[]): MetricView[] {
  return ids.map((metricId) => {
    const def = getMetricDefinition(metricId);
    const obs = sessions
      .flatMap((s) => s.observations.map((o) => ({ ...o, sessionMission: s.session.missionPhase })))
      .filter((o) => o.metricId === metricId)
      .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
    const points: TrendPoint[] = obs.map((o) => ({ at: o.observedAt, value: o.valueOriginal }));
    const latest = points.length > 0 ? points[points.length - 1] : null;
    return {
      metricId,
      name: def?.nameEs ?? metricId,
      unit: def?.canonicalUnit ?? (obs[0]?.unitOriginal ?? null),
      latest: latest?.value ?? null,
      latestAt: latest?.at ?? null,
      points: points.slice(-12),
      status: latest ? evaluateMetricRange(metricId, latest.value) : { status: 'sin_referencia', label: 'Sin datos', detail: 'Aún no hay registros para esta métrica.' },
    };
  });
}

function formatValue(v: number | null, metricId: string): string {
  if (v === null) return '—';
  const def = getMetricDefinition(metricId);
  if (def?.valueType === 'boolean') return v === 1 ? 'Presente' : 'Ausente';
  if (def?.valueType === 'ordinal_scale') return `${v}/5`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function Sparkline({ points, color }: { points: TrendPoint[]; color: string }) {
  if (points.length < 2) {
    return <Text style={styles.sparkEmpty}>Sin tendencia suficiente</Text>;
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return (
    <View style={styles.sparkRow} accessibilityLabel={`Tendencia con ${points.length} puntos`}>
      {points.map((p, i) => {
        const h = 8 + ((p.value - min) / span) * 28;
        return (
          <View key={`${p.at}-${i}`} style={styles.sparkBarWrap}>
            <View style={[styles.sparkBar, { height: h, backgroundColor: color }]} />
          </View>
        );
      })}
    </View>
  );
}

function overallSummary(metrics: MetricView[]): { label: string; tone: 'success' | 'attention' | 'priority' | 'neutral'; detail: string } {
  const withData = metrics.filter((m) => m.latest !== null);
  if (withData.length === 0) return { label: 'Sin datos', tone: 'neutral', detail: 'Registra seguimiento para ver tu estado general.' };
  const counts = { aceptable: 0, atencion: 0, negativo: 0, informativo: 0, sin_referencia: 0 } as Record<string, number>;
  for (const m of withData) counts[m.status.status] = (counts[m.status.status] ?? 0) + 1;
  if (counts.negativo >= 2) return { label: 'Revisar', tone: 'priority', detail: `${counts.negativo} métrica(s) en rango negativo informativo y ${counts.atencion} en atención. No es diagnóstico.` };
  if (counts.negativo >= 1 || counts.atencion >= 2) return { label: 'Atención', tone: 'attention', detail: `Hay métricas en atención/negativo (informativo). Revisa contexto y tendencias.` };
  if (counts.aceptable >= Math.ceil(withData.length * 0.6)) return { label: 'Favorable', tone: 'success', detail: `La mayoría de métricas con datos están en rango aceptable/informativo.` };
  return { label: 'Mixto', tone: 'attention', detail: 'Estado mixto según rangos informativos configurados.' };
}

function MetricCard({ m }: { m: MetricView }) {
  const color = statusColor(m.status.status);
  return (
    <View style={[cardStyle, styles.metricCard]}>
      <View style={styles.metricHeader}>
        <Text style={styles.metricName}>{m.name}</Text>
        <View style={[styles.statusPill, { borderColor: color, backgroundColor: `${color}14` }]}>
          <Text style={[styles.statusPillText, { color }]}>{statusLabelEs(m.status.status)}</Text>
        </View>
      </View>
      <View style={styles.metricRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.metricValue}>
            {formatValue(m.latest, m.metricId)}{m.unit ? ` ${m.unit}` : ''}
          </Text>
          <Text style={styles.metricSub}>{m.latestAt ? `Último: ${formatDate(m.latestAt)}` : 'Sin datos'}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Sparkline points={m.points} color={color} />
        </View>
      </View>
      <Text style={styles.metricDetail}>{m.status.detail}</Text>
    </View>
  );
}

export default function EstadoGeneralScreen() {
  const services = useAppServices();
  const r = useResponsive();
  const [sessions, setSessions] = useState<SessionWithObservations[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifStatus, setNotifStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await services.listRecentActivity.listRecentSessions(120);
      setSessions(data);
    } finally {
      setLoading(false);
    }
  }, [services]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const wellbeing = useMemo(() => buildMetricViews(sessions, WELLBEING), [sessions]);
  const vitals = useMemo(() => buildMetricViews(sessions, VITALS), [sessions]);
  const symptoms = useMemo(() => buildMetricViews(sessions, SYMPTOMS), [sessions]);
  const hema = useMemo(() => buildMetricViews(sessions, HEMA), [sessions]);
  const allKey = useMemo(() => [...wellbeing, ...vitals, ...hema], [wellbeing, vitals, hema]);
  const summary = useMemo(() => overallSummary(allKey), [allKey]);

  const scheduleReminder = useCallback(async () => {
    try {
      // Carga dinámica para no romper si el módulo no está disponible
      const Notifications = await import('expo-notifications');
      const perm = await Notifications.requestPermissionsAsync();
      if (!perm.granted) {
        setNotifStatus('Permiso de notificaciones denegado. Puedes activarlo en ajustes del sistema.');
        return;
      }
      await Notifications.cancelAllScheduledNotificationsAsync();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'firstOption: registro diario',
          body: 'Recuerda registrar tu seguimiento y revisar tu estado general.',
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 20, minute: 0 },
      });
      setNotifStatus('Recordatorio diario programado (20:00). Puedes cambiarlo volviendo a pulsar.');
    } catch {
      setNotifStatus('No se pudieron programar notificaciones en este entorno (requiere soporte de notificaciones del build).');
    }
  }, []);

  const sendTestNotification = useCallback(async () => {
    try {
      const Notifications = await import('expo-notifications');
      const perm = await Notifications.getPermissionsAsync();
      if (!perm.granted) {
        setNotifStatus('Sin permiso de notificaciones. Programa primero el recordatorio para solicitar permiso.');
        return;
      }
      await Notifications.scheduleNotificationAsync({
        content: { title: 'firstOption', body: 'Notificación de prueba: tu estado general está disponible en la app.' },
        trigger: null,
      });
      setNotifStatus('Notificación de prueba enviada.');
    } catch {
      setNotifStatus('No se pudo enviar la notificación en este entorno.');
    }
  }, []);

  return (
    <>
      <Stack.Screen options={{ title: 'Estado general' }} />
      <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingHorizontal: r.horizontalMargin, maxWidth: r.contentMaxWidth, alignSelf: 'center', width: '100%' }]}>
        {loading ? <Text style={styles.body}>Cargando estado…</Text> : null}

        <View style={[cardStyle, styles.hero]}>
          <Text style={styles.heroKicker}>Gráfica y resumen</Text>
          <Text style={styles.heroTitle}>Estado general de salud</Text>
          <View style={styles.row}>
            <StatusBadge label={summary.label} tone={summary.tone} />
            <Text style={styles.body}>{sessions.length} sesión(es) analizadas</Text>
          </View>
          <Text style={styles.body}>{summary.detail}</Text>
          <Text style={styles.disclaimer}>Informativo, no diagnóstico. Los rangos son referenciales/plausibilidad y pueden variar por persona y contexto.</Text>
        </View>

        <SectionHeader title="Bienestar y fatiga" />
        <Text style={styles.sectionHint}>Ánimo, estrés, fatiga y sueño (escalas autorreportadas) con tendencia reciente.</Text>
        {wellbeing.map((m) => <MetricCard key={m.metricId} m={m} />)}

        <SectionHeader title="Signos vitales" />
        <Text style={styles.sectionHint}>Último valor, clasificación informativa por rangos de referencia y gráfica de evolución.</Text>
        {vitals.map((m) => <MetricCard key={m.metricId} m={m} />)}

        <SectionHeader title="Síntomas reportados" />
        <Text style={styles.sectionHint}>Presencia/ausencia reciente (informativo).</Text>
        <View style={styles.symptomGrid}>
          {symptoms.map((m) => {
            const color = statusColor(m.status.status);
            return (
              <View key={m.metricId} style={[styles.symptomChip, { borderColor: color }]}>
                <Text style={styles.symptomName}>{m.name}</Text>
                <Text style={[styles.symptomVal, { color }]}>{m.latest === null ? '—' : m.latest === 1 ? 'Presente' : 'Ausente'}</Text>
              </View>
            );
          })}
        </View>

        <SectionHeader title="Hematología y estudios" />
        <Text style={styles.sectionHint}>Gráfica por métrica/estudio según registros de laboratorio disponibles.</Text>
        {hema.every((m) => m.latest === null) ? (
          <Card title="Sin estudios hematológicos">
            <Text style={styles.body}>Registra resultados en Laboratorio para ver su evolución y rangos informativos.</Text>
          </Card>
        ) : (
          hema.filter((m) => m.latest !== null || m.points.length > 0).map((m) => <MetricCard key={m.metricId} m={m} />)
        )}

        <SectionHeader title="Análisis por patrones de voz" />
        <View style={[cardStyle, styles.infoBox]}>
          <StatusBadge label="No disponible" tone="neutral" />
          <Text style={styles.cardTitle}>Voz (pendiente)</Text>
          <Text style={styles.body}>
            El análisis por patrones de voz no está implementado. Requiere captura de audio con consentimiento, procesamiento y un método validado con limitaciones claras; no debe usarse para diagnóstico. Se habilitará solo cuando exista un módulo evaluado y un feature flag explícito.
          </Text>
        </View>

        <SectionHeader title="Notificaciones" />
        <Card title="Recordatorios y avisos">
          <Text style={styles.body}>
            Programa un recordatorio diario para registrar tu seguimiento y revisar tu estado. Las notificaciones son locales al dispositivo (cuando el entorno lo soporta).
          </Text>
          <View style={styles.actionsRow}>
            <Pressable accessibilityRole="button" onPress={() => void scheduleReminder()} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
              <Text style={styles.primaryBtnText}>Programar recordatorio diario</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void sendTestNotification()} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}>
              <Text style={styles.secondaryBtnText}>Enviar notificación de prueba</Text>
            </Pressable>
          </View>
          {notifStatus ? <Text style={styles.body}>{notifStatus}</Text> : null}
        </Card>

        <Text style={styles.footer}>firstOption no es un dispositivo médico. Gráficas y rangos son informativos y no constituyen diagnóstico.</Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  hero: { gap: spacing.sm },
  heroKicker: { ...typography.small, color: palette.accent, textTransform: 'uppercase', letterSpacing: 0.8 },
  heroTitle: { ...typography.title, color: palette.textPrimary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  body: { ...typography.body, color: palette.textSecondary },
  disclaimer: { ...typography.small, color: palette.textSecondary, fontStyle: 'italic' },
  sectionHint: { ...typography.secondary, color: palette.textSecondary, marginBottom: spacing.xs },
  metricCard: { gap: spacing.xs },
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  metricName: { ...typography.cardTitle, color: palette.textPrimary, flex: 1 },
  statusPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  statusPillText: { ...typography.small, fontWeight: '700' },
  metricRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  metricValue: { fontSize: 22, fontWeight: '700', color: palette.textPrimary },
  metricSub: { ...typography.small, color: palette.textSecondary },
  metricDetail: { ...typography.small, color: palette.textSecondary },
  sparkRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 40 },
  sparkBarWrap: { width: 8, justifyContent: 'flex-end', height: 40 },
  sparkBar: { width: 8, borderRadius: 3, minHeight: 4 },
  sparkEmpty: { ...typography.small, color: palette.textSecondary },
  symptomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  symptomChip: { minWidth: '45%', flexGrow: 1, borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm, backgroundColor: palette.surface, gap: 2 },
  symptomName: { ...typography.secondary, color: palette.textPrimary, fontWeight: '600' },
  symptomVal: { ...typography.small, fontWeight: '700' },
  infoBox: { gap: spacing.xs },
  cardTitle: { ...typography.cardTitle, color: palette.textPrimary },
  actionsRow: { gap: spacing.sm, marginTop: spacing.xs },
  primaryBtn: { minHeight: 48, borderRadius: radius.md, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  primaryBtnText: { ...typography.body, color: '#FFFFFF', fontWeight: '700' },
  secondaryBtn: { minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: palette.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  secondaryBtnText: { ...typography.secondary, color: palette.accent, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  footer: { ...typography.small, color: palette.textSecondary, textAlign: 'center', marginTop: spacing.sm },
});

import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  points: TrendPoint[]; // todos, ordenados por fecha
  status: ReturnType<typeof evaluateMetricRange>;
};

type TrendAssessment = {
  direction: 'mejora' | 'empeoramiento' | 'estable' | 'sin_datos';
  label: string;
  detail: string;
  alert: boolean;
};

const WELLBEING = ['mood_self_report', 'stress_self_report', 'fatigue_self_report', 'sleep_quality_self_report', 'sleep_duration'];
const VITALS = ['heart_rate', 'bp_systolic', 'bp_diastolic', 'spo2'];
const SYMPTOMS = ['symptom_headache', 'symptom_nausea', 'symptom_dizziness', 'symptom_msk_pain', 'symptom_visual_disturbance', 'symptom_nasal_congestion'];
const HEMA = ['hemoglobin', 'hematocrit', 'rbc_count', 'mcv', 'rdw', 'reticulocyte_pct', 'reticulocyte_absolute', 'ferritin'];

function buildMetricViews(sessions: SessionWithObservations[], ids: string[]): MetricView[] {
  return ids.map((metricId) => {
    const def = getMetricDefinition(metricId);
    const obs = sessions
      .flatMap((s) => s.observations)
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
      points,
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

function formatDateFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function isHigherBetter(metricId: string): boolean | null {
  if (metricId === 'mood_self_report' || metricId === 'sleep_quality_self_report') return true;
  if (metricId === 'stress_self_report' || metricId === 'fatigue_self_report') return false;
  if (metricId.startsWith('symptom_')) return false; // presente (1) es peor
  if (metricId === 'spo2') return true;
  if (metricId === 'sleep_duration') return true; // dentro de rango, más hacia óptimo mejor (simplificado)
  return null; // depende de rango/neutral
}

function assessTrend(m: MetricView): TrendAssessment {
  if (m.points.length < 2 || m.latest === null) {
    return { direction: 'sin_datos', label: 'Sin tendencia', detail: 'Se necesitan al menos 2 registros en días/mediciones para evaluar cambio.', alert: false };
  }
  const values = m.points.map((p) => p.value);
  const firstHalf = values.slice(0, Math.ceil(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const prev = avg(firstHalf);
  const curr = avg(secondHalf);
  const delta = curr - prev;
  const eps = Math.max(0.01, Math.abs(prev) * 0.03); // umbral pequeño
  const higherBetter = isHigherBetter(m.metricId);

  let direction: TrendAssessment['direction'] = 'estable';
  let label = 'Estable';
  let detail = 'Sin cambio relevante entre los primeros y últimos registros.';
  let alert = false;

  if (Math.abs(delta) <= eps) {
    direction = 'estable';
  } else if (higherBetter === true) {
    direction = delta > 0 ? 'mejora' : 'empeoramiento';
  } else if (higherBetter === false) {
    direction = delta < 0 ? 'mejora' : 'empeoramiento';
  } else {
    // Métricas de rango: mejora si se acerca a rango aceptable, empeora si se aleja o sale
    const latestEval = evaluateMetricRange(m.metricId, m.latest);
    const prevEval = evaluateMetricRange(m.metricId, values[values.length - 2]);
    const rank = (s: string) => (s === 'aceptable' ? 3 : s === 'informativo' ? 2 : s === 'atencion' ? 1 : 0);
    if (rank(latestEval.status) > rank(prevEval.status)) direction = 'mejora';
    else if (rank(latestEval.status) < rank(prevEval.status)) direction = 'empeoramiento';
    else direction = Math.abs(delta) <= eps ? 'estable' : 'estable';
  }

  if (direction === 'mejora') {
    label = 'Mejora';
    detail = `Tendencia de mejora: promedio reciente ${curr.toFixed(1)} vs previo ${prev.toFixed(1)} (Δ ${delta > 0 ? '+' : ''}${delta.toFixed(1)}).`;
  } else if (direction === 'empeoramiento') {
    label = 'Empeoramiento';
    detail = `Tendencia de empeoramiento: promedio reciente ${curr.toFixed(1)} vs previo ${prev.toFixed(1)} (Δ ${delta > 0 ? '+' : ''}${delta.toFixed(1)}).`;
  }

  // Alertas: empeoramiento, o último valor en negativo/atención según rango
  if (direction === 'empeoramiento') alert = true;
  if (m.status.status === 'negativo') alert = true;
  if (m.status.status === 'atencion' && higherBetter === false && m.latest != null) {
    // p.ej. fatiga/estrés en nivel intermedio-alto sostenido
    const last3 = values.slice(-3);
    if (last3.length >= 2 && avg(last3) >= 3) alert = true;
  }
  if (m.metricId.startsWith('symptom_') && m.latest === 1) {
    // síntoma presente recientemente: alerta informativa
    const recent = values.slice(-3);
    if (recent.filter((v) => v === 1).length >= 2) { alert = true; detail += ' Síntoma presente en registros recientes.'; }
  }

  return { direction, label, detail, alert };
}

function Sparkline({ points, color }: { points: TrendPoint[]; color: string }) {
  const recent = points.slice(-12);
  if (recent.length < 2) return <Text style={styles.sparkEmpty}>Sin tendencia suficiente</Text>;
  const values = recent.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return (
    <View style={styles.sparkRow} accessibilityLabel={`Tendencia con ${recent.length} puntos`}>
      {recent.map((p, i) => {
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

function DetailChart({ m }: { m: MetricView }) {
  if (m.points.length === 0) {
    return <Text style={styles.body}>No hay registros para graficar.</Text>;
  }
  const values = m.points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const color = statusColor(m.status.status);
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.chartTitle}>Evolución por registro ({m.points.length} día(s)/mediciones)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chartRow}>
          {m.points.map((p, i) => {
            const h = 12 + ((p.value - min) / span) * 90;
            const ev = evaluateMetricRange(m.metricId, p.value);
            const c = statusColor(ev.status);
            return (
              <View key={`${p.at}-${i}`} style={styles.chartCol}>
                <Text style={styles.chartVal}>{formatValue(p.value, m.metricId)}</Text>
                <View style={styles.chartBarTrack}>
                  <View style={[styles.chartBar, { height: h, backgroundColor: c }]} />
                </View>
                <Text style={styles.chartDate}>{formatDate(p.at)}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.legendRow}>
        <Text style={styles.legendText}>Mín: {formatValue(min, m.metricId)} {m.unit ?? ''}</Text>
        <Text style={styles.legendText}>Máx: {formatValue(max, m.metricId)} {m.unit ?? ''}</Text>
        <Text style={styles.legendText}>Último: {formatValue(m.latest, m.metricId)} {m.unit ?? ''}</Text>
      </View>
      <View style={[styles.rangeNote, { borderLeftColor: color }]}>
        <Text style={styles.legendText}>Color por punto = estado según rango informativo del valor registrado.</Text>
      </View>
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

function MetricCard({ m, onPress }: { m: MetricView; onPress: () => void }) {
  const color = statusColor(m.status.status);
  const trend = assessTrend(m);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [cardStyle, styles.metricCard, pressed && styles.pressed]}>
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
          <Text style={styles.metricSub}>{m.latestAt ? `Último: ${formatDate(m.latestAt)}` : 'Sin datos'} · {m.points.length} registro(s)</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Sparkline points={m.points} color={color} />
        </View>
      </View>
      <Text style={styles.tapHint}>Toca para ver gráfica completa, tendencia y alertas</Text>
      {trend.alert ? <Text style={styles.alertInline}>⚠ {trend.label}: revisa la tendencia</Text> : null}
    </Pressable>
  );
}

export default function EstadoGeneralScreen() {
  const services = useAppServices();
  const r = useResponsive();
  const [sessions, setSessions] = useState<SessionWithObservations[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifStatus, setNotifStatus] = useState<string | null>(null);
  const [selectedMetricId, setSelectedMetricId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await services.listRecentActivity.listRecentSessions(365);
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
  const allMetrics = useMemo(() => [...wellbeing, ...vitals, ...symptoms, ...hema], [wellbeing, vitals, symptoms, hema]);
  const selected = useMemo(() => allMetrics.find((m) => m.metricId === selectedMetricId) ?? null, [allMetrics, selectedMetricId]);
  const selectedTrend = useMemo(() => (selected ? assessTrend(selected) : null), [selected]);

  const scheduleReminder = useCallback(async () => {
    try {
      const Notifications = await import('expo-notifications');
      const perm = await Notifications.requestPermissionsAsync();
      if (!perm.granted) {
        setNotifStatus('Permiso de notificaciones denegado. Puedes activarlo en ajustes del sistema.');
        return;
      }
      await Notifications.cancelAllScheduledNotificationsAsync();
      await Notifications.scheduleNotificationAsync({
        content: { title: 'firstOption: registro diario', body: 'Recuerda registrar tu seguimiento y revisar tu estado general.' },
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
      if (!perm.granted) { setNotifStatus('Sin permiso de notificaciones. Programa primero el recordatorio.'); return; }
      await Notifications.scheduleNotificationAsync({
        content: { title: 'firstOption', body: 'Notificación de prueba: revisa tu estado general en la app.' },
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
          <Text style={styles.disclaimer}>Informativo, no diagnóstico. Toca una métrica para ver su gráfica completa, tendencia (mejora/empeoramiento) y alertas.</Text>
        </View>

        <SectionHeader title="Bienestar y fatiga" />
        <Text style={styles.sectionHint}>Ánimo, estrés, fatiga y sueño (escalas autorreportadas). Toca para ver todos los días registrados.</Text>
        {wellbeing.map((m) => <MetricCard key={m.metricId} m={m} onPress={() => setSelectedMetricId(m.metricId)} />)}

        <SectionHeader title="Signos vitales" />
        <Text style={styles.sectionHint}>Evolución completa y rangos informativos por cada medición.</Text>
        {vitals.map((m) => <MetricCard key={m.metricId} m={m} onPress={() => setSelectedMetricId(m.metricId)} />)}

        <SectionHeader title="Síntomas reportados" />
        <Text style={styles.sectionHint}>Presencia/ausencia. Toca un síntoma para ver su historial.</Text>
        <View style={styles.symptomGrid}>
          {symptoms.map((m) => {
            const color = statusColor(m.status.status);
            const trend = assessTrend(m);
            return (
              <Pressable key={m.metricId} accessibilityRole="button" onPress={() => setSelectedMetricId(m.metricId)} style={({ pressed }) => [styles.symptomChip, { borderColor: color }, pressed && styles.pressed]}>
                <Text style={styles.symptomName}>{m.name}</Text>
                <Text style={[styles.symptomVal, { color }]}>{m.latest === null ? '—' : m.latest === 1 ? 'Presente' : 'Ausente'}</Text>
                {trend.alert ? <Text style={styles.symptomAlert}>⚠ alerta</Text> : <Text style={styles.symptomHint}>Ver historial</Text>}
              </Pressable>
            );
          })}
        </View>

        <SectionHeader title="Hematología y estudios" />
        <Text style={styles.sectionHint}>Gráfica por métrica/estudio según registros disponibles.</Text>
        {hema.every((m) => m.latest === null) ? (
          <Card title="Sin estudios hematológicos"><Text style={styles.body}>Aún no hay registros hematológicos para mostrar evolución y rangos informativos.</Text></Card>
        ) : (
          hema.filter((m) => m.latest !== null || m.points.length > 0).map((m) => <MetricCard key={m.metricId} m={m} onPress={() => setSelectedMetricId(m.metricId)} />)
        )}

        <SectionHeader title="Análisis por patrones de voz" />
        <View style={[cardStyle, styles.infoBox]}>
          <StatusBadge label="No disponible" tone="neutral" />
          <Text style={styles.cardTitle}>Voz (pendiente)</Text>
          <Text style={styles.body}>El análisis por patrones de voz no está implementado. Requiere captura de audio con consentimiento y un método validado; no debe usarse para diagnóstico.</Text>
        </View>

        <SectionHeader title="Notificaciones" />
        <Card title="Recordatorios y avisos">
          <Text style={styles.body}>Programa un recordatorio diario para registrar tu seguimiento y revisar tu estado.</Text>
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

      <Modal visible={selected !== null} animationType="slide" onRequestClose={() => setSelectedMetricId(null)}>
        <View style={styles.modalRoot}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            {selected && selectedTrend ? (
              <>
                <Text style={styles.modalTitle}>{selected.name}</Text>
                <View style={styles.row}>
                  <View style={[styles.statusPill, { borderColor: statusColor(selected.status.status), backgroundColor: `${statusColor(selected.status.status)}14` }]}>
                    <Text style={[styles.statusPillText, { color: statusColor(selected.status.status) }]}>{statusLabelEs(selected.status.status)}</Text>
                  </View>
                  <View style={[styles.statusPill, { borderColor: selectedTrend.alert ? palette.priority : selectedTrend.direction === 'mejora' ? palette.success : palette.textSecondary, backgroundColor: selectedTrend.alert ? 'rgba(232,121,121,0.14)' : 'rgba(69,197,138,0.14)' }]}>
                    <Text style={[styles.statusPillText, { color: selectedTrend.alert ? palette.priority : selectedTrend.direction === 'mejora' ? palette.success : palette.textSecondary }]}>
                      {selectedTrend.direction === 'mejora' ? '↑ Mejora' : selectedTrend.direction === 'empeoramiento' ? '↓ Empeoramiento' : selectedTrend.direction === 'estable' ? '→ Estable' : 'Sin tendencia'}
                    </Text>
                  </View>
                </View>

                {selectedTrend.alert ? (
                  <View style={styles.alertBox}>
                    <Text style={styles.alertTitle}>Alerta</Text>
                    <Text style={styles.alertText}>{selectedTrend.detail} Revisa el contexto; esto es informativo, no un diagnóstico.</Text>
                  </View>
                ) : (
                  <View style={styles.okBox}>
                    <Text style={styles.okTitle}>Tendencia</Text>
                    <Text style={styles.alertText}>{selectedTrend.detail}</Text>
                  </View>
                )}

                <DetailChart m={selected} />

                <Card title="Registros por día/medición">
                  {selected.points.length === 0 ? (
                    <Text style={styles.body}>Sin registros.</Text>
                  ) : (
                    [...selected.points].reverse().map((p, i) => {
                      const ev = evaluateMetricRange(selected.metricId, p.value);
                      const c = statusColor(ev.status);
                      return (
                        <View key={`${p.at}-${i}`} style={styles.dayRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.dayDate}>{formatDateFull(p.at)}</Text>
                            <Text style={styles.daySub}>{statusLabelEs(ev.status)} · {ev.label}</Text>
                          </View>
                          <Text style={[styles.dayVal, { color: c }]}>{formatValue(p.value, selected.metricId)} {selected.unit ?? ''}</Text>
                        </View>
                      );
                    })
                  )}
                </Card>
              </>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => setSelectedMetricId(null)} style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}>
              <Text style={styles.closeBtnText}>Cerrar</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
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
  tapHint: { ...typography.small, color: palette.accent, fontWeight: '600' },
  alertInline: { ...typography.small, color: palette.priority, fontWeight: '700' },
  sparkRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 40 },
  sparkBarWrap: { width: 8, justifyContent: 'flex-end', height: 40 },
  sparkBar: { width: 8, borderRadius: 3, minHeight: 4 },
  sparkEmpty: { ...typography.small, color: palette.textSecondary },
  symptomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  symptomChip: { minWidth: '45%', flexGrow: 1, borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm, backgroundColor: palette.surface, gap: 2 },
  symptomName: { ...typography.secondary, color: palette.textPrimary, fontWeight: '600' },
  symptomVal: { ...typography.small, fontWeight: '700' },
  symptomAlert: { ...typography.small, color: palette.priority, fontWeight: '700' },
  symptomHint: { ...typography.small, color: palette.textSecondary },
  infoBox: { gap: spacing.xs },
  cardTitle: { ...typography.cardTitle, color: palette.textPrimary },
  actionsRow: { gap: spacing.sm, marginTop: spacing.xs },
  primaryBtn: { minHeight: 48, borderRadius: radius.md, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  primaryBtnText: { ...typography.body, color: '#071321', fontWeight: '700' },
  secondaryBtn: { minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: palette.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  secondaryBtnText: { ...typography.secondary, color: palette.accent, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  footer: { ...typography.small, color: palette.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  modalRoot: { flex: 1, backgroundColor: palette.background },
  modalContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  modalTitle: { ...typography.title, color: palette.textPrimary },
  alertBox: { borderWidth: 1, borderColor: palette.priority, backgroundColor: 'rgba(232,121,121,0.12)', borderRadius: radius.md, padding: spacing.md, gap: 4 },
  okBox: { borderWidth: 1, borderColor: palette.success, backgroundColor: 'rgba(69,197,138,0.12)', borderRadius: radius.md, padding: spacing.md, gap: 4 },
  alertTitle: { ...typography.cardTitle, color: palette.textPrimary },
  okTitle: { ...typography.cardTitle, color: palette.textPrimary },
  alertText: { ...typography.body, color: palette.textSecondary },
  chartTitle: { ...typography.secondary, color: palette.textPrimary, fontWeight: '700' },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingVertical: spacing.sm, minHeight: 160 },
  chartCol: { width: 56, alignItems: 'center', gap: 4 },
  chartBarTrack: { height: 110, width: 28, justifyContent: 'flex-end', backgroundColor: palette.surfaceAlt, borderRadius: 6, overflow: 'hidden' },
  chartBar: { width: 28, borderRadius: 6, minHeight: 4 },
  chartVal: { ...typography.small, color: palette.textPrimary, fontWeight: '700' },
  chartDate: { ...typography.small, color: palette.textSecondary, textAlign: 'center' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  legendText: { ...typography.small, color: palette.textSecondary },
  rangeNote: { borderLeftWidth: 3, paddingLeft: spacing.sm },
  dayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: palette.border },
  dayDate: { ...typography.secondary, color: palette.textPrimary, fontWeight: '600' },
  daySub: { ...typography.small, color: palette.textSecondary },
  dayVal: { ...typography.body, fontWeight: '700' },
  closeBtn: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: palette.accent, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  closeBtnText: { ...typography.body, color: palette.accent, fontWeight: '700' },
});

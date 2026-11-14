import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { METRIC_CATALOG_V1 } from '@/domain/metrics/catalog-v1';
import { Field, ChoiceChips, Card } from '@/presentation/components/ui';
import { PrimaryButton, FormError } from '@/presentation/components/screen';
import { useAppServices } from './_providers';
import { useResponsive } from '@/presentation/hooks/use-responsive';
import { palette, radius, spacing, typography } from '@/presentation/theme/tokens';

const METRICS = METRIC_CATALOG_V1.filter((m) =>
  ['heart_rate', 'bp_systolic', 'bp_diastolic', 'spo2', 'hemoglobin'].includes(m.metricId),
);

export default function BasalesScreen() {
  const services = useAppServices();
  const r = useResponsive();
  const [metricId, setMetricId] = useState(METRICS[0]?.metricId ?? '');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [baselines, setBaselines] = useState<Awaited<ReturnType<typeof services.labRepository.listBaselines>>>([]);

  const load = async () => {
    try {
      const scope = await services.manageAccount.current();
      const list = await services.labRepository.listBaselines(scope.subjectId);
      setBaselines(list);
    } catch {
      // ignore
    }
  };

  const save = async () => {
    setError(null);
    setSaved(null);
    if (!periodStart || !periodEnd) {
      setError('Ingresa el periodo (fechas ISO, p. ej. 2026-10-01).');
      return;
    }
    setBusy(true);
    try {
      const result = await services.createBaseline.execute({
        metricId,
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
      });
      setSaved(`Línea basal v${result.version} creada (${result.count} observaciones, media ${result.mean ?? '—'}).`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la línea basal.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Stack.Screen options={{ title: 'Líneas basales' }} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: r.horizontalMargin, maxWidth: r.contentMaxWidth, alignSelf: 'center', width: '100%' },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.subtitle}>
          Crea una línea basal versionada a partir de observaciones de un
          periodo. La versión se conserva y no se recalcula silenciosamente.
        </Text>

        <Card title="Nueva línea basal">
          <Field label="Métrica">
            <ChoiceChips
              options={METRICS.map((m) => ({ value: m.metricId, label: m.shortNameEs ?? m.nameEs }))}
              value={metricId}
              onChange={setMetricId}
            />
          </Field>
          <Field label="Periodo inicio (YYYY-MM-DD)" help="Solo se usan observaciones de este periodo.">
            <TextInput
              style={styles.input}
              value={periodStart}
              onChangeText={setPeriodStart}
              placeholder="2026-10-01"
              placeholderTextColor={palette.textSecondary}
              accessibilityLabel="Periodo inicio"
            />
          </Field>
          <Field label="Periodo fin (YYYY-MM-DD)">
            <TextInput
              style={styles.input}
              value={periodEnd}
              onChangeText={setPeriodEnd}
              placeholder="2026-10-31"
              placeholderTextColor={palette.textSecondary}
              accessibilityLabel="Periodo fin"
            />
          </Field>
          {error !== null && <FormError message={error} />}
          {saved !== null && (
            <Text style={styles.savedText} accessibilityRole="status">
              {saved}
            </Text>
          )}
          <PrimaryButton
            label="Crear línea basal"
            onPress={() => void save()}
            disabled={busy}
            busy={busy}
          />
        </Card>

        <Card title="Líneas basales registradas">
          {baselines.length === 0 ? (
            <Text style={styles.bodyText}>Aún no hay líneas basales registradas.</Text>
          ) : (
            baselines.map((b) => (
              <View key={b.baselineId} style={styles.baselineRow}>
                <Text style={styles.cardTitle}>{b.metricId}</Text>
                <Text style={styles.bodyText}>
                  v{b.version} · {b.state} · {b.periodStart.slice(0, 10)} → {b.periodEnd.slice(0, 10)}
                </Text>
                <Text style={styles.hintText}>
                  Método: {b.method} (v{b.methodVersion}) · {b.sourceObservationIds.length} observaciones
                </Text>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { paddingVertical: spacing.lg, gap: spacing.md },
  subtitle: { ...typography.body, color: palette.textSecondary },
  input: {
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...typography.body,
    color: palette.textPrimary,
  },
  bodyText: { ...typography.body, color: palette.textSecondary },
  cardTitle: { ...typography.cardTitle, color: palette.textPrimary },
  hintText: { ...typography.small, color: palette.textSecondary, marginTop: spacing.xs },
  savedText: { ...typography.secondary, color: palette.success, fontWeight: '600' },
  baselineRow: { gap: spacing.xs, paddingVertical: spacing.xs },
});

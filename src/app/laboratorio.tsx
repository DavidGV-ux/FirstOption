import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { Stack } from 'expo-router';
import { METRIC_CATALOG_V1 } from '@/domain/metrics/catalog-v1';
import { MISSION_PHASES, MISSION_PHASE_LABELS_ES } from '@/domain/observations/observation';
import { LAB_VERIFICATION_STATES } from '@/domain/labs/lab-panel';
import { listUnitsForMetric, convertToCanonical } from '@/domain/units/unit-conversion';
import { Field, ChoiceChips, Card } from '@/presentation/components/ui';
import { PrimaryButton, FormError } from '@/presentation/components/screen';
import { useAppServices } from './_providers';
import { useResponsive } from '@/presentation/hooks/use-responsive';
import { palette, radius, spacing, typography } from '@/presentation/theme/tokens';

const HEMATOLOGY_METRICS = METRIC_CATALOG_V1.filter((m) => m.category === 'hematology');

export default function LaboratorioScreen() {
  const services = useAppServices();
  const r = useResponsive();
  const [metricId, setMetricId] = useState<string>(HEMATOLOGY_METRICS[0]?.metricId ?? '');
  const units = listUnitsForMetric(metricId);
  const [unit, setUnit] = useState<string>(units[0]?.unit ?? '');
  const [value, setValue] = useState('');
  const [missionPhase, setMissionPhase] = useState<(typeof MISSION_PHASES)[number]>('inflight');
  const [laboratory, setLaboratory] = useState('');
  const [sampleId, setSampleId] = useState('');
  const [method, setMethod] = useState('');
  const [referenceInterval, setReferenceInterval] = useState('');
  const [verificationState, setVerificationState] = useState<'unverified' | 'verified' | 'corrected'>('unverified');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const selectedMetric = HEMATOLOGY_METRICS.find((m) => m.metricId === metricId);

  // Reset unit when metric changes.
  const onMetricChange = (m: string) => {
    setMetricId(m);
    const u = listUnitsForMetric(m);
    setUnit(u[0]?.unit ?? '');
  };

  const save = async () => {
    setError(null);
    setSaved(null);
    const num = Number(value.replace(',', '.'));
    if (!Number.isFinite(num)) {
      setError('Ingresa un valor numérico válido.');
      return;
    }
    const conversion = convertToCanonical(metricId, num, unit);
    let valueNormalized: number | null = null;
    let unitNormalized: string | null = null;
    let conversionId: string | null = null;
    let conversionVersion: number | null = null;
    if (conversion.state === 'same_unit') {
      valueNormalized = conversion.value;
      unitNormalized = conversion.canonicalUnit;
    } else if (conversion.state === 'converted') {
      valueNormalized = conversion.value;
      unitNormalized = conversion.canonicalUnit;
      conversionId = conversion.conversionId;
      conversionVersion = conversion.conversionVersion;
    }
    // unsupported/invalid → se conserva solo el valor original (honesto).

    setBusy(true);
    try {
      const result = await services.registerLabPanel.execute({
        metricId,
        valueOriginal: num,
        unitOriginal: unit,
        valueNormalized,
        unitNormalized,
        conversionId,
        conversionVersion,
        qualityState: 'ok',
        missionPhase,
        collectedAt: new Date().toISOString(),
        reportedAt: null,
        laboratory: laboratory.trim() || null,
        sampleId: sampleId.trim() || null,
        method: method.trim() || null,
        referenceIntervalOriginal: referenceInterval.trim() ? Number(referenceInterval.replace(',', '.')) : null,
        verificationState,
        note: note.trim() || null,
      });
      setSaved(`Resultado guardado (${result.panelId}). Se sincronizará cuando haya conexión.`);
      setValue('');
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el resultado.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Registro hematológico' }} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: r.horizontalMargin, maxWidth: r.contentMaxWidth, alignSelf: 'center', width: '100%' },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.subtitle}>
          Registra un resultado de laboratorio con su unidad original y
          trazabilidad. No se inferirán valores faltantes.
        </Text>

        <Card title="Métrica">
          <Field label="Métrica">
            <ChoiceChips
              options={HEMATOLOGY_METRICS.map((m) => ({ value: m.metricId, label: m.shortNameEs ?? m.nameEs }))}
              value={metricId}
              onChange={onMetricChange}
            />
          </Field>
          <Text style={styles.hintText}>{selectedMetric?.nameEs}</Text>
        </Card>

        <Card title="Valor y unidad">
          <Field label="Valor" help="Usa el valor reportado por el laboratorio.">
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
              placeholder="0,0"
              placeholderTextColor={palette.textSecondary}
              accessibilityLabel="Valor del resultado"
            />
          </Field>
          <Field label="Unidad">
            <ChoiceChips
              options={units.map((u) => ({ value: u.unit, label: u.label }))}
              value={unit}
              onChange={setUnit}
            />
          </Field>
          {units.length === 0 && (
            <Text style={styles.hintText}>Unidad canónica: {selectedMetric?.canonicalUnit}</Text>
          )}
        </Card>

        <Card title="Contexto">
          <Field label="Fase de la misión">
            <ChoiceChips
              options={MISSION_PHASES.map((p) => ({ value: p, label: MISSION_PHASE_LABELS_ES[p] }))}
              value={missionPhase}
              onChange={(v) => setMissionPhase(v as typeof missionPhase)}
            />
          </Field>
          <Field label="Laboratorio (opcional)">
            <TextInput style={styles.input} value={laboratory} onChangeText={setLaboratory} accessibilityLabel="Laboratorio" />
          </Field>
          <Field label="Identificador de muestra (opcional)">
            <TextInput style={styles.input} value={sampleId} onChangeText={setSampleId} accessibilityLabel="Identificador de muestra" />
          </Field>
          <Field label="Método (opcional)">
            <TextInput style={styles.input} value={method} onChangeText={setMethod} accessibilityLabel="Método" />
          </Field>
          <Field label="Intervalo de referencia original (opcional)" help="Límite superior o valor de referencia del laboratorio.">
            <TextInput
              style={styles.input}
              value={referenceInterval}
              onChangeText={setReferenceInterval}
              keyboardType="decimal-pad"
              accessibilityLabel="Intervalo de referencia"
            />
          </Field>
          <Field label="Estado de verificación">
            <ChoiceChips
              options={LAB_VERIFICATION_STATES.map((v) => ({ value: v, label: v }))}
              value={verificationState}
              onChange={(v) => setVerificationState(v as typeof verificationState)}
            />
          </Field>
          <Field label="Nota (opcional)">
            <TextInput
              style={[styles.input, { minHeight: 80 }]}
              value={note}
              onChangeText={setNote}
              multiline
              accessibilityLabel="Nota del resultado"
            />
          </Field>
        </Card>

        {error !== null && <FormError message={error} />}
        {saved !== null && (
          <Text style={styles.savedText} accessibilityRole="status">
            {saved}
          </Text>
        )}

        <PrimaryButton
          label="Guardar resultado"
          onPress={() => void save()}
          disabled={value.trim().length === 0 || busy}
          busy={busy}
        />
        <Text style={styles.hintText}>
          El valor se registra con su unidad original. La conversión a la unidad
          canónica solo se aplica si está verificada.
        </Text>
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
  hintText: { ...typography.small, color: palette.textSecondary, marginTop: spacing.xs },
  savedText: { ...typography.secondary, color: palette.success, fontWeight: '600' },
});

import * as SecureStore from 'expo-secure-store';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { dailyLogInputSchema, type DailyLogInput } from '@/domain/observations/daily-log-schema';
import { ValidationError } from '@/domain/observations/daily-log-schema';
import { MISSION_PHASES, MISSION_PHASE_LABELS_ES } from '@/domain/observations/observation';
import { PrimaryButton, FormError } from '@/presentation/components/screen';
import { REGISTER_SCALES, REGISTER_SYMPTOMS } from '@/presentation/features/register/scale-config';
import { cardStyle, palette, radius, spacing, typography } from '@/presentation/theme/tokens';
import { useAppServices } from './_providers';

const DRAFT_KEY = 'firstOption_draft_register';

type FormValues = DailyLogInput;

/**
 * Pantalla de registro diario.
 *
 * Reglas de diseño:
 * - Ningún valor viene prellenado salvo la fecha de toma (ahora): los
 *   datos son de la persona, no del sistema.
 * - Las escalas se presentan con anclas; no son instrumentos validados.
 * - Un solo botón principal: "Guardar registro".
 * - Los errores son recuperables y explican qué corregir.
 */
export default function RegisterScreen() {
  const services = useAppServices();
  const params = useLocalSearchParams<{
    estHeartRate?: string;
    estBpSystolic?: string;
    estBpDiastolic?: string;
    estSpo2?: string;
  }>();

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setError,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(dailyLogInputSchema as any),
    defaultValues: {
      observedAt: new Date().toISOString(),
      missionPhase: undefined as unknown as FormValues['missionPhase'],
      mood: null,
      stress: null,
      fatigue: null,
      sleepQuality: null,
      sleepHours: null,
      heartRate: params.estHeartRate ? Number(params.estHeartRate) : null,
      bpSystolic: params.estBpSystolic ? Number(params.estBpSystolic) : null,
      bpDiastolic: params.estBpDiastolic ? Number(params.estBpDiastolic) : null,
      spo2: params.estSpo2 ? Number(params.estSpo2) : null,
      symptoms: {},
      note: null,
    },
    mode: 'onBlur',
  });

  // Guardar borrador en SecureStore cada vez que cambian los valores,
  // para que no se pierdan al navegar a otras pantallas (ej. linterna/pulso)
  // y regresar.
  const draftValues = useMemo(
    () => ({
      missionPhase: getValues('missionPhase'),
      mood: getValues('mood'),
      stress: getValues('stress'),
      fatigue: getValues('fatigue'),
      sleepQuality: getValues('sleepQuality'),
      sleepHours: getValues('sleepHours'),
      heartRate: getValues('heartRate'),
      bpSystolic: getValues('bpSystolic'),
      bpDiastolic: getValues('bpDiastolic'),
      spo2: getValues('spo2'),
      symptoms: getValues('symptoms'),
      note: getValues('note'),
      observedAt: getValues('observedAt'),
    }),
    [getValues],
  );

  useEffect(() => {
    void SecureStore.setItemAsync(DRAFT_KEY, JSON.stringify(draftValues));
  }, [draftValues]);

  // Restaurar borrador guardado al montar, a menos que haya llegado con
  // valores estimados desde la linterna/pulso (esos tienen prioridad).
  useEffect(() => {
    const hasExplicitParams =
      params.estHeartRate !== undefined ||
      params.estBpSystolic !== undefined ||
      params.estBpDiastolic !== undefined ||
      params.estSpo2 !== undefined;

    if (!hasExplicitParams) {
      (async () => {
        try {
          const saved = await SecureStore.getItemAsync(DRAFT_KEY);
          if (saved) {
            const draft = JSON.parse(saved);
            if (draft.missionPhase) setValue('missionPhase', draft.missionPhase);
            if (draft.mood !== undefined) setValue('mood', draft.mood);
            if (draft.stress !== undefined) setValue('stress', draft.stress);
            if (draft.fatigue !== undefined) setValue('fatigue', draft.fatigue);
            if (draft.sleepQuality !== undefined) setValue('sleepQuality', draft.sleepQuality);
            if (draft.sleepHours !== undefined) setValue('sleepHours', draft.sleepHours);
            if (draft.heartRate !== undefined) setValue('heartRate', draft.heartRate);
            if (draft.bpSystolic !== undefined) setValue('bpSystolic', draft.bpSystolic);
            if (draft.bpDiastolic !== undefined) setValue('bpDiastolic', draft.bpDiastolic);
            if (draft.spo2 !== undefined) setValue('spo2', draft.spo2);
            if (draft.symptoms) setValue('symptoms', draft.symptoms);
            if (draft.note !== undefined) setValue('note', draft.note);
            if (draft.observedAt) setValue('observedAt', draft.observedAt);
          }
        } catch {
          // Ignorar errores de lectura del borrador.
        }
      })();
    }
  }, [setValue, params.estHeartRate, params.estBpSystolic, params.estBpDiastolic, params.estSpo2]);

  const onSubmit = handleSubmit(
    async (values) => {
      setSubmitError(null);
      try {
        const result = await services.registerDailyLog.execute(values as any);
        setSaved(
          `Registro guardado en el dispositivo (${result.observationCount} medición(es)). Sin sincronizar todavía.`,
        );
        setTimeout(() => router.back(), 900);
      } catch (error) {
        if (error instanceof ValidationError) {
          for (const [field, message] of Object.entries(error.fieldErrors)) {
            setError(field as keyof FormValues, { type: 'manual', message });
          }
          if (error.fieldErrors['_form'] !== undefined) {
            setSubmitError(error.fieldErrors['_form']);
          }
        } else {
          setSubmitError(
            'No se pudo guardar el registro. Los datos no se perdieron: inténtalo de nuevo.',
          );
        }
      }
    },
    (formErrors) => {
      // Mostrar detalle para que la persona sepa qué falta o está mal.
      const first = Object.values(formErrors).find((e) => e && typeof e === 'object' && 'message' in e) as
        | { message?: string }
        | undefined;
      const hint = first?.message ? ` ${first.message}` : '';
      setSubmitError(`Revisa los campos marcados antes de guardar.${hint}`);
    },
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Registrar seguimiento' }} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.disclaimer}>
          Prototipo de seguimiento: no diagnostica ni reemplaza evaluación
          clínica. Las escalas son propias de este prototipo y no son
          instrumentos clínicos validados.
        </Text>

        <View style={[cardStyle, styles.gap]}>
          <Text style={styles.sectionTitle}>Fase de la misión</Text>
          <Controller
            control={control}
            name="missionPhase"
            render={({ field }) => (
              <View style={styles.rowWrap} accessibilityRole="radiogroup" accessibilityLabel="Fase de la misión">
                {MISSION_PHASES.map((phase) => {
                  const selected = field.value === phase;
                  return (
                    <Pressable
                      key={phase}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={MISSION_PHASE_LABELS_ES[phase]}
                      onPress={() => field.onChange(phase)}
                      style={[
                        styles.phaseOption,
                        selected && styles.phaseOptionSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.phaseLabel,
                          selected && styles.phaseLabelSelected,
                        ]}
                      >
                        {MISSION_PHASE_LABELS_ES[phase]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          />
          {errors.missionPhase !== undefined && (
            <FormError message={errors.missionPhase.message ?? 'Selecciona la fase'} />
          )}
        </View>

        <ObservedAtField control={control} />

        {REGISTER_SCALES.map((scale) => (
          <View key={scale.metricId} style={[cardStyle, styles.gap]}>
            <Text style={styles.sectionTitle}>{scale.label}</Text>
            <Text style={styles.helper}>{scale.helper}</Text>
            <Controller
              control={control}
              name={scale.metricId === 'mood_self_report' ? 'mood'
                : scale.metricId === 'stress_self_report' ? 'stress'
                : scale.metricId === 'fatigue_self_report' ? 'fatigue'
                : 'sleepQuality'}
              render={({ field, fieldState }) => (
                <View style={styles.gap}>
                  <View style={styles.rowWrap} accessibilityRole="radiogroup" accessibilityLabel={`${scale.label}, escala de 1 a 5`}>
                    {[1, 2, 3, 4, 5].map((value) => {
                      const selected = field.value === value;
                      return (
                        <Pressable
                          key={value}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`Valor ${value}: ${scale.anchors[value]}`}
                          onPress={() => field.onChange(field.value === value ? null : value)}
                          style={[
                            styles.scaleOption,
                            selected && styles.scaleOptionSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.scaleValue,
                              selected && styles.scaleValueSelected,
                            ]}
                          >
                            {value}
                          </Text>
                          <Text
                            style={[
                              styles.scaleAnchor,
                              selected && styles.scaleAnchorSelected,
                            ]}
                          >
                            {scale.anchors[value]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {fieldState.error !== undefined && (
                    <FormError message={fieldState.error.message ?? 'Valor inválido'} />
                  )}
                </View>
              )}
            />
          </View>
        ))}

        <View style={[cardStyle, styles.gap]}>
          <Text style={styles.sectionTitle}>Sueño</Text>
          <Controller
            control={control}
            name="sleepHours"
            render={({ field, fieldState }) => (
              <View style={styles.gap}>
                <Text style={styles.helper}>Duración de tu último periodo principal de sueño (horas)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  value={field.value === null ? '' : String(field.value)}
                  onChangeText={(text) => {
                    const trimmed = text.replace(',', '.').trim();
                    field.onChange(trimmed === '' ? null : Number(trimmed));
                  }}
                  onBlur={field.onBlur}
                  placeholder="Ej. 7,5"
                  placeholderTextColor={palette.textSecondary}
                  accessibilityLabel="Duración del sueño en horas"
                  maxLength={5}
                />
                {fieldState.error !== undefined && (
                  <FormError message={fieldState.error.message ?? 'Valor inválido'} />
                )}
              </View>
            )}
          />
        </View>

        <View style={[cardStyle, styles.gap]}>
          <Text style={styles.sectionTitle}>Síntomas</Text>
          <Text style={styles.helper}>Marca solo los que estuvieron presentes.</Text>
          {REGISTER_SYMPTOMS.map((symptom) => (
            <Controller
              key={symptom.metricId}
              control={control}
              name={`symptoms.${symptom.metricId}` as never}
              render={({ field }) => (
                <View style={styles.switchRow}>
                  <Text style={styles.bodyText}>{symptom.label}</Text>
                  <Switch
                    value={field.value === true}
                    onValueChange={(v) => field.onChange(v)}
                    trackColor={{ true: palette.accent, false: palette.border }}
                    accessibilityLabel={`Síntoma: ${symptom.label}`}
                  />
                </View>
              )}
            />
          ))}
        </View>

        <View style={[cardStyle, styles.gap]}>
          <Text style={styles.sectionTitle}>Signos vitales (opcional)</Text>
          <Text style={styles.helper}>
            Solo si mediste estos valores con un dispositivo o con la linterna. No se infieren
            valores faltantes.
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Medir pulso y estimar signos vitales con linterna"
            onPress={() => router.push('/linterna')}
            style={({ pressed }) => [styles.estimateButton, pressed && styles.pressed]}
          >
            <Text style={styles.estimateButtonText}>
              Medir pulso y estimar vitales con linterna (PPG)
            </Text>
          </Pressable>
          <Controller
            control={control}
            name="heartRate"
            render={({ field, fieldState }) => (
              <View style={styles.gap}>
                <Text style={styles.fieldLabel}>Frecuencia cardíaca (lpm)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  value={field.value === null ? '' : String(field.value)}
                  onChangeText={(text) => field.onChange(text.trim() === '' ? null : Number(text.trim()))}
                  onBlur={field.onBlur}
                  placeholder="Ej. 68"
                  placeholderTextColor={palette.textSecondary}
                  accessibilityLabel="Frecuencia cardíaca en latidos por minuto"
                  maxLength={3}
                />
                {fieldState.error !== undefined && (
                  <FormError message={fieldState.error.message ?? 'Valor inválido'} />
                )}
              </View>
            )}
          />
          <View style={styles.bpRow}>
            <Controller
              control={control}
              name="bpSystolic"
              render={({ field }) => (
                <View style={styles.bpField}>
                  <Text style={styles.fieldLabel}>Sistólica (mmHg)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    value={field.value === null ? '' : String(field.value)}
                    onChangeText={(text) => field.onChange(text.trim() === '' ? null : Number(text.trim()))}
                    onBlur={field.onBlur}
                    accessibilityLabel="Presión sistólica en milímetros de mercurio"
                    maxLength={3}
                  />
                </View>
              )}
            />
            <Controller
              control={control}
              name="bpDiastolic"
              render={({ field, fieldState }) => (
                <View style={styles.bpField}>
                  <Text style={styles.fieldLabel}>Diastólica (mmHg)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    value={field.value === null ? '' : String(field.value)}
                    onChangeText={(text) => field.onChange(text.trim() === '' ? null : Number(text.trim()))}
                    onBlur={field.onBlur}
                    accessibilityLabel="Presión diastólica en milímetros de mercurio"
                    maxLength={3}
                  />
                  {fieldState.error !== undefined && (
                    <FormError message={fieldState.error.message ?? ''} />
                  )}
                </View>
              )}
            />
          </View>
          <Controller
            control={control}
            name="spo2"
            render={({ field, fieldState }) => (
              <View style={styles.gap}>
                <Text style={styles.fieldLabel}>SpO₂ (%)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  value={field.value === null ? '' : String(field.value)}
                  onChangeText={(text) => field.onChange(text.trim() === '' ? null : Number(text.trim()))}
                  onBlur={field.onBlur}
                  accessibilityLabel="Saturación de oxígeno en porcentaje"
                  maxLength={3}
                />
                {fieldState.error !== undefined && (
                  <FormError message={fieldState.error.message ?? ''} />
                )}
              </View>
            )}
          />
        </View>

        <View style={[cardStyle, styles.gap]}>
          <Text style={styles.sectionTitle}>Nota (opcional)</Text>
          <Controller
            control={control}
            name="note"
            render={({ field }) => (
              <TextInput
                style={[styles.input, styles.noteInput]}
                multiline
                value={field.value ?? ''}
                onChangeText={(text) => field.onChange(text.length === 0 ? null : text)}
                onBlur={field.onBlur}
                placeholder="Contexto que consideres relevante. Evita datos de terceros."
                placeholderTextColor={palette.textSecondary}
                accessibilityLabel="Nota opcional"
                maxLength={2000}
              />
            )}
          />
        </View>

        {errors.mood !== undefined && errors.mood.message !== undefined && (
          <FormError message={errors.mood.message} />
        )}
        {submitError !== null && <FormError message={submitError} />}
        {saved !== null && (
          <View accessibilityRole="status" accessibilityLiveRegion="polite" style={styles.savedBox}>
            <Text style={styles.savedText}>{saved}</Text>
          </View>
        )}

        <View style={styles.footerSpace} />
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton
          label="Guardar registro"
          onPress={() => void onSubmit()}
          busy={isSubmitting}
        />
      </View>
    </>
  );
}

/** Campo de fecha y hora de la toma. Por defecto: ahora. Máximo: ahora. */
function ObservedAtField({ control }: { control: import('react-hook-form').Control<FormValues> }) {
  const [showIos, setShowIos] = useState(false);
  const now = useMemo(() => new Date(), []);
  return (
    <Controller
      control={control}
      name="observedAt"
      render={({ field }) => {
        const date = new Date(field.value);
        const change = (d: Date | undefined) => {
          if (d !== undefined) field.onChange(d.toISOString());
        };
        if (Platform.OS === 'android') {
          return (
            <View style={[cardStyle, styles.gap]}>
              <Text style={styles.sectionTitle}>Fecha y hora de la toma</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Fecha de la toma: ${formatDateTime(date)}. Cambiar.`}
                onPress={() => {
                  DateTimePickerAndroid.open({
                    value: date,
                    mode: 'date',
                    is24Hour: true,
                    maximumDate: now,
                    onChange: (_event, picked) => {
                      if (picked !== undefined) {
                        DateTimePickerAndroid.open({
                          value: picked,
                          mode: 'time',
                          is24Hour: true,
                          onChange: (_eventTime, pickedTime) => change(pickedTime),
                        });
                      }
                    },
                  });
                }}
                style={styles.dateButton}
              >
                <Text style={styles.dateText}>{formatDateTime(date)}</Text>
              </Pressable>
            </View>
          );
        }
        return (
          <View style={[cardStyle, styles.gap]}>
            <Text style={styles.sectionTitle}>Fecha y hora de la toma</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Fecha de la toma: ${formatDateTime(date)}. Cambiar.`}
              onPress={() => setShowIos((v) => !v)}
              style={styles.dateButton}
            >
              <Text style={styles.dateText}>{formatDateTime(date)}</Text>
            </Pressable>
            {showIos && (
              <DateTimePicker
                value={date}
                mode="datetime"
                is24Hour
                maximumDate={now}
                onChange={(_event, picked) => change(picked)}
              />
            )}
          </View>
        );
      }}
    />
  );
}

function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  gap: { gap: spacing.sm },
  disclaimer: { ...typography.small, color: palette.textSecondary, lineHeight: 18 },
  sectionTitle: { ...typography.subtitle, color: palette.textPrimary },
  helper: { ...typography.secondary, color: palette.textSecondary },
  bodyText: { ...typography.body, color: palette.textPrimary },
  fieldLabel: { ...typography.secondary, color: palette.textPrimary, fontWeight: '600' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  phaseOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  phaseOptionSelected: { borderColor: palette.accent, backgroundColor: 'rgba(53,109,120,0.10)' },
  phaseLabel: { ...typography.secondary, color: palette.textPrimary },
  phaseLabelSelected: { color: palette.accent, fontWeight: '600' },
  scaleOption: {
    width: 96,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: 'center',
    gap: 2,
  },
  scaleOptionSelected: { borderColor: palette.accent, backgroundColor: 'rgba(53,109,120,0.10)' },
  scaleValue: { ...typography.subtitle, color: palette.textPrimary },
  scaleValueSelected: { color: palette.accent },
  scaleAnchor: { ...typography.small, color: palette.textSecondary, textAlign: 'center' },
  scaleAnchorSelected: { color: palette.accent },
  input: {
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: palette.textPrimary,
  },
  noteInput: { minHeight: 88, textAlignVertical: 'top' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  bpRow: { flexDirection: 'row', gap: spacing.md },
  bpField: { flex: 1, gap: spacing.xs },
  dateButton: {
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dateText: { ...typography.body, color: palette.textPrimary },
  estimateButton: {
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    marginVertical: spacing.xs,
  },
  estimateButtonText: {
    ...typography.secondary,
    fontWeight: '700',
    color: palette.accent,
  },
  pressed: {
    opacity: 0.8,
  },
  savedBox: {
    backgroundColor: 'rgba(53,109,120,0.10)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.accent,
    padding: spacing.sm,
  },
  savedText: { ...typography.secondary, color: palette.accent, fontWeight: '600' },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.background,
  },
  footerSpace: { height: spacing.xs },
});

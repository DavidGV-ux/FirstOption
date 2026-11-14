import { useCallback, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { MissionPhase } from '@/domain/observations/observation';
import {
  MISSION_PHASES,
  MISSION_PHASE_LABELS_ES,
} from '@/domain/observations/observation';
import type { VisualDisturbanceAnswer } from '@/domain/observations/inspection-schema';
import { ValidationError } from '@/domain/observations/daily-log-schema';
import { FormError, PrimaryButton } from '@/presentation/components/screen';
import { cardStyle, palette, radius, spacing, typography } from '@/presentation/theme/tokens';
import { useAppServices } from './providers';

const DISTURBANCE_LABELS: Record<VisualDisturbanceAnswer, string> = {
  si: 'Sí: alteración visual',
  no: 'No: sin alteración',
  no_evaluado: 'No evaluado',
};

/**
 * Linterna de inspección pupilar documentada.
 *
 * Reglas honestas:
 * - La linterna SOLO ilumina: no mide, no analiza, no deriva valores.
 *   No se toman fotos ni videos ni audio (sin grabación, sin galería).
 * - Lo registrado es lo que la persona observa y describe: nota libre
 *   y/o respuesta explícita sobre alteración visual (catálogo v1).
 * - El LED se apaga al salir de la pantalla y la cámara se desmonta al
 *   perder el foco (solo una vista previa puede estar activa).
 */
export default function LinternaScreen() {
  const services = useAppServices();
  const [permission, requestPermission] = useCameraPermissions();

  const [focused, setFocused] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [mountError, setMountError] = useState<string | null>(null);

  const [phase, setPhase] = useState<MissionPhase | null>(null);
  const [disturbance, setDisturbance] = useState<'si' | 'no' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // Solo una vista previa de cámara activa: se desmonta al perder foco
  // y el LED se apaga al salir (nunca queda encendida en segundo plano).
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        setTorchOn(false);
      };
    }, []),
  );

  const save = async () => {
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    setSavedMessage(null);
    try {
      const trimmed = note.trim();
      await services.documentInspection.execute({
        missionPhase: phase as MissionPhase,
        visualDisturbance: disturbance,
        note: trimmed.length > 0 ? trimmed : null,
      });
      setSavedMessage(
        'Inspección guardada en este dispositivo. Aparece en el Historial y se sincronizará cuando haya internet y hayas iniciado sesión.',
      );
      setPhase(null);
      setDisturbance(null);
      setNote('');
    } catch (error) {
      if (error instanceof ValidationError) {
        setFieldErrors(error.fieldErrors);
        setFormError(error.fieldErrors._form ?? null);
      } else {
        setFormError(
          'No se pudo guardar. El registro local no se modificó; inténtalo de nuevo.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const canSave = phase !== null && !busy;

  return (
    <>
      <Stack.Screen options={{ title: 'Linterna de inspección' }} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.subtitle} maxFontSizeMultiplier={1.4}>
          La linterna ilumina; no mide. Lo que registres es lo que tú
          observas y describes: tu descripción es el dato. Sin fotos,
          videos ni audio.
        </Text>

        {/* Permisos de cámara (solo para controlar el LED). */}
        {permission === null ? (
          <Text style={styles.hintText}>Verificando permisos de cámara…</Text>
        ) : !permission.granted ? (
          <View style={[cardStyle, styles.section]}>
            <Text style={styles.sectionTitle}>Permiso de cámara</Text>
            <Text style={styles.bodyText}>
              El LED de la linterna se controla a través de la cámara del
              dispositivo. No se capturan imágenes ni audio: la vista de
              cámara no se muestra ni se graba.
            </Text>
            {permission.canAskAgain ? (
              <PrimaryButton
                label="Permitir acceso a la cámara"
                onPress={() => void requestPermission()}
              />
            ) : (
              <>
                <Text style={styles.bodyText}>
                  El permiso quedó denegado en los ajustes del sistema.
                  Actívalo ahí para usar la linterna.
                </Text>
                <PrimaryButton
                  label="Abrir ajustes del sistema"
                  onPress={() => void Linking.openSettings()}
                />
              </>
            )}
          </View>
        ) : (
          <>
            {/* Linterna */}
            <View style={[cardStyle, styles.section]}>
              <Text style={styles.sectionTitle}>Linterna</Text>
              <View
                accessibilityRole="text"
                accessibilityLabel={
                  torchOn ? 'Linterna encendida' : 'Linterna apagada'
                }
                style={styles.row}
              >
                <View style={[styles.chip, torchOn && styles.chipOn]}>
                  <Text style={[styles.chipText, torchOn && styles.chipTextOn]}>
                    {torchOn ? '● Encendida' : '○ Apagada'}
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  torchOn ? 'Apagar la linterna' : 'Encender la linterna'
                }
                accessibilityState={{ selected: torchOn }}
                onPress={() => setTorchOn((v) => !v)}
                style={({ pressed }) => [
                  styles.torchButton,
                  torchOn && styles.torchButtonOn,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.torchButtonLabel,
                    torchOn && styles.torchButtonLabelOn,
                  ]}
                >
                  {torchOn ? 'Apagar linterna' : 'Encender linterna'}
                </Text>
              </Pressable>
              {mountError !== null && (
                <FormError message={mountError} />
              )}
              <Text style={styles.hintText}>
                La luz se apaga sola al salir de esta pantalla.
              </Text>
            </View>

            {/* Documentación de la inspección */}
            <View style={[cardStyle, styles.section]}>
              <Text style={styles.sectionTitle}>Documentar la inspección</Text>
              <Text style={styles.label}>Fase de la misión</Text>
              <View style={styles.row}>
                {MISSION_PHASES.map((option) => {
                  const selected = phase === option;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      accessibilityLabel={MISSION_PHASE_LABELS_ES[option]}
                      accessibilityState={{ selected }}
                      onPress={() => setPhase(option)}
                      style={[styles.option, selected && styles.optionSelected]}
                    >
                      <Text
                        style={[
                          styles.optionLabel,
                          selected && styles.optionLabelSelected,
                        ]}
                      >
                        {MISSION_PHASE_LABELS_ES[option]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {fieldErrors.missionPhase !== undefined && (
                <FormError message={fieldErrors.missionPhase} />
              )}

              <Text style={styles.label}>¿Observaste alguna alteración visual?</Text>
              <View style={styles.row}>
                {(['si', 'no'] as const).map((answer) => {
                  const selected = disturbance === answer;
                  return (
                    <Pressable
                      key={answer}
                      accessibilityRole="button"
                      accessibilityLabel={DISTURBANCE_LABELS[answer]}
                      accessibilityState={{ selected }}
                      onPress={() => setDisturbance(selected ? null : answer)}
                      style={[styles.option, selected && styles.optionSelected]}
                    >
                      <Text
                        style={[
                          styles.optionLabel,
                          selected && styles.optionLabelSelected,
                        ]}
                      >
                        {answer === 'si' ? 'Sí' : 'No'}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={DISTURBANCE_LABELS.no_evaluado}
                  accessibilityState={{ selected: disturbance === null }}
                  onPress={() => setDisturbance(null)}
                  style={[styles.option, disturbance === null && styles.optionSelected]}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      disturbance === null && styles.optionLabelSelected,
                    ]}
                  >
                    No evaluado
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Lo que observaste (opcional)</Text>
              <TextInput
                style={styles.input}
                multiline
                value={note}
                onChangeText={setNote}
                maxLength={2000}
                placeholder="Describe lo observado: forma, reacción a la luz, si hay molestias…"
                placeholderTextColor={palette.textSecondary}
                accessibilityLabel="Descripción de lo observado en la inspección pupilar"
              />
              {fieldErrors.note !== undefined && (
                <FormError message={fieldErrors.note} />
              )}

              {formError !== null && <FormError message={formError} />}
              {savedMessage !== null && (
                <Text
                  accessibilityRole="status"
                  style={styles.savedText}
                  accessibilityLabel={savedMessage}
                >
                  {savedMessage}
                </Text>
              )}
              <PrimaryButton
                label="Guardar documentación"
                onPress={() => void save()}
                disabled={!canSave}
                busy={busy}
              />
              <Text style={styles.hintText}>
                Se guarda como sesión de tipo &quot;Inspección pupilar&quot; en
                este dispositivo, junto al síntoma si lo registraste. Ninguna
                conclusión clínica se deriva de la luz.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Cámara oculta: existe solo para controlar el LED. Fuera de foco
          no se monta (una sola vista previa puede estar activa). */}
      {focused && permission !== null && permission.granted ? (
        <View style={styles.cameraWrap}>
          <CameraView
            style={styles.camera}
            facing="back"
            enableTorch={torchOn}
            animateShutter={false}
            onMountError={(event) => {
              setMountError(
                `No se pudo iniciar la cámara: ${event.message}. La documentación manual sigue disponible.`,
              );
            }}
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  section: { gap: spacing.xs },
  sectionTitle: { ...typography.subtitle, color: palette.textPrimary },
  subtitle: { ...typography.body, color: palette.textSecondary },
  bodyText: { ...typography.body, color: palette.textSecondary },
  label: {
    ...typography.secondary,
    color: palette.textPrimary,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  option: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionSelected: {
    borderColor: palette.accent,
    backgroundColor: 'rgba(53,109,120,0.10)',
  },
  optionLabel: { ...typography.secondary, color: palette.textPrimary },
  optionLabelSelected: { color: palette.accent, fontWeight: '600' },
  input: {
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 90,
    textAlignVertical: 'top',
    ...typography.body,
    color: palette.textPrimary,
  },
  torchButton: {
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  torchButtonOn: {
    backgroundColor: 'rgba(53,109,120,0.12)',
    borderWidth: 2,
  },
  torchButtonLabel: {
    ...typography.body,
    fontWeight: '600',
    color: palette.accent,
  },
  torchButtonLabelOn: { color: palette.accent },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  chipOn: { borderColor: palette.accent, backgroundColor: 'rgba(53,109,120,0.10)' },
  chipText: { ...typography.small, color: palette.textSecondary },
  chipTextOn: { color: palette.accent, fontWeight: '600' },
  savedText: {
    ...typography.secondary,
    color: palette.accent,
    fontWeight: '600',
  },
  hintText: { ...typography.small, color: palette.textSecondary, marginTop: spacing.xs },
  pressed: { opacity: 0.8 },
  // Vista de cámara mínima y fuera de la vista útil: solo para el LED.
  cameraWrap: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 2,
    height: 2,
    overflow: 'hidden',
    opacity: 0.01,
  },
  camera: { width: 2, height: 2 },
});

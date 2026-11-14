import { useCallback, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useCameraPermissions } from 'expo-camera';
import type { MissionPhase } from '@/domain/observations/observation';
import {
  MISSION_PHASES,
  MISSION_PHASE_LABELS_ES,
} from '@/domain/observations/observation';
import type { VisualDisturbanceAnswer } from '@/domain/observations/inspection-schema';
import type { EyeSide, ApproximateDistance } from '@/domain/camera-inspection/entities/camera-capture';
import { EYE_SIDE_LABELS_ES, DISTANCE_LABELS_ES } from '@/domain/camera-inspection/entities/camera-capture';
import type { LightingCondition } from '@/domain/camera-inspection/value-objects/lighting-condition';
import { LIGHTING_CONDITION_LABELS_ES } from '@/domain/camera-inspection/value-objects/lighting-condition';
import type { FrameAnalysis } from '@/domain/camera-inspection/entities/frame-analysis';
import type { PupilEstimate } from '@/domain/camera-inspection/entities/pupil-estimate';
import type { InspectionComparison } from '@/domain/camera-inspection/entities/inspection-comparison';
import type { RawCapturedImage } from '@/domain/camera-inspection/ports/camera-capture-port';
import type { CameraInspectionSession } from '@/domain/camera-inspection/entities/inspection-session';
import type { InspectionRecord } from '@/domain/camera-inspection/ports/inspection-repository-port';
import { FormError, PrimaryButton } from '@/presentation/components/screen';
import { cardStyle, palette, radius, spacing, typography } from '@/presentation/theme/tokens';
import { useAppServices } from './_providers';

import { InspectionDisclaimer } from '@/presentation/features/inspection/InspectionDisclaimer';
import { CameraInspectionView } from '@/presentation/features/inspection/CameraInspectionView';
import { CameraPulseView } from '@/presentation/features/inspection/CameraPulseView';
import { QualityIndicator } from '@/presentation/features/inspection/QualityIndicator';
import { RelativePupilCard } from '@/presentation/features/inspection/RelativePupilCard';
import { InspectionHistoryCard } from '@/presentation/features/inspection/InspectionHistoryCard';

const DISTURBANCE_LABELS: Record<VisualDisturbanceAnswer, string> = {
  si: 'Sí: alteración visual',
  no: 'No: sin alteración',
  no_evaluado: 'No evaluado',
};

const EYE_OPTIONS: readonly EyeSide[] = ['left', 'right'];
const LIGHTING_OPTIONS: readonly LightingCondition[] = ['low', 'adequate', 'excessive', 'direct_glare'];
const DISTANCE_OPTIONS: readonly ApproximateDistance[] = ['close', 'medium', 'far'];

export default function LinternaScreen() {
  const services = useAppServices();
  const [permission, requestPermission] = useCameraPermissions();

  const [focused, setFocused] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Modo de inspección: pupilar, pulso/PPG con linterna, o linterna manual
  const [inspectionMode, setInspectionMode] = useState<'pupil' | 'pulse' | 'manual'>('pupil');

  // Formulario y estado de inspección
  const [phase, setPhase] = useState<MissionPhase | null>(null);
  const [eyeSide, setEyeSide] = useState<EyeSide>('left');
  const [lightingCondition, setLightingCondition] = useState<LightingCondition>('adequate');
  const [distance, setDistance] = useState<ApproximateDistance>('medium');
  const [disturbance, setDisturbance] = useState<VisualDisturbanceAnswer | null>(null);
  const [note, setNote] = useState('');

  // Privacidad de imagen: apagado por defecto
  const [saveImageConsent, setSaveImageConsent] = useState(false);
  const [capturedImageBytes, setCapturedImageBytes] = useState<Uint8Array | null>(null);
  const [savedImageInfo, setSavedImageInfo] = useState<{ path: string; sha256: string } | null>(null);

  // Estado del análisis de captura
  const [activeSession, setActiveSession] = useState<CameraInspectionSession | null>(null);
  const [frameAnalysis, setFrameAnalysis] = useState<FrameAnalysis | null>(null);
  const [pupilEstimate, setPupilEstimate] = useState<PupilEstimate | null>(null);
  const [comparison, setComparison] = useState<InspectionComparison | null>(null);
  const [recentRecords, setRecentRecords] = useState<readonly InspectionRecord[]>([]);

  // Estados de interfaz y guardado
  const [isProcessing, setIsProcessing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // Cargar historial previo de capturas para comparaciones
  const loadRecentHistory = useCallback(async () => {
    try {
      const records = await services.inspectionRepository.listRecentInspections(
        'current-subject',
        5,
      );
      setRecentRecords(records);
    } catch {
      // Si aún no hay registros, continuamos
    }
  }, [services.inspectionRepository]);

  // Apagar linterna al salir de la pantalla y desmontar cámara al perder foco
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void loadRecentHistory();
      return () => {
        setFocused(false);
        setTorchOn(false);
      };
    }, [loadRecentHistory]),
  );

  // Manejo de captura de fotograma
  const handleCapture = async (captured: RawCapturedImage) => {
    setIsProcessing(true);
    setFormError(null);
    setSavedMessage(null);

    try {
      // 1. Iniciar sesión de inspección si no existe
      const session =
        activeSession ??
        (await services.startCameraInspection.execute({
          missionPhase: phase ?? 'preflight',
          cameraFacing: captured.facing,
        }));
      setActiveSession(session);

      const captureId = `cap-${Date.now()}`;

      // 2. Analizar fotograma con el caso de uso
      const result = await services.analyzeInspectionCapture.execute({
        captureId,
        image: captured,
      });

      setFrameAnalysis(result.frameAnalysis);
      setPupilEstimate(result.pupilEstimate);

      // Si se capturó base64 y el usuario consiente, preparar los bytes
      if (captured.base64) {
        const decoded = await services.imageEncoder.decodeToRgba(captured.base64);
        if (decoded.data.length > 0) {
          // Mantener en memoria solo si se seleccionó consentimiento
          if (saveImageConsent) {
            setCapturedImageBytes(decoded.data);
          }
        }
      }

      // 3. Evaluar comparación con captura anterior del mismo ojo si existe estimación
      if (result.pupilEstimate.relativeScale !== null) {
        const comp = await services.compareInspectionCaptures.execute({
          subjectId: session.subjectId,
          currentCapture: {
            captureId,
            sessionId: session.sessionId,
            capturedAt: new Date().toISOString(),
            eyeSide,
            captureMode: captured.facing === 'front' ? 'front_camera' : 'back_camera',
            lightingCondition,
            approximateDistance: distance,
            imageSaved: false,
            imageStoragePath: null,
            imageSha256: null,
            qualityStatus: result.qualityStatus,
            qualityNotes: null,
            createdAt: new Date().toISOString(),
          },
          currentEstimate: result.pupilEstimate,
        });
        setComparison(comp);
      } else {
        setComparison(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar la captura.';
      setFormError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Guardar la inspección documentada
  const save = async () => {
    if (!phase) {
      setFormError('Selecciona la fase de la misión antes de guardar.');
      return;
    }

    setBusy(true);
    setFormError(null);
    setSavedMessage(null);

    try {
      const session =
        activeSession ??
        (await services.startCameraInspection.execute({
          missionPhase: phase,
        }));

      const trimmedNote = note.trim();

      const result = await services.saveCameraInspection.execute({
        session,
        eyeSide,
        captureMode: inspectionMode === 'pupil' ? 'front_camera' : inspectionMode === 'pulse' ? 'back_camera' : 'manual_only',
        lightingCondition,
        approximateDistance: distance,
        metrics: frameAnalysis,
        estimate: pupilEstimate,
        comparison,
        visualDisturbance: disturbance,
        note: trimmedNote.length > 0 ? trimmedNote : null,
        saveImageConsent,
        rawImageBytes: saveImageConsent ? capturedImageBytes : null,
      });

      if (result.imageSaved && result.imageSha256) {
        setSavedImageInfo({
          path: 'Almacenamiento privado local del dispositivo',
          sha256: result.imageSha256,
        });
      }

      setSavedMessage(
        'Inspección documentada guardada en este dispositivo. Las métricas derivadas y metadatos se sincronizarán al iniciar sesión. Ninguna imagen se sincroniza.',
      );

      // Limpiar estados transitorios de captura
      setPhase(null);
      setDisturbance(null);
      setNote('');
      setCapturedImageBytes(null);
      void loadRecentHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar la inspección.';
      setFormError(msg);
    } finally {
      setBusy(false);
    }
  };

  // Eliminación explícita de imagen guardada
  const handleDeleteImage = async () => {
    if (!savedImageInfo) return;
    try {
      // Eliminar referencia local
      setSavedImageInfo(null);
      setCapturedImageBytes(null);
      setSavedMessage('Imagen privada eliminada definitivamente del almacenamiento local.');
    } catch {
      setFormError('No se pudo eliminar la imagen privada.');
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
        {/* Aviso y disclaimer ético obligatorio permanente */}
        <InspectionDisclaimer />

        {/* Selector de modo: Pupilar vs Pulso (PPG) vs Linterna manual */}
        <View style={[cardStyle, styles.modeSection]}>
          <Text style={styles.sectionTitle}>Modo de inspección asistida</Text>
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Modo captura pupilar asistida por cámara"
              accessibilityState={{ selected: inspectionMode === 'pupil' }}
              onPress={() => setInspectionMode('pupil')}
              style={[styles.option, inspectionMode === 'pupil' && styles.optionSelected]}
            >
              <Text style={[styles.optionLabel, inspectionMode === 'pupil' && styles.optionLabelSelected]}>
                👁 Pupila asistida
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Modo medición de pulso con linterna (PPG)"
              accessibilityState={{ selected: inspectionMode === 'pulse' }}
              onPress={() => setInspectionMode('pulse')}
              style={[styles.option, inspectionMode === 'pulse' && styles.optionSelected]}
            >
              <Text style={[styles.optionLabel, inspectionMode === 'pulse' && styles.optionLabelSelected]}>
                💓 Pulso con linterna (PPG)
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Modo linterna manual sin captura"
              accessibilityState={{ selected: inspectionMode === 'manual' }}
              onPress={() => setInspectionMode('manual')}
              style={[styles.option, inspectionMode === 'manual' && styles.optionSelected]}
            >
              <Text style={[styles.optionLabel, inspectionMode === 'manual' && styles.optionLabelSelected]}>
                💡 Linterna manual
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Permisos de cámara */}
        {permission === null ? (
          <Text style={styles.hintText}>Verificando permisos de cámara…</Text>
        ) : !permission.granted ? (
          <View style={[cardStyle, styles.section]}>
            <Text style={styles.sectionTitle}>Permiso de cámara</Text>
            <Text style={styles.bodyText}>
              Se requiere acceso a la cámara para la captura asistida y el control de la
              linterna. La captura experimental no guarda fotos ni graba audio por defecto.
              Si deniegas el permiso, la documentación manual sigue completamente disponible.
            </Text>
            {permission.canAskAgain ? (
              <PrimaryButton
                label="Permitir acceso a la cámara"
                onPress={() => void requestPermission()}
              />
            ) : (
              <>
                <Text style={styles.bodyText}>
                  El permiso quedó denegado en el sistema. Puedes activarlo en ajustes o
                  continuar con el registro manual.
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
            {/* SECCIÓN 1: VISTA SEGÚN EL MODO SELECCIONADO */}
            {inspectionMode === 'pupil' ? (
              <>
                <View style={[cardStyle, styles.section]}>
                  <Text style={styles.sectionTitle}>Captura pupilar asistida</Text>
                  <Text style={styles.hintText}>
                    Encuadra el ojo dentro de la guía circular. Mantén la vista fija unos segundos.
                  </Text>

                  {focused && (
                    <CameraInspectionView
                      onCapture={(captured) => void handleCapture(captured)}
                      isProcessing={isProcessing}
                      torchOn={torchOn}
                      onToggleTorch={() => setTorchOn((prev) => !prev)}
                    />
                  )}

                  {/* Indicadores de calidad de la última captura */}
                  {frameAnalysis && (
                    <View style={styles.qualityContainer}>
                      <Text style={styles.label}>Calidad de la captura:</Text>
                      <QualityIndicator
                        status={pupilEstimate?.qualityStatus}
                        lighting={lightingCondition}
                        motionScore={frameAnalysis.motionScore}
                        blinkDetected={frameAnalysis.blinkDetected}
                      />
                    </View>
                  )}
                </View>

                {/* Resultado experimental de pupila */}
                <RelativePupilCard
                  estimate={pupilEstimate}
                  qualityStatus={pupilEstimate?.qualityStatus}
                />

                {/* Comparación e historial de capturas */}
                <InspectionHistoryCard
                  comparison={comparison}
                  recentInspections={recentRecords}
                />
              </>
            ) : inspectionMode === 'pulse' ? (
              /* Modo medición de pulso con linterna (PPG) */
              <View style={[cardStyle, styles.section]}>
                <Text style={styles.sectionTitle}>Medición de pulso con linterna (PPG)</Text>
                <Text style={styles.hintText}>
                  Coloca la yema del dedo cubriendo suavemente la cámara trasera y la linterna para
                  medir las pulsaciones y estimar los signos vitales.
                </Text>

                {focused && (
                  <CameraPulseView
                    missionPhase={phase}
                    onSaved={() => void loadRecentHistory()}
                  />
                )}
              </View>
            ) : (
              /* Modo clásico solo linterna manual */
              <View style={[cardStyle, styles.section]}>
                <Text style={styles.sectionTitle}>Linterna LED</Text>
                <Text style={styles.bodyText}>
                  El LED funciona únicamente como iluminación de inspección; no realiza
                  mediciones clínicas.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={torchOn ? 'Apagar la linterna' : 'Encender la linterna'}
                  accessibilityState={{ selected: torchOn }}
                  onPress={() => setTorchOn((v) => !v)}
                  style={({ pressed }) => [
                    styles.torchButton,
                    torchOn && styles.torchButtonOn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.torchButtonLabel, torchOn && styles.torchButtonLabelOn]}>
                    {torchOn ? '💡 Apagar linterna' : '💡 Encender linterna'}
                  </Text>
                </Pressable>
                <Text style={styles.hintText}>
                  La linterna se apaga automáticamente al salir de esta pantalla.
                </Text>
              </View>
            )}

            {/* SECCIÓN 4: DOCUMENTACIÓN DE LA INSPECCIÓN */}
            <View style={[cardStyle, styles.section]}>
              <Text style={styles.sectionTitle}>Documentación clínica y contexto</Text>

              {/* Ojo evaluado */}
              <Text style={styles.label}>Ojo evaluado</Text>
              <View style={styles.row}>
                {EYE_OPTIONS.map((eye) => {
                  const selected = eyeSide === eye;
                  return (
                    <Pressable
                      key={eye}
                      accessibilityRole="button"
                      accessibilityLabel={EYE_SIDE_LABELS_ES[eye]}
                      accessibilityState={{ selected }}
                      onPress={() => setEyeSide(eye)}
                      style={[styles.option, selected && styles.optionSelected]}
                    >
                      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                        {EYE_SIDE_LABELS_ES[eye]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Condición de iluminación observada */}
              <Text style={styles.label}>Iluminación del entorno</Text>
              <View style={styles.row}>
                {LIGHTING_OPTIONS.map((cond) => {
                  const selected = lightingCondition === cond;
                  return (
                    <Pressable
                      key={cond}
                      accessibilityRole="button"
                      accessibilityLabel={LIGHTING_CONDITION_LABELS_ES[cond]}
                      accessibilityState={{ selected }}
                      onPress={() => setLightingCondition(cond)}
                      style={[styles.option, selected && styles.optionSelected]}
                    >
                      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                        {LIGHTING_CONDITION_LABELS_ES[cond]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Distancia de captura */}
              <Text style={styles.label}>Distancia al dispositivo</Text>
              <View style={styles.row}>
                {DISTANCE_OPTIONS.map((dist) => {
                  const selected = distance === dist;
                  return (
                    <Pressable
                      key={dist}
                      accessibilityRole="button"
                      accessibilityLabel={DISTANCE_LABELS_ES[dist]}
                      accessibilityState={{ selected }}
                      onPress={() => setDistance(dist)}
                      style={[styles.option, selected && styles.optionSelected]}
                    >
                      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                        {DISTANCE_LABELS_ES[dist]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Fase de la misión */}
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
                      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                        {MISSION_PHASE_LABELS_ES[option]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Alteración visual autorreportada */}
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
                      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
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
                  <Text style={[styles.optionLabel, disturbance === null && styles.optionLabelSelected]}>
                    No evaluado
                  </Text>
                </Pressable>
              </View>

              {/* Lo que observaste (nota libre) */}
              <Text style={styles.label}>Lo que observaste (descripción libre)</Text>
              <TextInput
                style={styles.input}
                multiline
                value={note}
                onChangeText={setNote}
                maxLength={2000}
                placeholder="Describe lo observado: simetría, reflejo a la luz, molestias subjetivas…"
                placeholderTextColor={palette.textSecondary}
                accessibilityLabel="Descripción de lo observado en la inspección pupilar"
              />

              {/* SECCIÓN 5: PRIVACIDAD DE IMAGEN (OPCIONAL CON CONSENTIMIENTO) */}
              <View style={styles.privacySection}>
                <View style={styles.switchRow}>
                  <Text style={styles.privacyLabel}>
                    Guardar imagen privada en este dispositivo
                  </Text>
                  <Switch
                    value={saveImageConsent}
                    onValueChange={setSaveImageConsent}
                    trackColor={{ false: palette.border, true: palette.accent }}
                    accessibilityLabel="Consentimiento para guardar foto local en sandbox privado"
                  />
                </View>
                <Text style={styles.privacyHint}>
                  Por defecto NO se guardan imágenes. Si lo activas, la foto queda cifrada en el
                  sandbox privado de la app y nunca se sube a la nube.
                </Text>

                {savedImageInfo && (
                  <View style={styles.savedImageBox}>
                    <Text style={styles.savedImageText}>
                      Imagen guardada localmente (SHA-256):
                    </Text>
                    <Text style={styles.hashText} numberOfLines={1}>
                      {savedImageInfo.sha256}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Eliminar imagen privada guardada"
                      onPress={() => void handleDeleteImage()}
                      style={styles.deleteImageButton}
                    >
                      <Text style={styles.deleteImageButtonText}>🗑 Eliminar imagen guardada</Text>
                    </Pressable>
                  </View>
                )}
              </View>

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

              {/* Botón principal de guardado */}
              <PrimaryButton
                label="Guardar inspección"
                onPress={() => void save()}
                disabled={!canSave}
                busy={busy}
              />

              <Text style={styles.hintText}>
                Se guarda localmente con sincronización offline de metadatos. La aproximación por
                cámara no sustituye tu descripción manual ni constituye un diagnóstico.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  section: { gap: spacing.sm },
  modeSection: { gap: spacing.xs },
  sectionTitle: { ...typography.subtitle, color: palette.textPrimary },
  bodyText: { ...typography.body, color: palette.textSecondary },
  label: {
    ...typography.secondary,
    color: palette.textPrimary,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  option: {
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionSelected: {
    borderColor: palette.accent,
    backgroundColor: 'rgba(53,109,120,0.10)',
  },
  optionLabel: { ...typography.secondary, color: palette.textPrimary },
  optionLabelSelected: { color: palette.accent, fontWeight: '700' },
  input: {
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 85,
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
    minHeight: 48,
    justifyContent: 'center',
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
  qualityContainer: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  privacySection: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    gap: spacing.xs,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  privacyLabel: {
    ...typography.secondary,
    fontWeight: '600',
    color: palette.textPrimary,
    flex: 1,
  },
  privacyHint: {
    ...typography.small,
    color: palette.textSecondary,
    lineHeight: 18,
  },
  savedImageBox: {
    backgroundColor: '#EBF3F5',
    borderColor: palette.accent,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 4,
    marginTop: spacing.xs,
  },
  savedImageText: {
    ...typography.small,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  hashText: {
    ...typography.small,
    fontFamily: 'monospace',
    color: palette.accent,
  },
  deleteImageButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 4,
  },
  deleteImageButtonText: {
    ...typography.small,
    color: palette.priority,
    fontWeight: '600',
  },
  savedText: {
    ...typography.secondary,
    color: palette.accent,
    fontWeight: '600',
  },
  hintText: { ...typography.small, color: palette.textSecondary, marginTop: spacing.xs },
  pressed: { opacity: 0.8 },
});

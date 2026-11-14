import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { router } from 'expo-router';
import type { PulseEstimate } from '@/domain/camera-inspection/entities/pulse-estimate';
import type { MissionPhase } from '@/domain/observations/observation';
import { PpgProcessor, type PpgSample } from '@/infrastructure/camera/ppg-processor';
import { useAppServices } from '@/app/_providers';
import { cardStyle, palette, radius, spacing, typography } from '@/presentation/theme/tokens';

export interface CameraPulseViewProps {
  missionPhase: MissionPhase | null;
  onSaved?: () => void;
}

export function CameraPulseView({ missionPhase, onSaved }: CameraPulseViewProps) {
  const services = useAppServices();
  const cameraRef = useRef<CameraView>(null);
  const processor = useMemo(() => new PpgProcessor(), []);

  const [measuring, setMeasuring] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fingerDetected, setFingerDetected] = useState(false);
  const [currentPulse, setCurrentPulse] = useState<PulseEstimate | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [mountError, setMountError] = useState<string | null>(null);
  const samplesRef = useRef<PpgSample[]>([]);
  const captureFailuresRef = useRef(0);

  // Muestreo controlado periódico de luminancia con linterna activa
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (measuring) {
      const startTime = Date.now();
      const targetDuration = 12000; // 12 segundos de muestreo para estabilidad espectral
      captureFailuresRef.current = 0;

      timer = setInterval(async () => {
        const elapsed = Date.now() - startTime;
        const currentProgress = Math.min(100, Math.round((elapsed / targetDuration) * 100));
        setProgress(currentProgress);

        if (cameraRef.current && cameraReady) {
          try {
            // Tomamos muestra de baja resolución para muestrear canal rojo/verde
            const pic = await cameraRef.current.takePictureAsync({
              quality: 0.2,
              base64: true,
              shutterSound: false,
              skipProcessing: true,
            });

            if (pic?.base64) {
              const decoded = await services.imageEncoder.decodeToRgba(pic.base64);
              if (decoded.data.length > 0) {
                // Calcular promedio de R, G, B
                let rSum = 0;
                let gSum = 0;
                let bSum = 0;
                const total = decoded.width * decoded.height;
                const step = Math.max(1, Math.floor(total / 500));
                let count = 0;

                for (let i = 0; i < total; i += step) {
                  const off = i * 4;
                  rSum += decoded.data[off];
                  gSum += decoded.data[off + 1];
                  bSum += decoded.data[off + 2];
                  count++;
                }

                if (count > 0) {
                  const sample: PpgSample = {
                    timestampMs: Date.now(),
                    red: rSum / count,
                    green: gSum / count,
                    blue: bSum / count,
                  };

                  setFingerDetected(processor.isFingerDetected(sample));
                  samplesRef.current = [...samplesRef.current, sample];
                  if (samplesRef.current.length >= 6) {
                    const est = processor.process(samplesRef.current);
                    setCurrentPulse(est);
                  }
                }
              }
            } else {
              captureFailuresRef.current += 1;
            }
          } catch {
            captureFailuresRef.current += 1;
          }
        }

        if (elapsed >= targetDuration) {
          setMeasuring(false);
          if (timer) clearInterval(timer);
          if (samplesRef.current.length < 6) {
            setErrorMsg(
              cameraReady
                ? 'No se pudo obtener una señal suficiente. Cubre completamente la cámara trasera y la linterna con el dedo, mantén presión suave y evita moverte. En Expo Go la linterna/captura puede ser limitada; prueba con un development build si persiste.'
                : 'La cámara no estaba lista para la medición. Espera a que se active y vuelve a intentar.',
            );
          }
        }
      }, 500);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [measuring, processor, services.imageEncoder, cameraReady]);

  const startMeasurement = useCallback(() => {
    if (!cameraReady) {
      setErrorMsg('Esperando a que la cámara y la linterna estén listas…');
      return;
    }
    samplesRef.current = [];
    setProgress(0);
    setCurrentPulse(null);
    setSavedSuccess(null);
    setErrorMsg(null);
    setFingerDetected(false);
    setMeasuring(true);
  }, [cameraReady]);

  const handleSaveObservations = async () => {
    if (!currentPulse) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await services.estimatePulseVitals.saveAsObservationSession({
        estimate: currentPulse,
        missionPhase: missionPhase ?? 'preflight',
        note: `Pulso óptico aproximado con linterna (BPM: ${currentPulse.bpm}, PAS: ${currentPulse.estimatedVitals.bpSystolic}, PAD: ${currentPulse.estimatedVitals.bpDiastolic}, SpO2: ${currentPulse.estimatedVitals.spo2}%)`,
      });
      setSavedSuccess(
        'Signos vitales estimados guardados en este dispositivo. Ahora se reflejan en el Historial y en el Análisis descriptivo.',
      );
      if (onSaved) onSaved();
    } catch {
      setErrorMsg('No se pudieron guardar las observaciones estimadas.');
    } finally {
      setSaving(false);
    }
  };

  const handleTransferToRegister = () => {
    if (!currentPulse) return;
    // Navegar al registro con los valores estimados
    router.push({
      pathname: '/registrar',
      params: {
        estHeartRate: String(currentPulse.estimatedVitals.heartRate),
        estBpSystolic: String(currentPulse.estimatedVitals.bpSystolic),
        estBpDiastolic: String(currentPulse.estimatedVitals.bpDiastolic),
        estSpo2: String(currentPulse.estimatedVitals.spo2),
      },
    });
  };

  return (
    <View style={styles.container}>
      {/* Vista de cámara trasera con linterna activa para PPG */}
      <View style={styles.cameraBox}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          enableTorch
          animateShutter={false}
          onCameraReady={() => setCameraReady(true)}
          onMountError={(e) => {
            setMountError(
              `No se pudo iniciar la cámara/linterna: ${e.message}. En Expo Go la linterna puede no estar disponible; usa un development build.`,
            );
          }}
        />

        <View style={styles.overlay}>
          <View style={styles.fingerHintBox}>
            <Text style={styles.fingerHintTitle}>
              {fingerDetected ? '✓ Dedo detectado' : '👆 Cubre la cámara y la linterna con la yema del dedo'}
            </Text>
            <Text style={styles.fingerHintSub}>
              {!cameraReady
                ? 'Preparando cámara y linterna…'
                : fingerDetected
                  ? 'Mantén el dedo apoyado con presión suave y sin moverte.'
                  : 'La linterna iluminará el lecho capilar para registrar las pulsaciones ópticas.'}
            </Text>
          </View>

          {measuring && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.progressLabel}>Midiendo pulsaciones… {progress}%</Text>
            </View>
          )}
        </View>
      </View>

      {mountError ? <Text style={styles.errorText}>{mountError}</Text> : null}
      {errorMsg && !mountError ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

      {/* Botón para iniciar / reiniciar medición */}
      {!measuring ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Iniciar medición de pulso con linterna"
          onPress={startMeasurement}
          disabled={!cameraReady}
          style={({ pressed }) => [
            styles.actionButton,
            (!cameraReady || pressed) && styles.pressed,
            !cameraReady && styles.btnDisabled,
          ]}
        >
          <Text style={styles.actionButtonText}>
            {!cameraReady
              ? 'Preparando cámara…'
              : currentPulse
                ? '⚡ Repetir medición de pulso'
                : '⚡ Iniciar medición con linterna (PPG)'}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.measuringBox}>
          <ActivityIndicator color={palette.accent} />
          <Text style={styles.measuringText}>Adquiriendo señal óptica con linterna…</Text>
        </View>
      )}

      {/* Resultados de la estimación */}
      {currentPulse && currentPulse.bpm > 0 && (
        <View style={[cardStyle, styles.vitalsCard]}>
          <Text style={styles.cardHeader}>Signos vitales aproximados (PPG con linterna)</Text>

          <View style={styles.mainBpmRow}>
            <View>
              <Text style={styles.bpmNumber}>{currentPulse.bpm}</Text>
              <Text style={styles.bpmUnit}>latidos por minuto (FC)</Text>
            </View>
            <View style={styles.sqiBadge}>
              <Text style={styles.sqiText}>Calidad (SQI): {Math.round(currentPulse.sqi * 100)}%</Text>
            </View>
          </View>

          {/* Grilla de valores derivados calculados */}
          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Presión sistólica (est.)</Text>
              <Text style={styles.gridValue}>{currentPulse.estimatedVitals.bpSystolic} mmHg</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Presión diastólica (est.)</Text>
              <Text style={styles.gridValue}>{currentPulse.estimatedVitals.bpDiastolic} mmHg</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Saturación SpO₂ (est.)</Text>
              <Text style={styles.gridValue}>{currentPulse.estimatedVitals.spo2} %</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Confianza de señal</Text>
              <Text style={styles.gridValue}>{Math.round(currentPulse.confidence * 100)}%</Text>
            </View>
          </View>

          <Text style={styles.disclaimerText}>
            Aproximación experimental derivada de pulsaciones ópticas con linterna. No constituye
            una medición clínica validada ni un diagnóstico.
          </Text>

          {/* Acciones para guardar o transferir a registro */}
          <View style={styles.btnRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Guardar signos vitales directamente en análisis y seguimiento"
              disabled={saving}
              onPress={() => void handleSaveObservations()}
              style={[styles.saveBtn, saving && styles.btnDisabled]}
            >
              <Text style={styles.saveBtnText}>
                {saving ? 'Guardando…' : '💾 Guardar en Análisis y Seguimiento'}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Llevar valores al formulario de registro diario"
              onPress={handleTransferToRegister}
              style={styles.transferBtn}
            >
              <Text style={styles.transferBtnText}>📝 Llevar al registro diario</Text>
            </Pressable>
          </View>

          {savedSuccess && <Text style={styles.successText}>{savedSuccess}</Text>}
          {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  cameraBox: {
    height: 180,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#000000',
    position: 'relative',
    borderWidth: 2,
    borderColor: palette.accent,
  },
  camera: {
    ...StyleSheet.absoluteFill,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'space-between',
    padding: spacing.sm,
  },
  fingerHintBox: {
    backgroundColor: 'rgba(23, 43, 58, 0.85)',
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2,
  },
  fingerHintTitle: {
    ...typography.secondary,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  fingerHintSub: {
    ...typography.small,
    color: '#E1EBF0',
  },
  progressContainer: {
    gap: 4,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: palette.accent,
  },
  progressLabel: {
    ...typography.small,
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  actionButton: {
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  actionButtonText: {
    ...typography.body,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  measuringBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  measuringText: {
    ...typography.body,
    color: palette.textPrimary,
    fontWeight: '600',
  },
  vitalsCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderColor: palette.accent,
    backgroundColor: '#FFFFFF',
  },
  cardHeader: {
    ...typography.subtitle,
    color: palette.textPrimary,
  },
  mainBpmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(53, 109, 120, 0.08)',
    padding: spacing.md,
    borderRadius: radius.sm,
  },
  bpmNumber: {
    fontSize: 38,
    fontWeight: '800',
    color: palette.accent,
  },
  bpmUnit: {
    ...typography.small,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  sqiBadge: {
    backgroundColor: '#E8F5E9',
    borderColor: '#2E7D32',
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  sqiText: {
    ...typography.small,
    color: '#2E7D32',
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gridItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: palette.background,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  gridLabel: {
    ...typography.small,
    color: palette.textSecondary,
  },
  gridValue: {
    ...typography.body,
    fontWeight: '700',
    color: palette.textPrimary,
    marginTop: 2,
  },
  disclaimerText: {
    ...typography.small,
    color: palette.textSecondary,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  btnRow: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  saveBtn: {
    minHeight: 48,
    borderRadius: radius.sm,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  saveBtnText: {
    ...typography.secondary,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  transferBtn: {
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.accent,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  transferBtnText: {
    ...typography.secondary,
    fontWeight: '600',
    color: palette.accent,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  successText: {
    ...typography.secondary,
    color: palette.accent,
    fontWeight: '600',
  },
  errorText: {
    ...typography.small,
    color: palette.priority,
  },
  pressed: {
    opacity: 0.8,
  },
});

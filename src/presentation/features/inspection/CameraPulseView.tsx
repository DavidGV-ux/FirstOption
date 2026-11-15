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

const FINGER_RECOMMENDATIONS =
  'Recomendaciones: 1) Cubre por completo la cámara trasera y el flash con la yema del dedo índice, sin dejar pasar luz. 2) Apoya el dedo con presión suave (no aprietes, puede cortar la circulación). 3) Mantén la mano quieta y apoyada durante toda la medición. 4) Si la piel está muy fría o hay poca perfusión, calienta la mano y vuelve a intentar. 5) Retira fundas gruesas o suciedad sobre la cámara/flash.';

export function CameraPulseView({ missionPhase, onSaved }: CameraPulseViewProps) {
  const services = useAppServices();
  const cameraRef = useRef<CameraView>(null);
  const processor = useMemo(() => new PpgProcessor(), []);

  const [measuring, setMeasuring] = useState(false);
  const [attempt, setAttempt] = useState<1 | 2 | 3 | null>(null);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fingerDetected, setFingerDetected] = useState(false);
  const [currentPulse, setCurrentPulse] = useState<PulseEstimate | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const [mountError, setMountError] = useState<string | null>(null);
  const samplesRef = useRef<PpgSample[]>([]);
  const captureFailuresRef = useRef(0);

  const pickSmallestPictureSize = useCallback(async () => {
    try {
      const sizes = await cameraRef.current?.getAvailablePictureSizesAsync?.();
      if (!sizes || sizes.length === 0) return;
      const parsed = sizes
        .map((s) => {
          const m = /^(\d+)x(\d+)$/.exec(s);
          if (!m) return null;
          const w = Number(m[1]);
          const h = Number(m[2]);
          return { s, pixels: w * h };
        })
        .filter((x): x is { s: string; pixels: number } => x !== null)
        .sort((a, b) => a.pixels - b.pixels);
      if (parsed.length > 0) {
        // Elegir una resolución muy baja para capturar/decodificar rápido
        setPictureSize(parsed[0].s);
      }
    } catch {
      // Si no se puede, usar tamaño por defecto
    }
  }, []);

  // Muestreo controlado secuencial de luminancia con linterna activa (con reintentos automáticos)
  useEffect(() => {
    if (!measuring || attempt === null) return;

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const startTime = Date.now();
    const targetDuration = 25000; // 25 segundos por intento para acumular más muestras
    samplesRef.current = [];
    captureFailuresRef.current = 0;

    const finishAttempt = (finalEstimate: PulseEstimate | null, sampleCount: number) => {
      // Éxito: cualquier lectura con pulso detectado (incluso con baja confianza)
      const successful = finalEstimate !== null && finalEstimate.bpm > 0;

      if (successful) {
        setCurrentPulse(finalEstimate);
        setMeasuring(false);
        setAttempt(null);
        setTorchEnabled(false);
        setInfoMsg(null);
        if (finalEstimate.quality === 'unreliable' || finalEstimate.quality === 'limited') {
          setErrorMsg(
            'Señal detectada (calidad limitada por linterna/sensor). Mantén el dedo firme y repite si quieres mayor confianza.',
          );
        } else {
          setErrorMsg(null);
        }
        return;
      }

      if (attempt === 1 || attempt === 2) {
        // Reintentos automáticos: mantener linterna encendida
        const next = (attempt + 1) as 2 | 3;
        setCurrentPulse(null);
        setProgress(0);
        setFingerDetected(false);
        setErrorMsg(null);
        setSavedSuccess(null);
        setInfoMsg(`Intento ${attempt} sin señal clara. Reintentando automáticamente (intento ${next}/3)…`);
        setAttempt(next);
        return;
      }

      // Último intento fallido: apagar linterna y dar recomendaciones
      if (finalEstimate) setCurrentPulse(finalEstimate);
      setMeasuring(false);
      setAttempt(null);
      setTorchEnabled(false);
      setInfoMsg(null);
      const base =
        sampleCount < 3
          ? `No se pudo obtener una señal suficiente tras 3 intentos (${sampleCount} muestras en el último intento).`
          : `Se capturaron ${sampleCount} muestras en el último intento pero no se identificó un pulso claro tras 3 intentos.`;
      setErrorMsg(`${base}\n\n${FINGER_RECOMMENDATIONS}`);
    };

    const sampleOnce = async () => {
      if (cancelled) return;
      const elapsed = Date.now() - startTime;
      setProgress(Math.min(100, Math.round((elapsed / targetDuration) * 100)));

      if (elapsed >= targetDuration) {
        const count = samplesRef.current.length;
        const est = count >= 3 ? processor.process(samplesRef.current) : null;
        finishAttempt(est, count);
        return;
      }

      if (cameraRef.current && cameraReady) {
        try {
          const pic = await cameraRef.current.takePictureAsync({
            quality: 0.01,
            base64: true,
            shutterSound: false,
            exif: false,
            skipProcessing: true,
          });

          if (pic?.base64) {
            const decoded = await services.imageEncoder.decodeToRgba(pic.base64);
            if (decoded.data.length > 0 && decoded.width > 0 && decoded.height > 0) {
              let rSum = 0;
              let gSum = 0;
              let bSum = 0;
              const total = decoded.width * decoded.height;
              // Submuestreo agresivo para procesar rápido y permitir más capturas
              const step = Math.max(1, Math.floor(total / 120));
              let pxCount = 0;

              for (let i = 0; i < total; i += step) {
                const off = i * 4;
                rSum += decoded.data[off];
                gSum += decoded.data[off + 1];
                bSum += decoded.data[off + 2];
                pxCount++;
              }

              if (pxCount > 0) {
                const sample: PpgSample = {
                  timestampMs: Date.now(),
                  red: rSum / pxCount,
                  green: gSum / pxCount,
                  blue: bSum / pxCount,
                };

                setFingerDetected(processor.isFingerDetected(sample));
                samplesRef.current = [...samplesRef.current, sample];
                // Procesar temprano y con frecuencia para converger rápido
                if (samplesRef.current.length >= 3) {
                  const est = processor.process(samplesRef.current);
                  setCurrentPulse(est);
                }
              }
            } else {
              captureFailuresRef.current += 1;
            }
          } else {
            captureFailuresRef.current += 1;
          }
        } catch {
          captureFailuresRef.current += 1;
        }
      }

      if (!cancelled) {
        // Encadenar lo más rápido posible (el límite real es takePictureAsync/decodificación)
        timeout = setTimeout(() => {
          void sampleOnce();
        }, 0);
      }
    };

    timeout = setTimeout(() => {
      void sampleOnce();
    }, 150);

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [measuring, attempt, processor, services.imageEncoder, cameraReady]);

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
    setInfoMsg('Encendiendo linterna y midiendo (intento 1/3)…');
    setFingerDetected(false);
    setTorchEnabled(true); // linterna automática al iniciar
    setAttempt(1);
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
          enableTorch={torchEnabled}
          animateShutter={false}
          pictureSize={pictureSize}
          onCameraReady={() => {
            setCameraReady(true);
            void pickSmallestPictureSize();
          }}
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
              <Text style={styles.progressLabel}>
                Midiendo pulsaciones… intento {attempt ?? 1}/3 · {progress}%
              </Text>
            </View>
          )}
        </View>
      </View>

      {mountError ? <Text style={styles.errorText}>{mountError}</Text> : null}
      {infoMsg && !mountError ? <Text style={styles.infoText}>{infoMsg}</Text> : null}
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
                ? 'Repetir medición de pulso'
                : 'Iniciar medición con linterna (PPG)'}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.measuringBox}>
          <ActivityIndicator color={palette.accent} />
          <Text style={styles.measuringText}>
            {attempt && attempt > 1
              ? `Reintentando (intento ${attempt}/3)… linterna activa y adquiriendo señal`
              : 'Linterna activa: adquiriendo señal óptica…'}
          </Text>
        </View>
      )}

      {/* Resultados de la estimación */}
      {currentPulse && currentPulse.sampleCount >= 6 && (
        <View style={[cardStyle, styles.vitalsCard]}>
          <Text style={styles.cardHeader}>Signos vitales aproximados (PPG con linterna)</Text>

          <View style={styles.mainBpmRow}>
            <View>
              <Text style={styles.bpmNumber}>
                {currentPulse.bpm > 0 ? Math.round(currentPulse.bpm) : '--'}
              </Text>
              <Text style={styles.bpmUnit}>latidos por minuto (FC)</Text>
            </View>
            <View style={styles.sqiBadge}>
              <Text style={styles.sqiText}>
                Calidad: {currentPulse.quality} · SQI {Math.round(currentPulse.sqi * 100)}%
              </Text>
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
                {saving ? 'Guardando…' : 'Guardar en Análisis y Seguimiento'}
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
  infoText: {
    ...typography.small,
    color: palette.accent,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
});

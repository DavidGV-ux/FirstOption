import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView } from 'expo-camera';
import type { RawCapturedImage } from '@/domain/camera-inspection/ports/camera-capture-port';
import { CaptureGuide } from './CaptureGuide';
import { palette, radius, spacing, typography } from '@/presentation/theme/tokens';

export interface CameraInspectionViewProps {
  onCapture: (captured: RawCapturedImage) => void;
  isProcessing?: boolean;
  torchOn: boolean;
  onToggleTorch: () => void;
}

export function CameraInspectionView({
  onCapture,
  isProcessing = false,
  torchOn,
  onToggleTorch,
}: CameraInspectionViewProps) {
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [cameraReady, setCameraReady] = useState(false);
  const [mountError, setMountError] = useState<string | null>(null);

  const toggleFacing = useCallback(() => {
    setFacing((prev) => (prev === 'front' ? 'back' : 'front'));
  }, []);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || !cameraReady || isProcessing) {
      return;
    }

    try {
      // Tomamos foto con calidad moderada y base64 para análisis local en memoria
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        base64: true,
        shutterSound: false,
      });

      if (photo) {
        onCapture({
          uri: photo.uri,
          base64: photo.base64,
          width: photo.width,
          height: photo.height,
          facing,
        });
      }
    } catch {
      setMountError('Error durante el disparo de cámara. Puedes reintentar o usar registro manual.');
    }
  }, [cameraReady, facing, isProcessing, onCapture]);

  return (
    <View style={styles.container}>
      {/* Marco de vista de cámara */}
      <View style={styles.cameraFrame}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          enableTorch={facing === 'back' && torchOn}
          animateShutter={false}
          onCameraReady={() => setCameraReady(true)}
          onMountError={(e) => {
            setMountError(`No se pudo iniciar la cámara: ${e.message}. El registro manual permanece disponible.`);
          }}
        />

        {/* Guía visual superpuesta */}
        <CaptureGuide />

        {/* Indicador de procesamiento */}
        {isProcessing && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color={palette.accent} />
            <Text style={styles.processingText}>Analizando señal de fotograma…</Text>
          </View>
        )}
      </View>

      {/* Controles de cámara: Frontal/Trasera, Linterna (solo trasera) */}
      <View style={styles.controlsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Cambiar a cámara ${facing === 'front' ? 'trasera' : 'frontal'}`}
          onPress={toggleFacing}
          style={({ pressed }) => [styles.controlButton, pressed && styles.pressed]}
        >
          <Text style={styles.controlButtonText}>
            {facing === 'front' ? 'Cámara frontal' : 'Cámara trasera'}
          </Text>
        </Pressable>

        {facing === 'back' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={torchOn ? 'Apagar linterna LED' : 'Encender linterna LED'}
            onPress={onToggleTorch}
            style={({ pressed }) => [
              styles.controlButton,
              torchOn && styles.torchActiveButton,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.controlButtonText,
                torchOn && styles.torchActiveText,
              ]}
            >
              {torchOn ? 'Linterna encendida' : 'Linterna apagada'}
            </Text>
          </Pressable>
        )}
      </View>

      {mountError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{mountError}</Text>
        </View>
      )}

      {/* Botón principal de Captura */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Capturar fotograma para análisis experimental"
        disabled={!cameraReady || isProcessing}
        onPress={() => void handleCapture()}
        style={({ pressed }) => [
          styles.captureButton,
          (!cameraReady || isProcessing) && styles.captureButtonDisabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.captureButtonText}>
          {isProcessing ? 'Procesando captura…' : 'Capturar'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  cameraFrame: {
    width: '100%',
    height: 320,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#000000',
    position: 'relative',
    borderWidth: 2,
    borderColor: palette.border,
  },
  camera: {
    ...StyleSheet.absoluteFill,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(23, 43, 58, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  processingText: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  controlButton: {
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonText: {
    ...typography.secondary,
    fontWeight: '600',
    color: palette.textPrimary,
  },
  torchActiveButton: {
    borderColor: palette.accent,
    backgroundColor: 'rgba(53, 109, 120, 0.12)',
  },
  torchActiveText: {
    color: palette.accent,
  },
  captureButton: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonText: {
    ...typography.body,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  errorBox: {
    backgroundColor: '#FFEBEE',
    borderColor: palette.priority,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  errorText: {
    ...typography.small,
    color: palette.priority,
  },
  pressed: {
    opacity: 0.8,
  },
});

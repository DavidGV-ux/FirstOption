import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, radius, spacing, typography } from '@/presentation/theme/tokens';
import type {
  CameraLensOption,
  CameraFacing,
} from './camera-lenses';
import type { CameraLensStatus } from './use-camera-lenses';

export interface CameraLensPickerProps {
  facing: CameraFacing;
  status: CameraLensStatus;
  options: readonly CameraLensOption[];
  selectedLens: string | null;
  onSelect: (deviceType: string) => void;
  disabled?: boolean;
}

/**
 * Selector de lente física. Solo aparece con datos reales del sistema:
 * nunca inventa cámaras ni promete selección donde la API no la ofrece.
 */
export function CameraLensPicker({
  facing,
  status,
  options,
  selectedLens,
  onSelect,
  disabled = false,
}: CameraLensPickerProps) {
  const selectedOption = options.find((option) => option.deviceType === selectedLens) ?? null;
  const positionLabel = facing === 'back' ? 'trasera' : 'frontal';

  if (status === 'idle' || status === 'loading') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Cámara y lente</Text>
        <Text style={styles.hint}>Detectando las lentes de la cámara {positionLabel}…</Text>
      </View>
    );
  }

  if (status === 'unsupported' || options.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Cámara y lente</Text>
        <Text style={styles.hint}>
          Este dispositivo no permite enumerar las lentes desde la app. Se usa la cámara{' '}
          {positionLabel} predeterminada del sistema.
        </Text>
        {facing === 'back' ? (
          <Text style={styles.note}>
            En Android esta selección no está disponible en la versión actual de la librería de
            cámara. La lente principal suele ser la que está junto al flash; si el LED queda lejos
            del dedo, ajusta la posición del teléfono.
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Cámara y lente</Text>
        <Text style={styles.count}>
          {options.length} {options.length === 1 ? 'lente' : 'lentes'}
        </Text>
      </View>

      <View style={styles.optionsRow}>
        {options.map((option) => {
          const selected = option.deviceType === selectedLens;
          return (
            <Pressable
              key={option.deviceType}
              accessibilityRole="button"
              accessibilityLabel={`Usar la lente ${option.label} de la cámara ${positionLabel}`}
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onSelect(option.deviceType)}
              style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                (disabled || pressed) && styles.optionPressed,
              ]}
            >
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                {option.label}
              </Text>
              {option.preferred ? <Text style={styles.badge}>junto al flash</Text> : null}
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.hint}>
        {selectedOption?.hint ??
          'Elige la lente que esté físicamente junto al flash para cubrirla con el dedo.'}
      </Text>

      {facing === 'back' && selectedOption && !selectedOption.preferred ? (
        <Text style={styles.note}>
          Para medir el pulso, la lente «Principal» suele ser la más cercana al flash. Si ves que
          el LED ilumina lejos del dedo, vuelve a «Principal».
        </Text>
      ) : null}

      {disabled ? (
        <Text style={styles.note}>No puedes cambiar de lente durante una medición.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    ...typography.secondary,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  count: {
    ...typography.small,
    color: palette.textSecondary,
    fontWeight: '600',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  option: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 2,
    minHeight: 40,
    justifyContent: 'center',
  },
  optionSelected: {
    borderColor: palette.accent,
    backgroundColor: 'rgba(53, 109, 120, 0.12)',
  },
  optionPressed: {
    opacity: 0.7,
  },
  optionLabel: {
    ...typography.secondary,
    fontWeight: '600',
    color: palette.textPrimary,
  },
  optionLabelSelected: {
    color: palette.accent,
  },
  badge: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.accent,
    textTransform: 'uppercase',
  },
  hint: {
    ...typography.small,
    color: palette.textSecondary,
  },
  note: {
    ...typography.small,
    color: palette.textSecondary,
    fontStyle: 'italic',
  },
});

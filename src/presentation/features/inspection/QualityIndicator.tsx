import { StyleSheet, Text, View } from 'react-native';
import type { QualityStatus } from '@/domain/camera-inspection/value-objects/quality-status';
import type { LightingCondition } from '@/domain/camera-inspection/value-objects/lighting-condition';
import { LIGHTING_CONDITION_LABELS_ES } from '@/domain/camera-inspection/value-objects/lighting-condition';
import { palette, radius, spacing, typography } from '@/presentation/theme/tokens';

export interface QualityIndicatorProps {
  status?: QualityStatus | null;
  lighting?: LightingCondition | null;
  motionScore?: number | null;
  blinkDetected?: boolean | null;
  reasons?: readonly string[];
}

export function QualityIndicator({
  status,
  lighting,
  motionScore,
  blinkDetected,
  reasons = [],
}: QualityIndicatorProps) {
  // Configuración de estado de calidad
  const statusConfig: Record<QualityStatus, { color: string; bg: string; text: string }> = {
    good: { color: '#256029', bg: '#EDF7ED', text: 'Calidad óptima' },
    acceptable: { color: '#1B5E20', bg: '#E8F5E9', text: 'Calidad aceptable' },
    limited: { color: palette.attention, bg: '#FFF8E1', text: 'Calidad limitada' },
    insufficient: { color: palette.priority, bg: '#FFEBEE', text: 'Captura insuficiente' },
    rejected: { color: palette.priority, bg: '#FFEBEE', text: 'Captura rechazada' },
  };

  const currentStatusConfig = status ? statusConfig[status] : null;

  // Movimiento
  const motionLabel =
    motionScore === null || motionScore === undefined
      ? 'Movimiento: no evaluado'
      : motionScore > 0.6
      ? 'Movimiento: alto (inestable)'
      : motionScore > 0.35
      ? 'Movimiento: moderado'
      : 'Movimiento: bajo (estable)';

  const motionColor =
    motionScore !== null && motionScore !== undefined && motionScore > 0.6
      ? palette.priority
      : palette.textPrimary;

  // Iluminación
  const lightingLabel = lighting
    ? `Iluminación: ${LIGHTING_CONDITION_LABELS_ES[lighting]}`
    : 'Iluminación: evaluando...';

  const lightingColor =
    lighting === 'adequate'
      ? palette.accent
      : lighting === 'low' || lighting === 'excessive' || lighting === 'direct_glare'
      ? palette.attention
      : palette.textPrimary;

  // Parpadeo
  const blinkLabel =
    blinkDetected === null || blinkDetected === undefined
      ? 'Parpadeo: no detectado'
      : blinkDetected
      ? 'Parpadeo: detectado (ojo cerrado)'
      : 'Parpadeo: no detectado';

  return (
    <View style={styles.container}>
      {/* Insignia de Calidad General */}
      {currentStatusConfig && (
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Estado de calidad: ${currentStatusConfig.text}`}
          style={[styles.statusBadge, { backgroundColor: currentStatusConfig.bg, borderColor: currentStatusConfig.color }]}
        >
          <Text style={[styles.statusBadgeText, { color: currentStatusConfig.color }]}>
            ● {currentStatusConfig.text}
          </Text>
        </View>
      )}

      {/* Indicadores complementarios texto + color */}
      <View style={styles.metricsRow}>
        <View style={styles.chip}>
          <Text style={[styles.chipText, { color: lightingColor }]}>{lightingLabel}</Text>
        </View>
        <View style={styles.chip}>
          <Text style={[styles.chipText, { color: motionColor }]}>{motionLabel}</Text>
        </View>
        <View style={styles.chip}>
          <Text
            style={[
              styles.chipText,
              { color: blinkDetected ? palette.attention : palette.textPrimary },
            ]}
          >
            {blinkLabel}
          </Text>
        </View>
      </View>

      {/* Motivos o advertencias de calidad */}
      {reasons.length > 0 && (
        <View style={styles.reasonsList}>
          {reasons.map((reason, idx) => (
            <Text key={idx} style={styles.reasonText}>
              ⚠ {reason}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusBadgeText: {
    ...typography.secondary,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    backgroundColor: 'rgba(23, 43, 58, 0.05)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  chipText: {
    ...typography.small,
    fontWeight: '600',
  },
  reasonsList: {
    gap: 2,
    marginTop: 2,
  },
  reasonText: {
    ...typography.small,
    color: palette.attention,
  },
});

import { StyleSheet, Text, View } from 'react-native';
import type { PupilEstimate } from '@/domain/camera-inspection/entities/pupil-estimate';
import type { QualityStatus } from '@/domain/camera-inspection/value-objects/quality-status';
import { cardStyle, palette, radius, spacing, typography } from '@/presentation/theme/tokens';

export interface RelativePupilCardProps {
  estimate: PupilEstimate | null;
  qualityStatus?: QualityStatus | null;
}

export function RelativePupilCard({ estimate, qualityStatus }: RelativePupilCardProps) {
  const hasEstimate = estimate !== null && estimate.relativeScale !== null;

  const confidenceLabel =
    estimate === null
      ? 'No disponible'
      : estimate.confidence >= 0.7
      ? 'Alta'
      : estimate.confidence >= 0.4
      ? 'Media'
      : 'Baja';

  return (
    <View style={[cardStyle, styles.card]}>
      <Text style={styles.title}>Resultado experimental</Text>

      {hasEstimate ? (
        <>
          <View style={styles.scaleContainer}>
            <Text style={styles.scaleLabel}>Escala relativa experimental:</Text>
            <Text style={styles.scaleValue}>
              {estimate.relativeScale?.toFixed(2).replace('.', ',')}
            </Text>
          </View>

          <View style={styles.detailsRow}>
            <Text style={styles.detailText}>
              Confianza: <Text style={styles.detailHighlight}>{confidenceLabel}</Text>
            </Text>
            <Text style={styles.detailText}>
              Método: <Text style={styles.detailHighlight}>{estimate.methodCode} ({estimate.methodVersion})</Text>
            </Text>
          </View>

          {/* Advertencia obligatoria cuando la calidad es limitada */}
          {estimate.qualityStatus === 'limited' && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                ⚠ Calidad limitada. La estimación puede ser poco confiable.
              </Text>
            </View>
          )}

          {/* Texto obligatorio persistente para estimación */}
          <Text style={styles.mandatoryNote}>
            Escala relativa experimental. No equivale a milímetros y no es válida para
            comparar entre personas. Válida solo para comparar capturas de la misma
            persona bajo condiciones equivalentes.
          </Text>

          {/* Limitaciones reportadas */}
          {estimate.limitations.length > 0 && (
            <View style={styles.limitationsContainer}>
              <Text style={styles.limitationsTitle}>Limitaciones del cálculo:</Text>
              {estimate.limitations.map((lim, idx) => (
                <Text key={idx} style={styles.limitationItem}>
                  • {lim}
                </Text>
              ))}
            </View>
          )}
        </>
      ) : (
        <View style={styles.noEstimateBox}>
          {qualityStatus === 'insufficient' || qualityStatus === 'rejected' ? (
            <Text style={styles.insufficientText}>
              Captura insuficiente. No se generó estimación.
            </Text>
          ) : (
            <Text style={styles.noEstimateText}>
              Estimación no disponible. La documentación manual sigue disponible.
            </Text>
          )}

          {estimate && estimate.limitations.length > 0 && (
            <View style={styles.limitationsContainer}>
              {estimate.limitations.map((lim, idx) => (
                <Text key={idx} style={styles.limitationItem}>
                  • {lim}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  title: {
    ...typography.subtitle,
    color: palette.textPrimary,
  },
  scaleContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(53, 109, 120, 0.08)',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  scaleLabel: {
    ...typography.body,
    fontWeight: '600',
    color: palette.textPrimary,
  },
  scaleValue: {
    fontSize: 32,
    fontWeight: '800',
    color: palette.accent,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  detailText: {
    ...typography.small,
    color: palette.textSecondary,
  },
  detailHighlight: {
    fontWeight: '600',
    color: palette.textPrimary,
  },
  warningBox: {
    backgroundColor: '#FFF8E1',
    borderColor: palette.attention,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  warningText: {
    ...typography.small,
    color: palette.attention,
    fontWeight: '600',
  },
  mandatoryNote: {
    ...typography.small,
    color: palette.textSecondary,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  limitationsContainer: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    gap: 2,
  },
  limitationsTitle: {
    ...typography.small,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  limitationItem: {
    ...typography.small,
    color: palette.textSecondary,
  },
  noEstimateBox: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  insufficientText: {
    ...typography.body,
    color: palette.priority,
    fontWeight: '600',
  },
  noEstimateText: {
    ...typography.body,
    color: palette.textSecondary,
  },
});

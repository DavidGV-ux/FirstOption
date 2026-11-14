import { StyleSheet, Text, View } from 'react-native';
import type { InspectionComparison } from '@/domain/camera-inspection/entities/inspection-comparison';
import { COMPARISON_DIRECTION_LABELS_ES } from '@/domain/camera-inspection/entities/inspection-comparison';
import type { InspectionRecord } from '@/domain/camera-inspection/ports/inspection-repository-port';
import { cardStyle, palette, radius, spacing, typography } from '@/presentation/theme/tokens';

export interface InspectionHistoryCardProps {
  comparison: InspectionComparison | null;
  recentInspections?: readonly InspectionRecord[];
}

export function InspectionHistoryCard({
  comparison,
  recentInspections = [],
}: InspectionHistoryCardProps) {
  if (!comparison && recentInspections.length === 0) {
    return null;
  }

  return (
    <View style={[cardStyle, styles.card]}>
      {/* Sección de Comparación */}
      {comparison && (
        <View style={styles.comparisonSection}>
          <Text style={styles.title}>Comparación con captura anterior</Text>

          {comparison.comparable ? (
            <>
              <View style={styles.comparisonBox}>
                <Text style={styles.directionText}>
                  {COMPARISON_DIRECTION_LABELS_ES[comparison.direction]}
                </Text>
                {comparison.relativeChange !== null && (
                  <Text style={styles.percentText}>
                    {comparison.relativeChange > 0 ? `+${comparison.relativeChange}%` : `${comparison.relativeChange}%`}
                  </Text>
                )}
              </View>

              <Text style={styles.confidenceText}>
                Confianza de la comparación: {Math.round(comparison.confidence * 100)}%
              </Text>
            </>
          ) : (
            <View style={styles.inconclusiveBox}>
              <Text style={styles.inconclusiveTitle}>
                Comparación no concluyente
              </Text>
              <Text style={styles.inconclusiveBody}>
                La comparación no es concluyente debido a diferencias de calidad, iluminación o ángulo.
              </Text>
            </View>
          )}

          {comparison.limitations.length > 0 && (
            <View style={styles.limitationsBox}>
              {comparison.limitations.map((lim, idx) => (
                <Text key={idx} style={styles.limitationItem}>
                  • {lim}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Lista de capturas recientes */}
      {recentInspections.length > 0 && (
        <View style={styles.historySection}>
          <Text style={styles.subtitle}>Historial reciente de inspecciones</Text>
          {recentInspections.slice(0, 3).map((rec) => {
            const dateStr = new Date(rec.capture.capturedAt).toLocaleString('es-ES', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });
            const eyeLabel = rec.capture.eyeSide === 'left' ? 'Ojo izq.' : 'Ojo der.';
            const scaleStr = rec.estimate?.relativeScale
              ? `Escala: ${rec.estimate.relativeScale.toFixed(2).replace('.', ',')}`
              : 'Sin estimación';

            return (
              <View key={rec.capture.captureId} style={styles.historyRow}>
                <Text style={styles.historyDate}>{dateStr}</Text>
                <Text style={styles.historyEye}>{eyeLabel}</Text>
                <Text style={styles.historyScale}>{scaleStr}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.md,
  },
  comparisonSection: {
    gap: spacing.xs,
  },
  title: {
    ...typography.subtitle,
    color: palette.textPrimary,
  },
  subtitle: {
    ...typography.body,
    fontWeight: '700',
    color: palette.textPrimary,
    marginBottom: spacing.xs,
  },
  comparisonBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(53, 109, 120, 0.08)',
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  directionText: {
    ...typography.body,
    fontWeight: '600',
    color: palette.textPrimary,
    flex: 1,
  },
  percentText: {
    fontSize: 20,
    fontWeight: '800',
    color: palette.accent,
    marginLeft: spacing.sm,
  },
  confidenceText: {
    ...typography.small,
    color: palette.textSecondary,
  },
  inconclusiveBox: {
    backgroundColor: '#FFF8E1',
    borderColor: palette.attention,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2,
  },
  inconclusiveTitle: {
    ...typography.body,
    color: palette.attention,
    fontWeight: '700',
  },
  inconclusiveBody: {
    ...typography.small,
    color: '#664D03',
  },
  limitationsBox: {
    marginTop: spacing.xs,
    gap: 2,
  },
  limitationItem: {
    ...typography.small,
    color: palette.textSecondary,
  },
  historySection: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(216, 225, 229, 0.5)',
  },
  historyDate: {
    ...typography.small,
    color: palette.textSecondary,
    flex: 2,
  },
  historyEye: {
    ...typography.small,
    fontWeight: '600',
    color: palette.textPrimary,
    flex: 1,
  },
  historyScale: {
    ...typography.small,
    fontWeight: '700',
    color: palette.accent,
    textAlign: 'right',
    flex: 2,
  },
});

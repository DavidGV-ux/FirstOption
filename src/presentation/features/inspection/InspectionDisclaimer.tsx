import { StyleSheet, Text, View } from 'react-native';
import { cardStyle, palette, radius, spacing, typography } from '@/presentation/theme/tokens';

export function InspectionDisclaimer() {
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel="Aviso importante: Función experimental. La cámara permite una aproximación relativa. No constituye una medición clínica validada ni un diagnóstico."
      style={[cardStyle, styles.card]}
    >
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Función experimental</Text>
      </View>
      <Text style={styles.disclaimerText}>
        Función experimental. La cámara permite una aproximación relativa.
        No constituye una medición clínica validada ni un diagnóstico.
      </Text>
      <Text style={styles.subText}>
        No usar como sustituto de una evaluación médica, oftalmológica ni neurológica.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FAF5EE',
    borderColor: '#E6D3B3',
    gap: spacing.xs,
    padding: spacing.md,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: palette.attention,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    ...typography.small,
    color: '#FFFFFF',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  disclaimerText: {
    ...typography.body,
    color: '#5C3B0D',
    fontWeight: '600',
    lineHeight: 20,
  },
  subText: {
    ...typography.small,
    color: '#7A5217',
  },
});

import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography } from '@/presentation/theme/tokens';

export function CaptureGuide() {
  return (
    <View pointerEvents="none" style={styles.overlay}>
      {/* Guía central para el ojo */}
      <View style={styles.reticleContainer}>
        <View style={styles.reticleOuter}>
          <View style={styles.reticleInner} />
        </View>
        <Text style={styles.reticleLabel}>◯ Ubica el ojo en este círculo</Text>
      </View>

      {/* Instrucciones breves y sobrias */}
      <View style={styles.guideCard}>
        <Text style={styles.guideTitle}>Guía de captura</Text>
        <Text style={styles.guideStep}>• Mantén el ojo abierto y centrado dentro de la guía.</Text>
        <Text style={styles.guideStep}>• Sostén el dispositivo quieto (aprox. 25-30 cm).</Text>
        <Text style={styles.guideStep}>• Evita luz directa o linternas apuntando al ojo.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  reticleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleOuter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  reticleInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  reticleLabel: {
    ...typography.secondary,
    color: '#FFFFFF',
    fontWeight: '600',
    marginTop: spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  guideCard: {
    backgroundColor: 'rgba(23, 43, 58, 0.88)',
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 2,
  },
  guideTitle: {
    ...typography.small,
    color: '#E1EBF0',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  guideStep: {
    ...typography.small,
    color: '#FFFFFF',
    lineHeight: 18,
  },
});

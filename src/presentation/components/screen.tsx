import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { palette, radius, spacing, typography } from '@/presentation/theme/tokens';

/** Contenedor de pantalla con una sola acción principal y encabezado. */
export function Screen({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title} maxFontSizeMultiplier={1.4}>
            {title}
          </Text>
          {subtitle !== undefined && (
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.4}>
              {subtitle}
            </Text>
          )}
        </View>
        {children}
      </ScrollView>
      {footer}
    </KeyboardAvoidingView>
  );
}

/** Botón de acción principal: uno por pantalla, etiqueta explícita. */
export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={busy ? `${label} (guardando)` : label}
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(busy) }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        !inactive && pressed && styles.buttonPressed,
        inactive && styles.buttonDisabled,
      ]}
    >
      <Text style={[styles.buttonLabel, inactive && styles.buttonLabelDisabled]}>
        {busy ? 'Guardando…' : label}
      </Text>
    </Pressable>
  );
}

/** Estado vacío honesto: sin números inventados ni promesas. */
export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <View
      accessibilityRole="text"
      style={styles.empty}
      accessible
      accessibilityLabel={`${title}. ${description ?? ''}`}
    >
      <Text style={styles.emptyTitle}>{title}</Text>
      {description !== undefined && <Text style={styles.emptyDescription}>{description}</Text>}
    </View>
  );
}

/** Chip de estado con etiqueta textual (no depende solo del color). */
export function StatusChip({ label, tone }: { label: string; tone: 'neutral' | 'attention' }) {
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.chip, tone === 'attention' && styles.chipAttention]}
    >
      <Text style={[styles.chipText, tone === 'attention' && styles.chipTextAttention]}>
        {label}
      </Text>
    </View>
  );
}

/** Mensaje de error recuperable para formularios. */
export function FormError({ message }: { message: string }) {
  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  header: { gap: spacing.xs, marginBottom: spacing.sm },
  title: { ...typography.title, color: palette.textPrimary },
  subtitle: { ...typography.body, color: palette.textSecondary },
  button: {
    backgroundColor: palette.accent,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { backgroundColor: palette.border },
  buttonLabel: {
    ...typography.body,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  buttonLabelDisabled: { color: palette.textSecondary },
  empty: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: { ...typography.subtitle, color: palette.textPrimary },
  emptyDescription: { ...typography.secondary, color: palette.textSecondary },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  chipAttention: { borderColor: palette.attention, backgroundColor: `${palette.attention}14` },
  chipText: { ...typography.small, color: palette.textSecondary },
  chipTextAttention: { color: palette.attention, fontWeight: '600' },
  errorBox: {
    backgroundColor: `${palette.priority}14`,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.priority,
    padding: spacing.sm,
  },
  errorText: { ...typography.secondary, color: palette.priority, fontWeight: '600' },
});

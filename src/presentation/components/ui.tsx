import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { palette, radius, spacing, typography } from '@/presentation/theme/tokens';

/** Superficie con título, contenido y acciones. */
export function Card({
  title,
  children,
  style,
}: {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: palette.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: palette.border,
          padding: spacing.md,
          gap: spacing.sm,
        },
        style,
      ]}
    >
      {title !== undefined && (
        <Text style={{ ...typography.cardTitle, color: palette.textPrimary }}>
          {title}
        </Text>
      )}
      {children}
    </View>
  );
}

/** Acción secundaria (borde, sin fondo). */
export function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 44,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: palette.accent,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? palette.accentSoft : 'transparent',
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text style={{ ...typography.secondary, color: palette.accent, fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Acción primaria (fondo azul, texto blanco). */
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 44,
          borderRadius: 14,
          backgroundColor: palette.accent,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: (disabled || busy) ? 0.5 : pressed ? 0.9 : 1,
        },
      ]}
    >
      <Text style={{ ...typography.secondary, color: '#FFFFFF', fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Campo con etiqueta, ayuda y error. */
export function Field({
  label,
  help,
  error,
  children,
}: {
  label: string;
  help?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ ...typography.secondary, color: palette.textPrimary, fontWeight: '600' }}>
        {label}
      </Text>
      {children}
      {help !== undefined && (
        <Text style={{ ...typography.small, color: palette.textSecondary }}>{help}</Text>
      )}
      {error !== undefined && (
        <Text style={{ ...typography.small, color: palette.priority, fontWeight: '600' }}>
          {error}
        </Text>
      )}
    </View>
  );
}

/** Escala de opciones rápidas (chips). */
export function ChoiceChips<T extends string | number>({
  options,
  value,
  onChange,
  columns,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  columns?: number;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
      }}
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={String(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={opt.label}
            onPress={() => onChange(opt.value)}
            style={{
              minHeight: 44,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: selected ? palette.accent : palette.border,
              backgroundColor: selected ? palette.accentSoft : palette.surfaceAlt,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                ...typography.secondary,
                color: selected ? palette.accent : palette.textPrimary,
                fontWeight: selected ? '600' : '400',
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Insignia de estado (pendiente, sincronizado, experimental, no concluyente). */
export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'neutral' | 'attention' | 'priority' | 'success' | 'experimental';
}) {
  const color =
    tone === 'priority'
      ? palette.priority
      : tone === 'attention'
        ? palette.attention
        : tone === 'success'
          ? palette.success
          : tone === 'experimental'
            ? palette.accent
            : palette.textSecondary;
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        alignSelf: 'flex-start',
        borderRadius: 999,
        borderWidth: 1,
        borderColor: color,
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
        backgroundColor: `${color}22`,
      }}
    >
      <Text style={{ ...typography.small, color, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

/** Encabezado de sección. */
export function SectionHeader({ title }: { title: string }) {
  return (
    <Text
      style={{
        ...typography.cardTitle,
        color: palette.textPrimary,
        marginTop: spacing.sm,
      }}
    >
      {title}
    </Text>
  );
}

/** Banner persistente de modo sin conexión. */
export function OfflineBanner() {
  return (
    <View
      accessible
      accessibilityRole="alert"
      style={{
        backgroundColor: 'rgba(255,181,71,0.10)',
        borderBottomWidth: 1,
        borderBottomColor: palette.attention,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={{ ...typography.secondary, color: palette.attention, fontWeight: '600' }}>
        Sin conexión: los registros se guardan en este dispositivo y se sincronizarán al recuperar la red.
      </Text>
    </View>
  );
}

/** Tarjeta de estado de sincronización. */
export function SyncStatusCard({
  pending,
  message,
  onSync,
  onSignIn,
  signedIn,
  configured,
}: {
  pending: number;
  message: string | null;
  onSync: () => void;
  onSignIn: () => void;
  signedIn: boolean;
  configured: boolean;
}) {
  return (
    <Card title="Sincronización">
      <Text style={{ ...typography.body, color: palette.textSecondary }}>
        {pending > 0
          ? `${pending} registro(s) pendientes de sincronizar.`
          : 'Sin registros pendientes de sincronizar.'}
      </Text>
      {configured ? (
        signedIn ? (
          <PrimaryButton
            label="Sincronizar ahora"
            onPress={onSync}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Iniciar sesión para sincronizar"
            onPress={onSignIn}
            style={({ pressed }) => ({
              minHeight: 44,
              alignSelf: 'flex-start',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: palette.accent,
              backgroundColor: pressed ? palette.accentSoft : 'transparent',
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              justifyContent: 'center',
            })}
          >
            <Text style={{ ...typography.secondary, color: palette.accent, fontWeight: '700' }}>
              Iniciar sesión para sincronizar
            </Text>
          </Pressable>
        )
      ) : (
        <Text style={{ ...typography.small, color: palette.textSecondary }}>
          Sincronización no configurada en esta compilación.
        </Text>
      )}
      {message !== null && (
        <Text style={{ ...typography.small, color: palette.textSecondary }}>{message}</Text>
      )}
    </Card>
  );
}

import type { TextStyle, ViewStyle } from 'react-native';

/**
 * Tokens de diseño (Incremento 1). Estilo sobrio, sin decoración
 * espacial. Contraste verificado en docs/evidence.md.
 */
export const palette = {
  background: '#F5F7F8',
  surface: '#FFFFFF',
  textPrimary: '#172B3A',
  textSecondary: '#526371',
  accent: '#356D78',
  accentOnSurface: '#FFFFFF',
  border: '#D8E1E5',
  attention: '#8A5A17',
  priority: '#A3343A',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = { sm: 6, md: 10, lg: 14 } as const;

export const typography = {
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' } satisfies TextStyle,
  subtitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' } satisfies TextStyle,
  body: { fontSize: 16, lineHeight: 22 } satisfies TextStyle,
  secondary: { fontSize: 14, lineHeight: 19 } satisfies TextStyle,
  small: { fontSize: 13, lineHeight: 17 } satisfies TextStyle,
} as const;

export const screenStyle: ViewStyle = {
  flex: 1,
  backgroundColor: palette.background,
};

export const cardStyle: ViewStyle = {
  backgroundColor: palette.surface,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: palette.border,
  padding: spacing.md,
};

export type Palette = typeof palette;

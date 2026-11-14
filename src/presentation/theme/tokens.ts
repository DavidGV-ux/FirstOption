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
  success: '#2F6F4E',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radius = { sm: 12, md: 16, lg: 20 } as const;

export const typography = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' } satisfies TextStyle,
  cardTitle: { fontSize: 18, lineHeight: 24, fontWeight: '600' } satisfies TextStyle,
  subtitle: { fontSize: 18, lineHeight: 24, fontWeight: '600' } satisfies TextStyle,
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' } satisfies TextStyle,
  secondary: { fontSize: 14, lineHeight: 20, fontWeight: '400' } satisfies TextStyle,
  small: { fontSize: 12, lineHeight: 16, fontWeight: '600' } satisfies TextStyle,
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

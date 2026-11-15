import type { TextStyle, ViewStyle } from 'react-native';

/**
 * Tokens de diseño — estética firstOption (redesign dark).
 * Colores extraídos de firstoption_redesign.html.
 */
export const palette = {
  background: '#101114',
  surface: '#1B1C20',
  surfaceAlt: '#22242A',
  surface3: '#292C33',
  textPrimary: '#F5F5F7',
  textSecondary: '#989BA5',
  accent: '#0A84FF',
  accentSoft: 'rgba(10,132,255,0.12)',
  accentOnSurface: '#FFFFFF',
  border: 'rgba(255,255,255,0.075)',
  attention: '#FFB547',
  priority: '#FFB547',
  success: '#30D158',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radius = { sm: 12, md: 18, lg: 22, xl: 26 } as const;

export const typography = {
  title: { fontSize: 29, lineHeight: 34, fontWeight: '700' } satisfies TextStyle,
  cardTitle: { fontSize: 19, lineHeight: 24, fontWeight: '600' } satisfies TextStyle,
  subtitle: { fontSize: 16, lineHeight: 22, fontWeight: '600' } satisfies TextStyle,
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400' } satisfies TextStyle,
  secondary: { fontSize: 13, lineHeight: 18, fontWeight: '400' } satisfies TextStyle,
  small: { fontSize: 11, lineHeight: 15, fontWeight: '600' } satisfies TextStyle,
} as const;

export const screenStyle: ViewStyle = {
  flex: 1,
  backgroundColor: palette.background,
};

export const cardStyle: ViewStyle = {
  backgroundColor: palette.surface,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: palette.border,
  padding: spacing.md,
};

export type Palette = typeof palette;

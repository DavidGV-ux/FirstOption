import type { TextStyle, ViewStyle } from 'react-native';

/**
 * Tokens de diseño — estética firstOption (oscura, médica/bienestar).
 */
export const palette = {
  background: '#101318',
  surface: '#191E26',
  surfaceAlt: '#202631',
  textPrimary: '#F4F6F8',
  textSecondary: '#9BA5B3',
  accent: '#4B91F1',
  accentSoft: 'rgba(75,145,241,0.14)',
  accentOnSurface: '#071321',
  border: 'rgba(255,255,255,0.08)',
  attention: '#F0B84B',
  priority: '#E87979',
  success: '#45C58A',
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
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' } satisfies TextStyle,
  subtitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' } satisfies TextStyle,
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

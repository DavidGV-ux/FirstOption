/**
 * Condiciones de iluminación detectadas o reportadas en la captura.
 */
export const LIGHTING_CONDITIONS = [
  'low',
  'adequate',
  'excessive',
  'direct_glare',
] as const;

export type LightingCondition = (typeof LIGHTING_CONDITIONS)[number];

export const LIGHTING_CONDITION_LABELS_ES: Record<LightingCondition, string> = {
  low: 'Poca luz',
  adequate: 'Iluminación adecuada',
  excessive: 'Luz excesiva',
  direct_glare: 'Reflejo o luz directa en el ojo',
};

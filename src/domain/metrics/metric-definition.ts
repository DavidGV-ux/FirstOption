import { z } from 'zod';

/**
 * Categorías de métrica. Mantener la lista cerrada y explícita;
 * nuevas categorías requieren una nueva versión del catálogo.
 */
export const METRIC_CATEGORIES = [
  'daily_self_report',
  'symptom',
  'vital',
  'hematology',
] as const;

export type MetricCategory = (typeof METRIC_CATEGORIES)[number];

/**
 * Tipos de valor admitidos. Las escalas ordinales (p. ej. ánimo 1–5)
 * son autorreporte, no instrumentos clínicos validados; esto se
 * comunica en la UI y en la documentación.
 */
export const METRIC_VALUE_TYPES = [
  'ordinal_scale',
  'integer',
  'decimal',
  'boolean',
] as const;

export type MetricValueType = (typeof METRIC_VALUE_TYPES)[number];

/**
 * Definición de una métrica medible. Toda observación debe referenciar
 * una métrica del catálogo: no se aceptan métricas ad hoc en la UI.
 */
export interface MetricDefinition {
  metricId: string;
  nameEs: string;
  shortNameEs?: string;
  category: MetricCategory;
  valueType: MetricValueType;
  /** Unidad canónica; null para escalas ordinales y booleanos. */
  canonicalUnit: string | null;
  /** Límites de escala para ordinales (inclusive). */
  scaleMin?: number;
  scaleMax?: number;
  /**
   * Límites de plausibleza para valores numéricos. No son umbrales
   * clínicos ni de alerta: solo marcan calidad de datos sospechosa.
   */
  plausibleMin?: number;
  plausibleMax?: number;
  /** Precisión máxima de captura en decimales. */
  maxDecimals?: number;
  definitionVersion: number;
}

/**
 * Esquema del catálogo: cada fila debe ser internamente coherente.
 * Este esquema valida el catálogo sembrado en la base de datos.
 */
export const metricDefinitionSchema = z
  .object({
    metricId: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, 'metricId snake_case'),
    nameEs: z.string().min(1),
    shortNameEs: z.string().min(1).optional(),
    category: z.enum(METRIC_CATEGORIES),
    valueType: z.enum(METRIC_VALUE_TYPES),
    canonicalUnit: z.string().min(1).nullable(),
    scaleMin: z.number().int().optional(),
    scaleMax: z.number().int().optional(),
    plausibleMin: z.number().optional(),
    plausibleMax: z.number().optional(),
    maxDecimals: z.number().int().min(0).max(4).optional(),
    definitionVersion: z.number().int().min(1),
  })
  .superRefine((def, ctx) => {
    const ordinal = def.valueType === 'ordinal_scale';
    if (ordinal && (def.scaleMin === undefined || def.scaleMax === undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Las escalas ordinales requieren scaleMin y scaleMax',
        path: ['scaleMin'],
      });
    }
    if ((def.valueType === 'integer' || def.valueType === 'decimal') && def.canonicalUnit === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Las métricas numéricas requieren unidad canónica',
        path: ['canonicalUnit'],
      });
    }
    if (ordinal && def.canonicalUnit !== null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Las escalas ordinales no tienen unidad',
        path: ['canonicalUnit'],
      });
    }
    if (def.valueType === 'boolean' && def.canonicalUnit !== null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Los síntomas booleanos no tienen unidad',
        path: ['canonicalUnit'],
      });
    }
    if (
      def.plausibleMin !== undefined &&
      def.plausibleMax !== undefined &&
      def.plausibleMin >= def.plausibleMax
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'plausibleMin debe ser menor que plausibleMax',
        path: ['plausibleMin'],
      });
    }
  });

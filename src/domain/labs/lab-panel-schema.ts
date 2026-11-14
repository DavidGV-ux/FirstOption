import { z } from 'zod';
import { METRIC_CATALOG_V1, getMetricDefinition } from '@/domain/metrics/catalog-v1';
import { listUnitsForMetric } from '@/domain/units/unit-conversion';
import { ValidationError } from '@/domain/shared/validation-error';

/** Máximo de resultados por panel (previene capturas descontroladas). */
export const LAB_PANEL_RESULT_MAX = 30;

/** Métricas admitidas en paneles de laboratorio (catálogo de hematología). */
export const LAB_METRIC_IDS: readonly string[] = METRIC_CATALOG_V1.filter(
  (m) => m.category === 'hematology',
).map((m) => m.metricId);

export const LAB_METRIC_IDS_SET: ReadonlySet<string> = new Set(LAB_METRIC_IDS);

const missionPhaseSchema = z.enum(['preflight', 'inflight', 'postflight'], {
  message: 'Selecciona la fase de la misión',
});

const optionalIsoDate = z
  .string()
  .min(1, 'Fecha o momento requerido')
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Fecha inválida' })
  .nullable();

/**
 * Una medida de laboratorio dentro del panel. Numérica, con unidad
 * verificable y procedencia explícita.
 */
export const labResultInputSchema = z
  .object({
    metricId: z.string().min(1, 'Selecciona la medida'),
    value: z
      .number({ message: 'Ingresa el valor de la medida' })
      .finite('Ingresa el valor de la medida'),
    unit: z.string().min(1, 'Selecciona la unidad de la medida'),
  })
  .superRefine((result, ctx) => {
    const def = getMetricDefinition(result.metricId);
    if (def === undefined) {
      ctx.addIssue({ code: 'custom', message: 'La medida no pertenece al catálogo del prototipo' });
      return;
    }
    if (def.category !== 'hematology') {
      ctx.addIssue({
        code: 'custom',
        message: 'El prototipo solo registra medidas de laboratorio del catálogo de hematología',
        path: ['metricId'],
      });
      return;
    }
    if (def.valueType !== 'decimal') {
      ctx.addIssue({ code: 'custom', message: 'La medida de laboratorio debe ser numérica', path: ['value'] });
      return;
    }
    const units = listUnitsForMetric(result.metricId).map((u) => u.unit);
    const clean = result.unit.trim();
    const admitted = units.some((u) => u.toLowerCase() === clean.toLowerCase());
    if (!admitted) {
      ctx.addIssue({
        code: 'custom',
        message: `Unidad no soportada para ${def.shortNameEs ?? def.metricId}`,
        path: ['unit'],
      });
      return;
    }
    const decimals = def.maxDecimals ?? 2;
    const fractional = String(result.value).split('.')[1];
    const decimalsUsed = fractional ? fractional.length : 0;
    if (decimalsUsed > decimals) {
      ctx.addIssue({
        code: 'custom',
        message: `${def.nameEs} admite hasta ${decimals} decimal(es)`,
        path: ['value'],
      });
    }
  });

export type LabResultInput = z.infer<typeof labResultInputSchema>;

/**
 * Panel de laboratorio: una toma de análisis con sus medidas y la
 * muestra/documento asociado. Es una captura diferida al registro
 * diario (los signos vitales los sigue haciendo el registro diario).
 */
export const labPanelInputSchema = z
  .object({
    collectedAt: z
      .string()
      .min(1, 'Ingresa la fecha del análisis')
      .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Fecha inválida' }),
    reportedAt: optionalIsoDate,
    missionPhase: missionPhaseSchema,
    laboratory: z.string().max(200).nullable().optional(),
    sampleId: z.string().max(64).nullable().optional(),
    method: z.string().max(200).nullable().optional(),
    referenceIntervalOriginal: z.number().nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
    results: z.array(labResultInputSchema).min(1, 'Registra al menos una medida'),
  })
  .superRefine((panel, ctx) => {
    if (panel.results.length > LAB_PANEL_RESULT_MAX) {
      ctx.addIssue({ code: 'custom', message: `Un panel admite hasta ${LAB_PANEL_RESULT_MAX} medidas` });
    }
  });

export type LabPanelInput = z.infer<typeof labPanelInputSchema>;

/** Errores en español por campo para la UI del laboratorio. */
export function parseLabPanelInput(raw: unknown): LabPanelInput {
  const result = labPanelInputSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || '_panel';
    if (!fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  throw new ValidationError(fieldErrors);
}

import { getMetricDefinition } from '@/domain/metrics/catalog-v1';
import type { MetricDefinition } from '@/domain/metrics/metric-definition';

/**
 * Conversión de unidades verificada (Incremento 3).
 *
 * Reglas no arbitrarias: cada factor debe declararse con su versión,
 * origen y si es exacto. Una conversión no verificada NUNCA se aplica:
 * la observación se conserva en la unidad original y el análisis queda
 * sin valor normalizado (estado honesto, sin inferencias).
 */

export type ConversionState =
  | { state: 'same_unit'; value: number; canonicalUnit: string }
  | {
      state: 'converted';
      value: number;
      canonicalUnit: string;
      conversionId: string;
      conversionVersion: number;
      factor: number;
      source: string;
      exact: boolean;
    }
  | { state: 'unsupported'; reason: string }
  | { state: 'invalid'; reason: string };

export interface ConversionRule {
  conversionId: string;
  version: number;
  metricId: string;
  fromUnit: string;
  toUnit: string;
  /** Multiplicador (o factor con offset). 1 = equivalente. */
  factor: number;
  offset?: number;
  source: string;
  exact: boolean;
}

/**
 * Reglas de conversión conocidas y verificadas (versión del método).
 * Las unidades canónicas de cada métrica del catálogo NO requieren regla.
 */
export const UNIT_CONVERSIONS_V1: readonly ConversionRule[] = [
  {
    conversionId: 'hgb.g_dl_to_g_l',
    version: 1,
    metricId: 'hemoglobin',
    fromUnit: 'g/dL',
    toUnit: 'g/L',
    factor: 10,
    source: 'Ecuación de unidades basada en masa de hemoglobina (exacto a nivel de concentración)',
    exact: true,
  },
  {
    conversionId: 'hematocrit.l_l_to_pct',
    version: 1,
    metricId: 'hematocrit',
    fromUnit: 'L/L',
    toUnit: '%',
    factor: 100,
    source: 'Definición de porcentaje (exacto)',
    exact: true,
  },
  {
    conversionId: 'rbc.1e6_ul_to_1e12_l',
    version: 1,
    metricId: 'rbc_count',
    fromUnit: '10⁶/µL',
    toUnit: '10¹²/L',
    factor: 1,
    source: 'Unidades derivadas equivalentes (exacto)',
    exact: true,
  },
  {
    conversionId: 'mcv.um3_to_fl',
    version: 1,
    metricId: 'mcv',
    fromUnit: 'µm³',
    toUnit: 'fL',
    factor: 1,
    source: 'Unidades derivadas equivalentes (exacto)',
    exact: true,
  },
  {
    conversionId: 'retic.prop_to_pct',
    version: 1,
    metricId: 'reticulocyte_pct',
    fromUnit: 'proportion',
    toUnit: '%',
    factor: 100,
    source: 'Definición de proporción/porcentaje (exacto)',
    exact: true,
  },
  {
    conversionId: 'retic.1e3_ul_to_1e9_l',
    version: 1,
    metricId: 'reticulocyte_absolute',
    fromUnit: '10³/µL',
    toUnit: '10⁹/L',
    factor: 1,
    source: 'Unidades derivadas equivalentes (exacto)',
    exact: true,
  },
  {
    conversionId: 'ferritin.ng_ml_to_ug_l',
    version: 1,
    metricId: 'ferritin',
    fromUnit: 'ng/mL',
    toUnit: 'µg/L',
    factor: 1,
    source: 'Ecuación de unidades (1 ng/mL = 1 µg/L, exacto)',
    exact: true,
  },
  {
    conversionId: 'tsat.fraction_to_pct',
    version: 1,
    metricId: 'transferrin_saturation',
    fromUnit: 'fraction',
    toUnit: '%',
    factor: 100,
    source: 'Definición de porcentaje (exacto)',
    exact: true,
  },
  {
    conversionId: 'bili.mg_dl_to_umol_l',
    version: 1,
    metricId: 'bilirubin_total',
    fromUnit: 'mg/dL',
    toUnit: 'µmol/L',
    factor: 17.104,
    source: 'Masa molar de la bilirrubina (584.66 g/mol) — factor aproximado',
    exact: false,
  },
  {
    conversionId: 'bili.mg_dl_to_umol_l_direct',
    version: 1,
    metricId: 'bilirubin_direct',
    fromUnit: 'mg/dL',
    toUnit: 'µmol/L',
    factor: 17.104,
    source: 'Masa molar de la bilirrubina directa (584.66 g/mol) — factor aproximado',
    exact: false,
  },
  {
    conversionId: 'haptoglobin.g_dl_to_g_l',
    version: 1,
    metricId: 'haptoglobin',
    fromUnit: 'g/dL',
    toUnit: 'g/L',
    factor: 10,
    source: 'Ecuación de unidades basada en masa de hemoglobina (exacto a nivel de concentración)',
    exact: true,
  },
  {
    conversionId: 'haptoglobin.mg_dl_to_g_l',
    version: 1,
    metricId: 'haptoglobin',
    fromUnit: 'mg/dL',
    toUnit: 'g/L',
    factor: 0.01,
    source: 'Ecuación de unidades (1 mg/dL = 0.01 g/L, exacto)',
    exact: true,
  },
];

const conversionCache = new Map<string, ConversionRule[]>();

function rulesFor(metricId: string): readonly ConversionRule[] {
  const cached = conversionCache.get(metricId);
  if (cached !== undefined) {
    return cached;
  }
  const rules = UNIT_CONVERSIONS_V1.filter((r) => r.metricId === metricId);
  conversionCache.set(metricId, rules);
  return rules;
}

/** Versión vigente de un par (métrica, unidad) para trazabilidad. */
export function latestConversion(metricId: string, fromUnit: string): ConversionRule | undefined {
  const rules = rulesFor(metricId);
  return [...rules].sort((a, b) => b.version - a.version)[0];
}

/**
 * Convierte un valor a la unidad canónica de una métrica. La unidad
 * canónica del catálogo ya es el destino (no requiere regla).
 */
export function convertToCanonical(
  metricId: string,
  value: number,
  unit: string | null,
): ConversionState {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
  if (Number.isNaN(numeric)) {
    return { state: 'invalid', reason: 'El valor debe ser un número finito.' };
  }
  if (unit === null || unit.trim().length === 0) {
    return { state: 'unsupported', reason: 'Falta la unidad de la medición.' };
  }
  const cleanUnit = unit.trim();
  const def: MetricDefinition | undefined = getMetricDefinition(metricId);
  const canonicalUnit = def?.canonicalUnit ?? null;
  if (canonicalUnit === null) {
    return { state: 'unsupported', reason: `No existe una unidad canónica publicada para ${metricId}.` };
  }
  const rules = rulesFor(metricId);
  const normalizedLookup = cleanUnit.toLowerCase();
  if (normalizedLookup === canonicalUnit.toLowerCase()) {
    return { state: 'same_unit', value: numeric, canonicalUnit };
  }
  const rule = rules[0];
  if (rule === undefined) {
    // Sin conversión registrada para esta métrica/unidad: nunca se infiere.
    return {
      state: 'unsupported',
      reason: `No hay método de conversión versionado para ${metricId} (${cleanUnit}).`,
    };
  }
  const valueConverted = numeric * rule.factor + (rule.offset ?? 0);
  if (!Number.isFinite(valueConverted)) {
    return { state: 'invalid', reason: 'La conversión resultó en un valor no válido.' };
  }
  return {
    state: 'converted',
    value: valueConverted,
    canonicalUnit,
    conversionId: rule.conversionId,
    conversionVersion: rule.version,
    factor: rule.factor,
    source: rule.source,
    exact: rule.exact,
  };
}

/** Versión vigente de un par (métrica, unidad) para trazabilidad. */
export function latestConversionFor(metricId: string, fromUnit: string): ConversionRule | undefined {
  const rules = rulesFor(metricId);
  const cleanUnit = fromUnit.trim();
  const applicable = rules.filter(
    (r) => r.fromUnit.toLowerCase() === cleanUnit.toLowerCase() || r.fromUnit === cleanUnit,
  );
  return [...applicable].sort((a, b) => b.version - a.version)[0];
}

/**
 * Unidades admitidas para una métrica: la canónica más las convertidas
 * desde unidades alternativas publicadas en el catálogo de conversiones.
 */
export function listUnitsForMetric(
  metricId: string,
): { unit: string; label: string; canonical: boolean; conversionId?: string }[] {
  const def = getMetricDefinition(metricId);
  const units: {
    unit: string;
    label: string;
    canonical: boolean;
    conversionId?: string;
  }[] = [];
  if (def?.canonicalUnit != null) {
    units.push({ unit: def.canonicalUnit, label: def.canonicalUnit, canonical: true });
  }
  for (const rule of UNIT_CONVERSIONS_V1.filter((r) => r.metricId === metricId)) {
    units.push({
      unit: rule.fromUnit,
      label: `${rule.fromUnit} → ${rule.toUnit}`,
      canonical: false,
      conversionId: rule.conversionId,
    });
  }
  return units;
}

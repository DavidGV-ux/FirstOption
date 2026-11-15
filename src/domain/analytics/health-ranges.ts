import { getMetricDefinition } from '@/domain/metrics/catalog-v1';

export type RangeStatus = 'aceptable' | 'atencion' | 'negativo' | 'sin_referencia' | 'informativo';

export interface RangeEvaluation {
  status: RangeStatus;
  label: string;
  detail: string;
}

/**
 * Clasificación informativa de valores por rangos configurados.
 * NO es diagnóstico ni criterio clínico: usa rangos de plausibilidad,
 * escalas del prototipo e intervalos de referencia cuando existen.
 */
export function evaluateMetricRange(metricId: string, value: number): RangeEvaluation {
  const def = getMetricDefinition(metricId);
  if (!def) {
    return { status: 'sin_referencia', label: 'Sin referencia', detail: 'Métrica sin definición en catálogo.' };
  }

  // Escalas autorreportadas 1-5 (prototipo, no validadas)
  if (def.valueType === 'ordinal_scale') {
    if (metricId === 'mood_self_report' || metricId === 'sleep_quality_self_report') {
      // Mayor es mejor
      if (value >= 4) return { status: 'aceptable', label: 'Favorable', detail: 'Valor alto en escala autorreportada (informativo).' };
      if (value === 3) return { status: 'atencion', label: 'Intermedio', detail: 'Valor intermedio en escala autorreportada.' };
      return { status: 'negativo', label: 'Bajo', detail: 'Valor bajo en escala autorreportada (informativo).' };
    }
    if (metricId === 'stress_self_report' || metricId === 'fatigue_self_report') {
      // Mayor es peor
      if (value <= 2) return { status: 'aceptable', label: 'Favorable', detail: 'Valor bajo en escala autorreportada (informativo).' };
      if (value === 3) return { status: 'atencion', label: 'Intermedio', detail: 'Valor intermedio en escala autorreportada.' };
      return { status: 'negativo', label: 'Elevado', detail: 'Valor alto en escala autorreportada (informativo).' };
    }
    return { status: 'informativo', label: 'Informativo', detail: 'Escala autorreportada sin umbral definido.' };
  }

  // Booleanos (síntomas): presente = atención informativa
  if (def.valueType === 'boolean') {
    if (value === 1) {
      return { status: 'atencion', label: 'Presente', detail: 'Síntoma reportado (informativo, no diagnóstico).' };
    }
    return { status: 'aceptable', label: 'Ausente', detail: 'No reportado.' };
  }

  // Rangos informativos por métrica conocida (referenciales, no clínicos)
  const ranges = INFORMATIVE_RANGES[metricId];
  if (ranges) {
    if (value >= ranges.acceptMin && value <= ranges.acceptMax) {
      return { status: 'aceptable', label: 'En rango', detail: ranges.note };
    }
    if (value >= ranges.warnMin && value <= ranges.warnMax) {
      return { status: 'atencion', label: 'Atención', detail: `${ranges.note} Fuera del rango habitual informado.` };
    }
    return { status: 'negativo', label: 'Fuera de rango', detail: `${ranges.note} Valor fuera de rangos informativos; verifica la medición o contexto.` };
  }

  // Fallback: plausibilidad del catálogo
  if (def.plausibleMin != null && def.plausibleMax != null) {
    if (value >= def.plausibleMin && value <= def.plausibleMax) {
      return { status: 'informativo', label: 'Plausible', detail: 'Dentro de rango de plausibilidad de datos (no clínico).' };
    }
    return { status: 'negativo', label: 'Fuera de plausibilidad', detail: 'Fuera de rango de plausibilidad; revisa el dato.' };
  }

  return { status: 'sin_referencia', label: 'Sin referencia', detail: 'Sin rango configurado.' };
}

interface InformativeRange {
  acceptMin: number;
  acceptMax: number;
  warnMin: number;
  warnMax: number;
  note: string;
}

const INFORMATIVE_RANGES: Record<string, InformativeRange> = {
  heart_rate: { acceptMin: 50, acceptMax: 100, warnMin: 40, warnMax: 120, note: 'Rango de reposo referencial (adultos), informativo.' },
  bp_systolic: { acceptMin: 90, acceptMax: 120, warnMin: 80, warnMax: 140, note: 'Rango referencial informativo.' },
  bp_diastolic: { acceptMin: 60, acceptMax: 80, warnMin: 50, warnMax: 90, note: 'Rango referencial informativo.' },
  spo2: { acceptMin: 95, acceptMax: 100, warnMin: 92, warnMax: 100, note: 'Rango referencial informativo (oxigenación).' },
  sleep_duration: { acceptMin: 7, acceptMax: 9, warnMin: 6, warnMax: 10, note: 'Duración referencial informativa (adultos).' },
  hemoglobin: { acceptMin: 120, acceptMax: 170, warnMin: 100, warnMax: 180, note: 'Rango referencial amplio (g/L), informativo; varía por sexo/contexto.' },
  hematocrit: { acceptMin: 36, acceptMax: 50, warnMin: 30, warnMax: 54, note: 'Rango referencial amplio (%), informativo.' },
};

export function statusColor(status: RangeStatus): string {
  switch (status) {
    case 'aceptable': return '#45C58A';
    case 'atencion': return '#F0B84B';
    case 'negativo': return '#E87979';
    case 'informativo': return '#4B91F1';
    default: return '#9BA5B3';
  }
}

export function statusLabelEs(status: RangeStatus): string {
  switch (status) {
    case 'aceptable': return 'Aceptable';
    case 'atencion': return 'Atención';
    case 'negativo': return 'Negativo';
    case 'informativo': return 'Informativo';
    default: return 'Sin referencia';
  }
}

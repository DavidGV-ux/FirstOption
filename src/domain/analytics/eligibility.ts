/**
 * Elegibilidad analítica (Incremento 4).
 *
 * Antes de cualquier tendencia o proyección se evalúa si la serie es
 * comparable y suficiente. Los requisitos son configurables por métrica
 * y método; no se afirma que un número arbitrario de puntos garantice
 * validez.
 */

export type EligibilityState =
  | 'ok'
  | 'insufficient_data'
  | 'inconclusive'
  | 'not_comparable'
  | 'unsupported';

export interface EligibilityRequirements {
  /** Mínimo de observaciones para considerar la serie. */
  minObservations: number;
  /** Días mínimos de cobertura temporal. */
  minSpanDays: number;
  /** Si true, requiere que todas las observaciones compartan la misma unidad. */
  requireSameUnit: boolean;
}

export const DEFAULT_ELIGIBILITY: EligibilityRequirements = {
  minObservations: 3,
  minSpanDays: 7,
  requireSameUnit: true,
};

export interface EligibilityInput {
  /** Número de observaciones disponibles. */
  count: number;
  /** Días de cobertura temporal (primera→última). */
  spanDays: number | null;
  /** Unidades distintas presentes en la serie. */
  distinctUnits: string[];
  /** Si hubo cambio de método/dispositivo/laboratorio. */
  methodChanged: boolean;
  /** Si la métrica es soportada por el catálogo. */
  metricSupported: boolean;
}

/**
 * Evalúa la elegibilidad de una serie para análisis descriptivo/tendencia.
 * Devuelve un estado y un motivo legible (para la persona usuaria).
 */
export function evaluateEligibility(
  input: EligibilityInput,
  req: EligibilityRequirements = DEFAULT_ELIGIBILITY,
): { state: EligibilityState; reason: string } {
  if (!input.metricSupported) {
    return { state: 'unsupported', reason: 'Métrica no soportada por el catálogo.' };
  }
  if (input.count === 0) {
    return { state: 'insufficient_data', reason: 'Sin observaciones para esta métrica.' };
  }
  if (input.count < req.minObservations) {
    return {
      state: 'insufficient_data',
      reason: `Se requieren al menos ${req.minObservations} observaciones (hay ${input.count}).`,
    };
  }
  if (input.spanDays === null || input.spanDays < req.minSpanDays) {
    return {
      state: 'insufficient_data',
      reason: `Cobertura temporal insuficiente (mínimo ${req.minSpanDays} días).`,
    };
  }
  if (req.requireSameUnit && input.distinctUnits.length > 1) {
    return {
      state: 'not_comparable',
      reason: 'Unidades incompatibles entre observaciones.',
    };
  }
  if (input.methodChanged) {
    return {
      state: 'not_comparable',
      reason: 'Cambio de método o dispositivo durante el periodo.',
    };
  }
  return { state: 'ok', reason: 'Serie elegible para análisis descriptivo.' };
}

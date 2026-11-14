/**
 * Tendencias (Incremento 4).
 *
 * Funciones puras sobre una serie temporal. El método es explícito y
 * versionado; la ventana es configurable; el número de observaciones es
 * visible; la unidad de la pendiente se reporta.
 *
 * No interpretar ausencia de significación como estabilidad demostrada.
 * Conservar outliers y mostrar su tratamiento.
 */

import type { TimePoint } from './descriptive';
import { slopePerDay, windowSummary } from './descriptive';

export interface TrendResult {
  /** Ventana analizada (días). */
  windowDays: number | null;
  /** Número de observaciones en la ventana. */
  observationCount: number;
  /** Pendiente (valor/día) por regresión lineal por tiempo real. */
  slopePerDay: number | null;
  /** Cambio absoluto entre primera y última observación. */
  absoluteChange: number | null;
  /** Cambio relativo (fracción) o null si no aplica. */
  relativeChange: number | null;
  /** Mínimo y máximo observados. */
  min: number | null;
  max: number | null;
  /** Criterio de estabilidad aplicado (texto legible). */
  stabilityCriterion: string;
  /** Estado de estabilidad (no es un diagnóstico). */
  stability: 'stable' | 'changing' | 'insufficient_data' | 'inconclusive';
  /** Método y versión (para reproducibilidad). */
  method: string;
  methodVersion: number;
}

const DEFAULT_STABILITY_THRESHOLD_PER_DAY = 0.05; // 5 % del valor medio por día (heurístico, documentado)

/**
 * Calcula la tendencia de una serie dentro de una ventana temporal.
 * `windowDays` limita las observaciones a las más recientes dentro de
 * esa ventana (tiempo real). Si es null, usa toda la serie.
 */
export function computeTrend(
  points: readonly TimePoint[],
  options: {
    windowDays?: number | null;
    stabilityThresholdPerDay?: number;
    method?: string;
    methodVersion?: number;
  } = {},
): TrendResult {
  const windowDays = options.windowDays ?? null;
  const threshold = options.stabilityThresholdPerDay ?? DEFAULT_STABILITY_THRESHOLD_PER_DAY;
  const method = options.method ?? 'linear_regression_by_time';
  const methodVersion = options.methodVersion ?? 1;

  let filtered: TimePoint[] = points.slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (windowDays !== null && filtered.length > 0) {
    const last = Date.parse(filtered[filtered.length - 1].at);
    const cutoff = last - windowDays * 24 * 60 * 60 * 1000;
    filtered = filtered.filter((p) => Date.parse(p.at) >= cutoff);
  }

  const summary = windowSummary(filtered);
  const slope = slopePerDay(filtered);

  let stability: TrendResult['stability'] = 'insufficient_data';
  if (filtered.length < 2) {
    stability = 'insufficient_data';
  } else if (slope === null || summary.mean === null || summary.mean === 0) {
    stability = 'inconclusive';
  } else {
    const relativeSlope = Math.abs(slope / summary.mean);
    stability = relativeSlope <= threshold ? 'stable' : 'changing';
  }

  const absolute = filtered.length >= 2
    ? filtered[filtered.length - 1].value - filtered[0].value
    : null;
  const relative = (filtered.length >= 2 && filtered[0].value !== 0)
    ? (filtered[filtered.length - 1].value - filtered[0].value) / filtered[0].value
    : null;

  return {
    windowDays,
    observationCount: filtered.length,
    slopePerDay: slope,
    absoluteChange: absolute,
    relativeChange: relative,
    min: summary.min,
    max: summary.max,
    stabilityCriterion: `|pendiente|/media <= ${threshold} por día`,
    stability,
    method,
    methodVersion,
  };
}

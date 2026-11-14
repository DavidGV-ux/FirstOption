/**
 * Análisis descriptivo puro (Incremento 4).
 *
 * Reglas:
 * - Funciones puras: reciben datos, devuelven resultados tipados.
 * - No diagnostican ni asignan relevancia clínica.
 * - El cambio relativo solo se calcula cuando tiene sentido (valor base
 *   distinto de cero y misma unidad); de lo contrario null.
 * - La pendiente se calcula por tiempo real (instantes ISO), nunca por
 *   índice de fila.
 * - Los outliers se conservan y se reportan; no se eliminan silenciosamente.
 * - No interpolar datos faltantes.
 */

export interface TimePoint {
  /** Instante ISO 8601 UTC. */
  at: string;
  /** Valor numérico en una unidad consistente. */
  value: number;
}

export interface WindowSummary {
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  /** Desviación estándar muestral (n-1), null si n < 2. */
  std: number | null;
  /** Días entre la primera y la última observación (tiempo real). */
  spanDays: number | null;
  firstAt: string | null;
  lastAt: string | null;
}

export function absoluteChange(from: number, to: number): number {
  return to - from;
}

/**
 * Cambio relativo (fracción). Devuelve null si el valor base es 0
 * (división por cero) — no se inventa un porcentaje.
 */
export function relativeChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return (to - from) / from;
}

export function windowSummary(points: readonly TimePoint[]): WindowSummary {
  if (points.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      mean: null,
      std: null,
      spanDays: null,
      firstAt: null,
      lastAt: null,
    };
  }
  const sorted = points
    .slice()
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const values = sorted.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  let std: number | null = null;
  if (values.length >= 2) {
    const variance =
      values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
    std = Math.sqrt(variance);
  }
  const firstMs = Date.parse(sorted[0].at);
  const lastMs = Date.parse(sorted[sorted.length - 1].at);
  const spanDays = (lastMs - firstMs) / (1000 * 60 * 60 * 24);
  return {
    count: sorted.length,
    min,
    max,
    mean,
    std,
    spanDays,
    firstAt: sorted[0].at,
    lastAt: sorted[sorted.length - 1].at,
  };
}

/**
 * Pendiente por regresión lineal simple usando el tiempo real (ms).
 * Devuelve null si no hay suficientes puntos o varianza temporal nula.
 * La unidad del resultado es (valor / día).
 */
export function slopePerDay(points: readonly TimePoint[]): number | null {
  if (points.length < 2) return null;
  const msPerDay = 1000 * 60 * 60 * 24;
  const xs = points.map((p) => Date.parse(p.at) / msPerDay);
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - meanX) ** 2;
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
  }
  if (sxx === 0) return null;
  return sxy / sxx;
}

/**
 * Compara un valor actual con una línea basal versionada.
 * Devuelve la diferencia absoluta y relativa (si aplica). No interpreta
 * relevancia clínica: solo describe.
 */
export function compareWithBaseline(
  current: number,
  baselineMean: number,
): { absolute: number; relative: number | null } {
  return {
    absolute: absoluteChange(baselineMean, current),
    relative: relativeChange(baselineMean, current),
  };
}

/**
 * Estados de calidad de captura de la inspección pupilar asistida por cámara.
 * Principio: la calidad nunca se oculta y condiciona si es honesto calcular
 * una estimación experimental.
 */
export const QUALITY_STATUSES = [
  'good',
  'acceptable',
  'limited',
  'insufficient',
  'rejected',
] as const;

export type QualityStatus = (typeof QUALITY_STATUSES)[number];

export const QUALITY_STATUS_LABELS_ES: Record<QualityStatus, string> = {
  good: 'Calidad óptima',
  acceptable: 'Calidad aceptable',
  limited: 'Calidad limitada',
  insufficient: 'Captura insuficiente',
  rejected: 'Captura rechazada',
};

/**
 * Determina si un estado de calidad permite calcular una estimación pupilar experimental.
 * - good y acceptable: permitido.
 * - limited: permitido con advertencia explícita.
 * - insufficient y rejected: NUNCA se calcula estimación.
 */
export function allowsPupilEstimation(status: QualityStatus): boolean {
  return status === 'good' || status === 'acceptable' || status === 'limited';
}

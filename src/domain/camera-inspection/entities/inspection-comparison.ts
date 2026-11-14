export type ComparisonDirection = 'increase' | 'decrease' | 'no_clear_change';

export const COMPARISON_DIRECTION_LABELS_ES: Record<ComparisonDirection, string> = {
  increase: 'Aumento relativo respecto a la captura previa',
  decrease: 'Disminución relativa respecto a la captura previa',
  no_clear_change: 'Sin cambio relativo claro detectado',
};

/**
 * Entidad: Comparación entre dos capturas de inspección pupilar.
 *
 * REGLAS OBLIGATORIAS:
 * - Requiere la misma persona y condiciones comparables.
 * - Si no es comparable o la calidad difiere mucho: no concluyente.
 * - NUNCA emite diagnósticos clínicos (p. ej. estrés, fatiga, SANS, patología neurológica).
 */
export interface InspectionComparison {
  comparisonId: string;
  subjectId: string;
  baselineCaptureId: string;
  currentCaptureId: string;
  relativeChange: number | null; // Cambio porcentual relativo: ((current - baseline) / baseline) * 100
  direction: ComparisonDirection;
  confidence: number;
  comparable: boolean;
  limitations: readonly string[];
  createdAt: string;
}

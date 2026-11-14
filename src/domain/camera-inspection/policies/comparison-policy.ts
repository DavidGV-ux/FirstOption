import type { CameraCapture } from '../entities/camera-capture';
import type { PupilEstimate } from '../entities/pupil-estimate';
import type { InspectionComparison, ComparisonDirection } from '../entities/inspection-comparison';

export interface ComparisonInput {
  comparisonId: string;
  subjectId: string;
  baseline: {
    capture: CameraCapture;
    estimate: PupilEstimate;
  };
  current: {
    capture: CameraCapture;
    estimate: PupilEstimate;
  };
}

/**
 * Política: Comparación responsable entre dos capturas de inspección pupilar.
 *
 * Exige:
 * 1. Mismo sujeto.
 * 2. Mismo ojo evaluado (izquierdo vs izquierdo, o derecho vs derecho).
 * 3. Ambas capturas deben contar con estimaciones cuantitativas relativas disponibles.
 * 4. Analiza si las diferencias de iluminación o distancia invalidan la comparación.
 * 5. NUNCA genera conclusiones clínicas diagnósticas.
 */
export function compareInspectionCaptures(input: ComparisonInput): InspectionComparison {
  const { comparisonId, subjectId, baseline, current } = input;
  const limitations: string[] = [];

  // 1. Verificación de ojo evaluado
  if (baseline.capture.eyeSide !== current.capture.eyeSide) {
    return {
      comparisonId,
      subjectId,
      baselineCaptureId: baseline.capture.captureId,
      currentCaptureId: current.capture.captureId,
      relativeChange: null,
      direction: 'no_clear_change',
      confidence: 0,
      comparable: false,
      limitations: [
        'Los ojos evaluados son distintos (no se puede comparar ojo izquierdo con ojo derecho).',
      ],
      createdAt: new Date().toISOString(),
    };
  }

  // 2. Verificación de estimaciones relativas
  if (
    baseline.estimate.relativeScale === null ||
    current.estimate.relativeScale === null
  ) {
    return {
      comparisonId,
      subjectId,
      baselineCaptureId: baseline.capture.captureId,
      currentCaptureId: current.capture.captureId,
      relativeChange: null,
      direction: 'no_clear_change',
      confidence: 0,
      comparable: false,
      limitations: [
        'Una o ambas capturas no disponen de una estimación numérica relativa válida.',
      ],
      createdAt: new Date().toISOString(),
    };
  }

  // 3. Verificación de condiciones de captura
  if (baseline.capture.lightingCondition !== current.capture.lightingCondition) {
    limitations.push(
      'La condición de iluminación difiere entre ambas capturas (puede inducir variaciones que no reflejan cambios intrínsecos).',
    );
  }

  if (baseline.capture.approximateDistance !== current.capture.approximateDistance) {
    limitations.push(
      'La distancia al dispositivo difiere entre ambas tomas.',
    );
  }

  if (
    baseline.capture.qualityStatus === 'limited' ||
    current.capture.qualityStatus === 'limited'
  ) {
    limitations.push(
      'Al menos una de las capturas tiene calidad limitada; la comparación es poco confiable.',
    );
  }

  const baseScale = baseline.estimate.relativeScale;
  const currScale = current.estimate.relativeScale;

  // Cambio porcentual relativo
  const delta = currScale - baseScale;
  const relativePercent = Math.round(((delta) / baseScale) * 1000) / 10; // ej: +12.5%

  // Confianza combinada
  let confidence = Math.min(baseline.estimate.confidence, current.estimate.confidence);
  if (limitations.length > 0) {
    confidence = Math.max(0.1, confidence * 0.6);
  }

  // Umbral de significación para cambio relativo (e.g. 5% de cambio mínimo para considerarse cambio)
  let direction: ComparisonDirection = 'no_clear_change';
  if (Math.abs(relativePercent) >= 5.0 && confidence >= 0.4) {
    direction = relativePercent > 0 ? 'increase' : 'decrease';
  } else {
    direction = 'no_clear_change';
  }

  const isComparable = limitations.length < 2 && confidence >= 0.3;

  return {
    comparisonId,
    subjectId,
    baselineCaptureId: baseline.capture.captureId,
    currentCaptureId: current.capture.captureId,
    relativeChange: relativePercent,
    direction,
    confidence: Math.round(confidence * 100) / 100,
    comparable: isComparable,
    limitations,
    createdAt: new Date().toISOString(),
  };
}

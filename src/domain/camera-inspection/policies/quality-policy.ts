import type { FrameAnalysis } from '../entities/frame-analysis';
import type { CaptureQuality } from '../entities/capture-quality';
import type { QualityStatus } from '../value-objects/quality-status';

/**
 * Política: Evaluación rigurosa de calidad de captura.
 *
 * Determina el estado de calidad y si es ético y técnicamente viable
 * calcular una estimación pupilar experimental.
 */
export function evaluateCaptureQuality(metrics: FrameAnalysis): CaptureQuality {
  const reasons: string[] = [];

  // 1. Verificación de ojo cerrado o fuera de guía (Crítico)
  if (!metrics.eyeOpen) {
    reasons.push('El ojo aparece cerrado o no visible en la captura');
    return {
      status: 'rejected',
      metrics,
      reasons,
    };
  }

  if (!metrics.eyeInGuide) {
    reasons.push('El ojo está fuera del área delimitada por la guía visual');
    return {
      status: 'rejected',
      metrics,
      reasons,
    };
  }

  // 2. Parpadeo
  if (metrics.blinkDetected) {
    reasons.push('Se detectó movimiento de parpadeo durante la captura');
  }

  // 3. Movimiento
  if (metrics.motionScore > 0.7) {
    reasons.push('Movimiento excesivo detectado durante la captura');
    return {
      status: 'insufficient',
      metrics,
      reasons,
    };
  } else if (metrics.motionScore > 0.35) {
    reasons.push('Movimiento leve o moderado detectado');
  }

  // 4. Nitidez / Desenfoque
  if (metrics.sharpness < 8.0) {
    reasons.push('Captura borrosa o con nitidez deficiente');
  }

  // 5. Iluminación y contraste
  if (metrics.brightness < 35) {
    reasons.push('Iluminación muy baja (subexpuesta)');
  } else if (metrics.brightness > 225) {
    reasons.push('Luz directa excesiva o reflejo brillante (sobreexpuesta)');
  }

  if (metrics.contrast < 15) {
    reasons.push('Contraste insuficiente para discriminar el contorno pupilar');
  }

  // Determinar status final
  let status: QualityStatus = 'good';

  if (
    metrics.brightness < 20 ||
    metrics.contrast < 8 ||
    metrics.sharpness < 5.0
  ) {
    status = 'insufficient';
  } else if (
    metrics.brightness < 40 ||
    metrics.brightness > 220 ||
    metrics.blinkDetected ||
    metrics.motionScore > 0.35 ||
    metrics.sharpness < 12.0
  ) {
    // Poca luz, luz directa, parpadeo o movimiento moderado obligan a 'limited'
    status = 'limited';
  } else if (reasons.length > 0) {
    status = 'acceptable';
  } else {
    status = 'good';
  }

  return {
    status,
    metrics,
    reasons,
  };
}

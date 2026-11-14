import type { PupilEstimate } from '@/domain/camera-inspection/entities/pupil-estimate';
import type { PupilSegmentationResult } from './pupil-segmenter';
import type { CaptureQuality } from '@/domain/camera-inspection/entities/capture-quality';

export class PupilGeometryEstimator {
  static readonly METHOD_CODE = 'EXPERIMENTAL_RATIO_V1';
  static readonly METHOD_VERSION = '1.0.0';

  estimate(
    captureId: string,
    segmentation: PupilSegmentationResult | null,
    quality: CaptureQuality,
  ): PupilEstimate {
    const nowIso = new Date().toISOString();
    const limitations: string[] = [...quality.reasons];

    // Si la calidad no es elegible o no hubo segmentación válida
    if (
      quality.status === 'insufficient' ||
      quality.status === 'rejected' ||
      segmentation === null ||
      !segmentation.valid
    ) {
      if (segmentation === null && quality.status !== 'rejected') {
        limitations.push('No se pudo identificar con certeza el contorno pupilar en la imagen.');
      }
      return {
        estimateId: `est-${captureId}`,
        captureId,
        methodCode: PupilGeometryEstimator.METHOD_CODE,
        methodVersion: PupilGeometryEstimator.METHOD_VERSION,
        relativeScale: null,
        confidence: 0.0,
        qualityStatus: quality.status,
        limitations,
        createdAt: nowIso,
      };
    }

    // Cálculo del ratio relativo adimensional
    const ratio = segmentation.pupilEquivalentDiameter / segmentation.irisEquivalentDiameter;
    // Rango fisiológico relativo seguro
    const clampedRatio = Math.max(0.12, Math.min(0.88, ratio));
    const roundedRatio = Math.round(clampedRatio * 1000) / 1000;

    // Cálculo de confianza
    let confidence = 0.85;

    if (quality.status === 'limited') {
      confidence -= 0.35;
      limitations.push('Aproximación con calidad limitada: la confianza del cálculo se reduce.');
    } else if (quality.status === 'acceptable') {
      confidence -= 0.15;
    }

    if (segmentation.circularity < 0.6) {
      confidence -= 0.15;
      limitations.push('Contorno pupilar irregular o parcialmente ocluido.');
    }

    if (quality.metrics.sharpness < 12) {
      confidence -= 0.1;
      limitations.push('Bordes con nitidez moderada.');
    }

    confidence = Math.max(0.1, Math.min(0.95, Math.round(confidence * 100) / 100));

    limitations.push(
      'Aproximación experimental sin calibración milimétrica; sujeta a variación de iluminación y distancia.',
    );

    return {
      estimateId: `est-${captureId}`,
      captureId,
      methodCode: PupilGeometryEstimator.METHOD_CODE,
      methodVersion: PupilGeometryEstimator.METHOD_VERSION,
      relativeScale: roundedRatio,
      confidence,
      qualityStatus: quality.status,
      limitations,
      createdAt: nowIso,
    };
  }
}

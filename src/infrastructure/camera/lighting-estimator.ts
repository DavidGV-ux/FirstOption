import type { LightingCondition } from '@/domain/camera-inspection/value-objects/lighting-condition';
import type { DecodedImagePixels } from '@/domain/camera-inspection/ports/frame-analyzer-port';

export interface LightingMetrics {
  brightness: number; // 0 a 255
  contrast: number; // 0 a 128 (desviación estándar)
  lightingScore: number; // 0.0 a 1.0
  condition: LightingCondition;
}

/**
 * Estimador de condiciones de iluminación basado en luminancia percibida (ITU-R BT.601).
 * Y = 0.299 * R + 0.587 * G + 0.114 * B
 */
export class LightingEstimator {
  estimate(pixels: DecodedImagePixels): LightingMetrics {
    const { data, width, height } = pixels;
    const totalPixels = width * height;
    if (totalPixels === 0) {
      return {
        brightness: 0,
        contrast: 0,
        lightingScore: 0,
        condition: 'low',
      };
    }

    // Muestreo optimizado: evaluamos cada pixel (o paso si es muy grande)
    const step = totalPixels > 250000 ? 4 : 1;
    let sumLuminance = 0;
    let sumSquaredLuminance = 0;
    let sampleCount = 0;

    for (let i = 0; i < totalPixels; i += step) {
      const offset = i * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      sumLuminance += y;
      sumSquaredLuminance += y * y;
      sampleCount++;
    }

    const meanLuminance = sumLuminance / sampleCount;
    const variance = Math.max(0, sumSquaredLuminance / sampleCount - meanLuminance * meanLuminance);
    const contrast = Math.sqrt(variance);

    // Clasificación de condición de iluminación
    let condition: LightingCondition = 'adequate';
    let lightingScore = 1.0;

    if (meanLuminance < 45) {
      condition = 'low';
      lightingScore = Math.max(0.1, meanLuminance / 45);
    } else if (meanLuminance > 220) {
      condition = 'direct_glare';
      lightingScore = Math.max(0.1, (255 - meanLuminance) / 35);
    } else if (meanLuminance > 185) {
      condition = 'excessive';
      lightingScore = 0.6;
    } else {
      condition = 'adequate';
      // Óptimo alrededor de 90-140 con buen contraste
      const diffFromOptimal = Math.abs(meanLuminance - 115);
      lightingScore = Math.max(0.4, 1.0 - diffFromOptimal / 120);
    }

    return {
      brightness: Math.round(meanLuminance * 10) / 10,
      contrast: Math.round(contrast * 10) / 10,
      lightingScore: Math.round(lightingScore * 100) / 100,
      condition,
    };
  }
}

import type { DecodedImagePixels } from '@/domain/camera-inspection/ports/frame-analyzer-port';

export interface MotionSharpnessMetrics {
  sharpness: number; // Gradiente medio de bordes (Tenengrad simplificado)
  motionScore: number; // 0.0 (estático) a 1.0 (movimiento excesivo)
}

/**
 * Estimador de nitidez y movimiento basado en energía de gradientes (Sobel/Laplaciano).
 * El movimiento brusco o desenfoque causa caída drástica en las altas frecuencias espaciales.
 */
export class MotionEstimator {
  estimate(pixels: DecodedImagePixels): MotionSharpnessMetrics {
    const { data, width, height } = pixels;
    if (width < 8 || height < 8) {
      return { sharpness: 0, motionScore: 1.0 };
    }

    // Calculamos gradientes espaciales en una cuadrícula de muestreo
    const stepX = Math.max(1, Math.floor(width / 160));
    const stepY = Math.max(1, Math.floor(height / 120));

    let totalGradient = 0;
    let gradHSum = 0;
    let gradVSum = 0;
    let sampleCount = 0;

    for (let y = stepY; y < height - stepY; y += stepY) {
      const rowOffset = y * width;
      for (let x = stepX; x < width - stepX; x += stepX) {
        // Luminancia de píxeles vecinos
        const c = this.getLuminance(data, (rowOffset + x) * 4);
        const right = this.getLuminance(data, (rowOffset + x + 1) * 4);
        const down = this.getLuminance(data, ((y + 1) * width + x) * 4);

        const dx = Math.abs(right - c);
        const dy = Math.abs(down - c);

        gradHSum += dx;
        gradVSum += dy;
        totalGradient += Math.sqrt(dx * dx + dy * dy);
        sampleCount++;
      }
    }

    if (sampleCount === 0) {
      return { sharpness: 0, motionScore: 1.0 };
    }

    const meanGradient = totalGradient / sampleCount;

    // Asimetría direccional: el movimiento unidireccional de cámara suele atenuar un eje mucho más que otro
    const ratioHV = gradVSum > 0 ? gradHSum / gradVSum : 1.0;
    const directionalAsymmetry = Math.abs(ratioHV - 1.0);

    // Mapeo a nitidez y motionScore
    // Un gradiente medio alto (> 15-20) indica imagen nítida.
    // Menor a 8 indica borrosidad/desenfoque severo.
    const sharpness = Math.round(meanGradient * 10) / 10;

    let motionScore = 0.0;
    if (sharpness < 7.0) {
      motionScore = 0.85; // Muy borroso / movido
    } else if (sharpness < 12.0) {
      motionScore = 0.55;
    } else {
      motionScore = Math.max(0.05, Math.min(0.4, directionalAsymmetry * 0.25));
    }

    return {
      sharpness,
      motionScore: Math.round(motionScore * 100) / 100,
    };
  }

  private getLuminance(data: Uint8Array, offset: number): number {
    return 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  }
}

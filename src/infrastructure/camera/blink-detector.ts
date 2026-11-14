import type { DecodedImagePixels, EyeGuideRegion } from '@/domain/camera-inspection/ports/frame-analyzer-port';

export interface EyePresenceMetrics {
  eyeOpen: boolean;
  eyeInGuide: boolean;
  blinkDetected: boolean;
}

/**
 * Detector de presencia de ojo, apertura y parpadeo.
 * Analiza la distribución de luminancia en la región de interés (ROI) de la guía.
 */
export class BlinkDetector {
  detect(pixels: DecodedImagePixels, guide: EyeGuideRegion): EyePresenceMetrics {
    const { data, width, height } = pixels;

    // Delimitar la caja de la guía en coordenadas de píxeles
    const minX = Math.max(0, Math.floor((guide.centerX - guide.radiusX) * width));
    const maxX = Math.min(width - 1, Math.ceil((guide.centerX + guide.radiusX) * width));
    const minY = Math.max(0, Math.floor((guide.centerY - guide.radiusY) * height));
    const maxY = Math.min(height - 1, Math.ceil((guide.centerY + guide.radiusY) * height));

    const roiWidth = maxX - minX;
    const roiHeight = maxY - minY;

    if (roiWidth < 10 || roiHeight < 10) {
      return { eyeOpen: false, eyeInGuide: false, blinkDetected: false };
    }

    let darkPixelCount = 0; // Pupila o iris oscuro (Y < 75)
    let brightPixelCount = 0; // Esclera brillante (Y > 150)
    let totalRoiPixels = 0;
    let sumLuminance = 0;
    let sumSqLuminance = 0;

    for (let y = minY; y <= maxY; y += 2) {
      for (let x = minX; x <= maxX; x += 2) {
        const offset = (y * width + x) * 4;
        const lum = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
        sumLuminance += lum;
        sumSqLuminance += lum * lum;
        totalRoiPixels++;

        if (lum < 75) {
          darkPixelCount++;
        } else if (lum > 140) {
          brightPixelCount++;
        }
      }
    }

    if (totalRoiPixels === 0) {
      return { eyeOpen: false, eyeInGuide: false, blinkDetected: false };
    }

    const mean = sumLuminance / totalRoiPixels;
    const variance = Math.max(0, sumSqLuminance / totalRoiPixels - mean * mean);
    const stdDev = Math.sqrt(variance);

    const darkRatio = darkPixelCount / totalRoiPixels;
    const brightRatio = brightPixelCount / totalRoiPixels;

    // En un ojo abierto centrado:
    // - Hay una masa oscura (iris/pupila): darkRatio típicamente entre 0.05 y 0.55
    // - Hay esclera (blanco del ojo) o contraste marcado: stdDev > 22
    // - Si el ojo está cerrado, la piel del párpado es uniforme: stdDev bajo (< 18) y darkRatio muy bajo (< 0.03)
    const hasDarkCenter = darkRatio >= 0.04 && darkRatio <= 0.65;
    const hasContrastPattern = stdDev >= 20.0;

    const eyeInGuide = hasDarkCenter || (brightRatio >= 0.05 && stdDev >= 18);
    const eyeOpen = eyeInGuide && hasDarkCenter && hasContrastPattern;
    const blinkDetected = !eyeOpen && eyeInGuide;

    return {
      eyeOpen,
      eyeInGuide,
      blinkDetected,
    };
  }
}

import type { DecodedImagePixels, EyeGuideRegion } from '@/domain/camera-inspection/ports/frame-analyzer-port';

export interface PupilSegmentationResult {
  centerX: number;
  centerY: number;
  pupilEquivalentDiameter: number;
  irisEquivalentDiameter: number;
  circularity: number; // 0.0 a 1.0 (1.0 = círculo perfecto)
  valid: boolean;
}

/**
 * Segmentador de pupila por umbralización adaptativa en la región de interés (ROI).
 * Busca la depresión de luminancia correspondiente al orificio pupilar.
 */
export class PupilSegmenter {
  segment(pixels: DecodedImagePixels, guide: EyeGuideRegion): PupilSegmentationResult | null {
    const { data, width, height } = pixels;

    const minX = Math.max(0, Math.floor((guide.centerX - guide.radiusX) * width));
    const maxX = Math.min(width - 1, Math.ceil((guide.centerX + guide.radiusX) * width));
    const minY = Math.max(0, Math.floor((guide.centerY - guide.radiusY) * height));
    const maxY = Math.min(height - 1, Math.ceil((guide.centerY + guide.radiusY) * height));

    const roiWidth = maxX - minX;
    const roiHeight = maxY - minY;

    if (roiWidth < 16 || roiHeight < 16) {
      return null;
    }

    // 1. Encontrar luminancia mínima en la ROI (centro de la pupila)
    let minLum = 255;
    let sumLum = 0;
    let count = 0;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const offset = (y * width + x) * 4;
        const lum = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
        if (lum < minLum) {
          minLum = lum;
        }
        sumLum += lum;
        count++;
      }
    }

    if (count === 0 || minLum > 100) {
      // No hay centro oscuro correspondiente a una pupila
      return null;
    }

    const meanLum = sumLum / count;
    // Umbral de pupila adaptativo
    const pupilThreshold = minLum + Math.max(12, Math.min(35, (meanLum - minLum) * 0.35));
    // Umbral de iris adaptativo
    const irisThreshold = meanLum * 0.85;

    let pupilArea = 0;
    let pupilSumX = 0;
    let pupilSumY = 0;
    let irisArea = 0;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const offset = (y * width + x) * 4;
        const lum = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];

        if (lum <= pupilThreshold) {
          pupilArea++;
          pupilSumX += x;
          pupilSumY += y;
        }
        if (lum <= irisThreshold) {
          irisArea++;
        }
      }
    }

    // Validación de viabilidad geométrica
    const minPupilPixels = 20;
    const maxPupilPixels = count * 0.55;

    if (pupilArea < minPupilPixels || pupilArea > maxPupilPixels) {
      return null;
    }

    const centerX = pupilSumX / pupilArea;
    const centerY = pupilSumY / pupilArea;

    // Diámetros equivalentes (D = 2 * sqrt(Area / PI))
    const pupilDiameter = 2 * Math.sqrt(pupilArea / Math.PI);
    // Para el iris, si la iluminación o párpado recorta el iris, usamos el máximo entre el iris medido y el radio de la guía
    const measuredIrisDiameter = 2 * Math.sqrt(Math.max(irisArea, pupilArea * 2.5) / Math.PI);
    const guideReferenceDiameter = Math.min(roiWidth, roiHeight) * 0.8;
    const irisDiameter = Math.max(measuredIrisDiameter, guideReferenceDiameter);

    // Calcular circularidad estimada por varianza radial
    let radialVariance = 0;
    for (let y = minY; y <= maxY; y += 2) {
      for (let x = minX; x <= maxX; x += 2) {
        const offset = (y * width + x) * 4;
        const lum = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
        if (lum <= pupilThreshold) {
          const dx = x - centerX;
          const dy = y - centerY;
          const r = Math.sqrt(dx * dx + dy * dy);
          const expectedR = pupilDiameter / 2;
          radialVariance += Math.abs(r - expectedR);
        }
      }
    }
    const meanRadialError = pupilArea > 0 ? radialVariance / (pupilArea / 4) : 10;
    const circularity = Math.max(0.1, Math.min(1.0, 1.0 - meanRadialError / (pupilDiameter / 2)));

    return {
      centerX,
      centerY,
      pupilEquivalentDiameter: Math.round(pupilDiameter * 10) / 10,
      irisEquivalentDiameter: Math.round(irisDiameter * 10) / 10,
      circularity: Math.round(circularity * 100) / 100,
      valid: circularity >= 0.35,
    };
  }
}

import type { FrameAnalysis } from '../entities/frame-analysis';
import type { PupilEstimate } from '../entities/pupil-estimate';
import type { QualityStatus } from '../value-objects/quality-status';

export interface DecodedImagePixels {
  data: Uint8Array; // RGBA buffers
  width: number;
  height: number;
}

export interface EyeGuideRegion {
  centerX: number; // 0..1 normalizado respecto al ancho
  centerY: number; // 0..1 normalizado respecto al alto
  radiusX: number; // radio horizontal normalizado
  radiusY: number; // radio vertical normalizado
}

export interface FrameAnalysisResult {
  frameAnalysis: FrameAnalysis;
  pupilEstimate: PupilEstimate;
  qualityStatus: QualityStatus;
}

/**
 * Puerto: Analizador de señales visuales y estimación pupilar experimental.
 */
export interface FrameAnalyzerPort {
  analyze(
    captureId: string,
    pixels: DecodedImagePixels,
    guide: EyeGuideRegion,
  ): Promise<FrameAnalysisResult>;
}

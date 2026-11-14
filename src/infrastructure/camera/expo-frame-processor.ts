import type {
  FrameAnalyzerPort,
  FrameAnalysisResult,
  DecodedImagePixels,
  EyeGuideRegion,
} from '@/domain/camera-inspection/ports/frame-analyzer-port';
import type { FrameAnalysis } from '@/domain/camera-inspection/entities/frame-analysis';
import { LightingEstimator } from './lighting-estimator';
import { MotionEstimator } from './motion-estimator';
import { BlinkDetector } from './blink-detector';
import { PupilSegmenter } from './pupil-segmenter';
import { PupilGeometryEstimator } from './pupil-geometry-estimator';
import { evaluateCaptureQuality } from '@/domain/camera-inspection/policies/quality-policy';

export class ExpoFrameProcessor implements FrameAnalyzerPort {
  private readonly lighting = new LightingEstimator();
  private readonly motion = new MotionEstimator();
  private readonly blink = new BlinkDetector();
  private readonly segmenter = new PupilSegmenter();
  private readonly geometry = new PupilGeometryEstimator();

  async analyze(
    captureId: string,
    pixels: DecodedImagePixels,
    guide: EyeGuideRegion,
  ): Promise<FrameAnalysisResult> {
    const nowIso = new Date().toISOString();

    // 1. Iluminación
    const lightingMetrics = this.lighting.estimate(pixels);

    // 2. Movimiento y nitidez
    const motionMetrics = this.motion.estimate(pixels);

    // 3. Detección de ojo y parpadeo
    const eyeMetrics = this.blink.detect(pixels, guide);

    // Consolidar entidad FrameAnalysis
    const frameAnalysis: FrameAnalysis = {
      captureId,
      brightness: lightingMetrics.brightness,
      contrast: lightingMetrics.contrast,
      sharpness: motionMetrics.sharpness,
      motionScore: motionMetrics.motionScore,
      blinkDetected: eyeMetrics.blinkDetected,
      eyeOpen: eyeMetrics.eyeOpen,
      eyeInGuide: eyeMetrics.eyeInGuide,
      lightingScore: lightingMetrics.lightingScore,
      resolutionWidth: pixels.width,
      resolutionHeight: pixels.height,
      createdAt: nowIso,
    };

    // 4. Política de calidad
    const quality = evaluateCaptureQuality(frameAnalysis);

    // 5. Segmentación pupilar si la calidad y apertura lo permiten
    let segmentation = null;
    if (quality.status !== 'insufficient' && quality.status !== 'rejected') {
      segmentation = this.segmenter.segment(pixels, guide);
    }

    // 6. Estimación geométrica relativa experimental
    const pupilEstimate = this.geometry.estimate(captureId, segmentation, quality);

    return {
      frameAnalysis,
      pupilEstimate,
      qualityStatus: quality.status,
    };
  }
}

import type { PlrTimePoint, PlrResult } from '@/domain/camera-inspection/entities/plr-test';
import type { EyeSide } from '@/domain/camera-inspection/entities/camera-capture';
import { calculatePlrMetrics } from '@/domain/camera-inspection/policies/plr-policy';
import { PupilSegmenter } from './pupil-segmenter';
import type { DecodedImagePixels, EyeGuideRegion } from '@/domain/camera-inspection/ports/frame-analyzer-port';

export type PlrPhase = 'idle' | 'countdown' | 'baseline' | 'flash' | 'constriction' | 'redilation' | 'completed' | 'failed';

export interface PlrTimingConfig {
  /** Duración de la fase basal pre-estímulo (ms). Default: 1200 ms */
  baselineDurationMs: number;
  /** Duración del pulso de flash (ms). Default: 300 ms */
  flashDurationMs: number;
  /** Duración de la fase de constricción y pico de miosis (ms). Default: 1700 ms */
  constrictionDurationMs: number;
  /** Duración de la fase de redilatación hacia el estado basal (ms). Default: 2000 ms */
  redilationDurationMs: number;
}

export const DEFAULT_PLR_TIMING: PlrTimingConfig = {
  baselineDurationMs: 1200,
  flashDurationMs: 300,
  constrictionDurationMs: 1700,
  redilationDurationMs: 2000,
};

export class PlrProcessor {
  private readonly segmenter = new PupilSegmenter();
  private readonly config: PlrTimingConfig;

  constructor(config: Partial<PlrTimingConfig> = {}) {
    this.config = { ...DEFAULT_PLR_TIMING, ...config };
  }

  get totalDurationMs(): number {
    return (
      this.config.baselineDurationMs +
      this.config.flashDurationMs +
      this.config.constrictionDurationMs +
      this.config.redilationDurationMs
    );
  }

  get flashStartTimeMs(): number {
    return this.config.baselineDurationMs;
  }

  get flashEndTimeMs(): number {
    return this.config.baselineDurationMs + this.config.flashDurationMs;
  }

  /**
   * Determina la fase activa según el tiempo transcurrido en milisegundos.
   */
  getPhaseAtTime(elapsedMs: number): PlrPhase {
    if (elapsedMs < 0) return 'idle';
    if (elapsedMs < this.flashStartTimeMs) return 'baseline';
    if (elapsedMs < this.flashEndTimeMs) return 'flash';
    if (elapsedMs < this.flashStartTimeMs + this.config.flashDurationMs + this.config.constrictionDurationMs) {
      return 'constriction';
    }
    if (elapsedMs < this.totalDurationMs) return 'redilation';
    return 'completed';
  }

  /**
   * Determina si el flash debe estar activo en el tiempo indicado.
   */
  isFlashActiveAtTime(elapsedMs: number): boolean {
    return elapsedMs >= this.flashStartTimeMs && elapsedMs < this.flashEndTimeMs;
  }

  /**
   * Extrae el ratio pupila/iris de un fotograma decodificado si la pupila es visible.
   */
  processFrame(pixels: DecodedImagePixels, guide: EyeGuideRegion): number | null {
    const res = this.segmenter.segment(pixels, guide);
    if (!res || !res.valid || res.irisEquivalentDiameter <= 0) {
      return null;
    }
    return Math.max(0.1, Math.min(0.9, res.pupilEquivalentDiameter / res.irisEquivalentDiameter));
  }

  /**
   * Ejecuta el cálculo analítico final de la prueba a partir de las muestras acumuladas.
   */
  evaluate(
    samples: readonly PlrTimePoint[],
    eyeSide: EyeSide = 'left',
    testId?: string,
  ): PlrResult {
    return calculatePlrMetrics(samples, {
      testId,
      eyeSide,
      flashStartTimeMs: this.flashStartTimeMs,
      flashDurationMs: this.config.flashDurationMs,
    });
  }

  /**
   * Genera una secuencia fisiológica sintética realista de PLR.
   * Muy útil para tests automatizados y demostraciones en entornos sin cámara nativa 60fps.
   */
  generateSyntheticSequence(options: {
    baselineRatio?: number;
    latencyMs?: number;
    constrictionAmplitudePct?: number;
    sampleRateHz?: number;
    noiseLevel?: number;
    slowRecovery?: boolean;
  } = {}): PlrTimePoint[] {
    const {
      baselineRatio = 0.52,
      latencyMs = 260,
      constrictionAmplitudePct = 38.0,
      sampleRateHz = 30, // 30 fps
      noiseLevel = 0.005,
      slowRecovery = false,
    } = options;

    const dt = 1000 / sampleRateHz;
    const totalMs = this.totalDurationMs;
    const samples: PlrTimePoint[] = [];

    const flashStart = this.flashStartTimeMs;
    const constrictionOnset = flashStart + latencyMs;
    const nadirTime = constrictionOnset + 900; // Pico de miosis a ~900ms del inicio de contracción
    const minRatio = baselineRatio * (1 - constrictionAmplitudePct / 100);

    for (let t = 0; t <= totalMs; t += dt) {
      const flashActive = this.isFlashActiveAtTime(t);
      let ratio = baselineRatio;

      if (t < constrictionOnset) {
        // Fase basal pre-contracción con pequeñas micro-fluctuaciones
        ratio = baselineRatio;
      } else if (t >= constrictionOnset && t <= nadirTime) {
        // Fase de contracción (miosis sigmoidal)
        const progress = (t - constrictionOnset) / (nadirTime - constrictionOnset);
        // Función de caída de constricción pupilar
        const smoothDrop = Math.pow(progress, 1.15);
        ratio = baselineRatio - smoothDrop * (baselineRatio - minRatio);
      } else {
        // Fase de redilatación exponencial
        const redilationProgress = (t - nadirTime) / (totalMs - nadirTime);
        const recoveryRate = slowRecovery ? 0.35 : 0.65;
        const recoveredFraction = (1 - Math.exp(-redilationProgress * (slowRecovery ? 1.5 : 2.5))) * recoveryRate;
        ratio = minRatio + (baselineRatio - minRatio) * recoveredFraction;
      }

      // Añadir ruido gaussiano leve
      const noise = (Math.random() - 0.5) * 2 * noiseLevel;
      const finalRatio = Math.max(0.15, Math.min(0.85, Math.round((ratio + noise) * 1000) / 1000));

      samples.push({
        timestampMs: Math.round(t),
        pupilRatio: finalRatio,
        flashActive,
      });
    }

    return samples;
  }
}

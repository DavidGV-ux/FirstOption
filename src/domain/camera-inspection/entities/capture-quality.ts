import type { FrameAnalysis } from './frame-analysis';
import type { QualityStatus } from '../value-objects/quality-status';

/**
 * Entidad: Evaluación de calidad de la captura.
 */
export interface CaptureQuality {
  status: QualityStatus;
  metrics: FrameAnalysis;
  reasons: readonly string[];
}

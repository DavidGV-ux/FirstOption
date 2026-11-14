import type { QualityStatus } from '../value-objects/quality-status';

/**
 * Entidad: Estimación pupilar relativa experimental.
 *
 * Contrato de honestidad:
 * - `relativeScale` es adimensional o null si la calidad fue insuficiente o el ojo estaba cerrado.
 * - `confidence` va de 0.0 a 1.0.
 * - Siempre incluye lista de limitaciones identificadas.
 * - Nunca contiene diagnósticos ni inferencias patológicas.
 */
export interface PupilEstimate {
  estimateId: string;
  captureId: string;
  methodCode: string;
  methodVersion: string;
  relativeScale: number | null;
  confidence: number;
  qualityStatus: QualityStatus;
  limitations: readonly string[];
  createdAt: string;
}

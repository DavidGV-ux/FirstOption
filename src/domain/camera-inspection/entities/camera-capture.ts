import type { CaptureMode } from '../value-objects/capture-mode';
import type { LightingCondition } from '../value-objects/lighting-condition';
import type { QualityStatus } from '../value-objects/quality-status';

export type EyeSide = 'left' | 'right';
export const EYE_SIDE_LABELS_ES: Record<EyeSide, string> = {
  left: 'Ojo izquierdo',
  right: 'Ojo derecho',
};

export type ApproximateDistance = 'close' | 'medium' | 'far';
export const DISTANCE_LABELS_ES: Record<ApproximateDistance, string> = {
  close: 'Cerca (~15-20 cm)',
  medium: 'Media (~25-35 cm)',
  far: 'Lejos (>40 cm)',
};

/**
 * Entidad: Captura de inspección por cámara.
 * Registra los metadatos y condiciones de la captura puntual.
 * Por defecto `imageSaved` es false y no se almacena ningún archivo.
 */
export interface CameraCapture {
  captureId: string;
  sessionId: string;
  capturedAt: string;
  eyeSide: EyeSide;
  captureMode: CaptureMode;
  lightingCondition: LightingCondition;
  approximateDistance: ApproximateDistance;
  imageSaved: boolean;
  imageStoragePath: string | null;
  imageSha256: string | null;
  qualityStatus: QualityStatus;
  qualityNotes: string | null;
  createdAt: string;
}

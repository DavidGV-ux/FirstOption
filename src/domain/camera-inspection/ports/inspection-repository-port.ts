import type { CameraInspectionSession } from '../entities/inspection-session';
import type { CameraCapture, EyeSide } from '../entities/camera-capture';
import type { FrameAnalysis } from '../entities/frame-analysis';
import type { PupilEstimate } from '../entities/pupil-estimate';
import type { InspectionComparison } from '../entities/inspection-comparison';

export interface InspectionRecord {
  session: CameraInspectionSession;
  capture: CameraCapture;
  metrics: FrameAnalysis | null;
  estimate: PupilEstimate | null;
}

export interface SaveInspectionTransactionInput {
  session: CameraInspectionSession;
  capture: CameraCapture;
  metrics: FrameAnalysis | null;
  estimate: PupilEstimate | null;
  comparison?: InspectionComparison | null;
}

/**
 * Puerto: Repositorio persistente de inspecciones de cámara.
 */
export interface InspectionRepositoryPort {
  /** Guarda la inspección completa en una única transacción atómica. */
  saveInspection(input: SaveInspectionTransactionInput): Promise<void>;

  /** Obtiene la captura previa más reciente para un ojo específico de la persona. */
  getLatestCapture(
    subjectId: string,
    eyeSide: EyeSide,
  ): Promise<InspectionRecord | null>;

  /** Lista inspecciones recientes de la persona. */
  listRecentInspections(
    subjectId: string,
    limit?: number,
  ): Promise<readonly InspectionRecord[]>;

  /** Guarda un registro de comparación entre dos capturas. */
  saveComparison(comparison: InspectionComparison): Promise<void>;

  /** Elimina la referencia de imagen de una captura tras su borrado del disco. */
  clearCaptureImageStorage(captureId: string): Promise<void>;
}

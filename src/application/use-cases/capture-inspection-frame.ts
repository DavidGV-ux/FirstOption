import type {
  CameraCapturePort,
  RawCapturedImage,
} from '@/domain/camera-inspection/ports/camera-capture-port';

export class CaptureInspectionFrameUseCase {
  constructor(private readonly camera: CameraCapturePort) {}

  async execute(): Promise<RawCapturedImage> {
    const available = await this.camera.isAvailable();
    if (!available) {
      throw new Error(
        'La cámara no está disponible o la vista previa no ha terminado de inicializarse.',
      );
    }
    return this.camera.captureFrame();
  }
}

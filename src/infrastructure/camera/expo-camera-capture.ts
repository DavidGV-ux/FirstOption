import type {
  CameraCapturePort,
  RawCapturedImage,
} from '@/domain/camera-inspection/ports/camera-capture-port';

export type CameraCaptureDelegate = () => Promise<RawCapturedImage>;

/**
 * Adaptador de captura de cámara basado en Expo Camera.
 * Se vincula dinámicamente con la vista activa de la cámara para ejecutar el disparo.
 */
export class ExpoCameraCapture implements CameraCapturePort {
  private delegate: CameraCaptureDelegate | null = null;

  attachDelegate(delegate: CameraCaptureDelegate | null): void {
    this.delegate = delegate;
  }

  async isAvailable(): Promise<boolean> {
    return this.delegate !== null;
  }

  async captureFrame(): Promise<RawCapturedImage> {
    if (this.delegate === null) {
      throw new Error('La cámara no está lista o no está disponible en este momento.');
    }
    return this.delegate();
  }
}

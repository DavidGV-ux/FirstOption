export interface RawCapturedImage {
  uri: string;
  base64?: string;
  width: number;
  height: number;
  facing: 'front' | 'back';
}

/**
 * Puerto: Dispositivo de captura fotográfica / cámara.
 */
export interface CameraCapturePort {
  isAvailable(): Promise<boolean>;
  captureFrame(): Promise<RawCapturedImage>;
}

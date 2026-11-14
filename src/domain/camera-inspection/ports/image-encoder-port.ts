import type { DecodedImagePixels } from './frame-analyzer-port';

/**
 * Puerto: Decodificación y persistencia privada de imágenes.
 * Regla: solo se persiste si el usuario otorga consentimiento explícito.
 */
export interface ImageEncoderPort {
  /** Decodifica una imagen JPEG o Base64 a píxeles RGBA sin comprimir para análisis. */
  decodeToRgba(base64OrBytes: string | Uint8Array): Promise<DecodedImagePixels>;

  /** Calcula el hash SHA-256 de los bytes de la imagen. */
  computeSha256(data: Uint8Array): Promise<string>;

  /** Guarda la imagen de forma privada en el sandbox del dispositivo. */
  saveToPrivateSandbox(
    subjectId: string,
    captureId: string,
    data: Uint8Array,
  ): Promise<{ storagePath: string; sha256: string }>;

  /** Elimina definitivamente la imagen del almacenamiento local. */
  deleteFromPrivateSandbox(storagePath: string): Promise<void>;
}

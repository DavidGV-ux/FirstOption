import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import jpeg from 'jpeg-js';
import type {
  ImageEncoderPort,
} from '@/domain/camera-inspection/ports/image-encoder-port';
import type { DecodedImagePixels } from '@/domain/camera-inspection/ports/frame-analyzer-port';

export class ExpoImageEncoder implements ImageEncoderPort {
  async decodeToRgba(base64OrBytes: string | Uint8Array): Promise<DecodedImagePixels> {
    let bytes: Uint8Array;
    if (typeof base64OrBytes === 'string') {
      bytes = this.base64ToUint8Array(base64OrBytes);
    } else {
      bytes = base64OrBytes;
    }

    try {
      const decoded = jpeg.decode(bytes, {
        useTArray: true,
        formatAsRGBA: true,
        tolerantDecoding: true,
      });
      return {
        data: decoded.data as Uint8Array,
        width: decoded.width,
        height: decoded.height,
      };
    } catch {
      // Fallback si la imagen no se pudo parsear como JPEG estándar
      return {
        data: new Uint8Array(0),
        width: 0,
        height: 0,
      };
    }
  }

  async computeSha256(data: Uint8Array): Promise<string> {
    const digestBuffer = await Crypto.digest(
      Crypto.CryptoDigestAlgorithm.SHA256,
      data.buffer as ArrayBuffer,
    );
    return Array.from(new Uint8Array(digestBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async saveToPrivateSandbox(
    subjectId: string,
    captureId: string,
    data: Uint8Array,
  ): Promise<{ storagePath: string; sha256: string }> {
    const dir = new Directory(Paths.document, 'private-captures', subjectId);
    try {
      await dir.create({ idempotent: true });
    } catch {
      // Directorio ya existente
    }

    const destination = new File(dir, `${captureId}.jpg`);
    if (destination.exists) {
      destination.delete();
    }

    // Escribimos mediante el stream o copia de archivo
    const sha256 = await this.computeSha256(data);
    const writer = destination.writableStream().getWriter();
    await writer.write(data);
    await writer.close();

    return {
      storagePath: destination.uri,
      sha256,
    };
  }

  async deleteFromPrivateSandbox(storagePath: string): Promise<void> {
    const file = new File(storagePath);
    if (file.exists) {
      file.delete();
    }
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const clean = base64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
    const globalBuffer = (globalThis as unknown as { Buffer?: { from(str: string, enc: string): Uint8Array } }).Buffer;
    if (globalBuffer) {
      return new Uint8Array(globalBuffer.from(clean, 'base64'));
    }
    const binary = typeof atob === 'function' ? atob(clean) : '';
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

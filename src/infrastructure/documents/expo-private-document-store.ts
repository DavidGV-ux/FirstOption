import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { PrivateDocument, PrivateDocumentStore, PickedPrivateDocument } from '@/domain/labs/lab-panel';

/**
 * Implementación del port de documentos privados con las APIs
 * nativas de expo-file-system (SDK 58): selector de archivo y sandbox.
 *
 * - El contenido se copia al directorio privado de la app
 *   (`Documents/private-documents/<subject>/<docId>_<ext>`), fuera de
 *   cachés compartidas y fuera de la base de datos (que queda cifrada).
 * - El digest SHA-256 se calcula sobre los bytes reales del archivo.
 * - La base de datos solo guarda metadatos (integridad, retención, tipo).
 */
const MIME_TYPES: string[] = ['application/pdf', 'image/*', 'text/*', 'audio/*'];

export class ExpoPrivateDocumentStore implements PrivateDocumentStore {
  isAvailable(): boolean {
    return true;
  }

  async pick(): Promise<PickedPrivateDocument | null> {
    try {
      const result = await File.pickFileAsync({
        multipleFiles: false,
        mimeTypes: MIME_TYPES,
      });
      if (result.canceled || result.result === null) {
        return null;
      }
      const file = result.result;
      const picked: PickedPrivateDocument = {
        uri: file.uri,
        fileName: file.name,
        mimeType: file.type,
        byteSize: file.size ?? 0,
      };
      return picked;
    } catch {
      // El usuario cancela o el selector no está disponible en la build.
      return null;
    }
  }

  async persist(subjectId: string, picked: PickedPrivateDocument): Promise<PrivateDocument> {
    const documentId = `doc-${randomUUID()}`;
    const source = new File(picked.uri);
    const dir = new Directory(Paths.document, 'private-documents', subjectId);
    try {
      await dir.create({ idempotent: true });
    } catch {
      // El directorio ya existe o no se pudo crear; seguimos.
    }
    const destination = new File(dir, `${documentId}_${picked.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
    if (destination.exists) {
      destination.delete();
    }
    await source.copy(destination);
    const sha256 = await destination.digest('SHA-256');
    const document: PrivateDocument = {
      documentId,
      panelId: null,
      subjectId,
      kind: 'lab_document',
      fileName: picked.fileName,
      mimeType: picked.mimeType || 'application/octet-stream',
      byteSize: picked.byteSize > 0 ? picked.byteSize : destination.info().size ?? picked.byteSize,
      sha256,
      storagePath: destination.uri,
      retentionPolicy: 'until_consent_revoked',
      createdAt: new Date().toISOString(),
    };
    return document;
  }

  async preview(storagePath: string): Promise<void> {
    const file = new File(storagePath);
    if (!file.exists) {
      throw new Error('El documento no está disponible en este dispositivo.');
    }
    await file.preview();
  }
}

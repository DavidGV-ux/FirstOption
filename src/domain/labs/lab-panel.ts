/**
 * Entidades de laboratorio y documentos privados (Incremento 3).
 *
 * Separación de responsabilidades:
 * - El panel agrupa una toma de laboratorio con sus medidas y contexto.
 * - Los documentos son adjuntos de laboratorio (informes) privados: se
 *   registran metadatos + digest local; el contenido vive en el sandbox
 *   privado del dispositivo hasta la integración de Storage.
 * - Las líneas basales son versionadas por sujeto/métrica.
 */

import type { MissionPhase } from '@/domain/observations/observation';

/** Estado de verificación declarado por el participante o el equipo. */
export const LAB_VERIFICATION_STATES = ['unverified', 'verified', 'corrected'] as const;
export type LabVerificationState = (typeof LAB_VERIFICATION_STATES)[number];

/** Estado del panel en la cadena de sincronización local. */
export const LAB_PANEL_SYNC_STATES = ['local_only', 'pending_sync', 'synced', 'sync_failed', 'conflict'] as const;
export type LabPanelSyncState = (typeof LAB_PANEL_SYNC_STATES)[number];

/** Metadatos de un documento adjunto privado. */
export interface PrivateDocument {
  documentId: string;
  panelId: string | null;
  subjectId: string;
  kind: 'lab_document' | 'audio_note' | 'other';
  fileName: string;
  mimeType: string;
  byteSize: number;
  /** SHA-256 del contenido, calculado localmente (integridad, no contenido). */
  sha256: string;
  /** Ruta privada dentro del sandbox de la app (no compartida). */
  storagePath: string;
  retentionPolicy: string;
  createdAt: string;
}

/** Llamada de archivo al port: resultado de pick o error controlado. */
export interface PickedPrivateDocument {
  uri: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
}

/** Persistencia local de documentos privados (sandbox de la app). */
export interface PrivateDocumentStore {
  isAvailable(): boolean;
  /** null si el participante canceló el selector. */
  pick(): Promise<PickedPrivateDocument | null>;
  /** Copia el archivo al sandbox privado y registra metadatos. Devuelve el path guardado. */
  persist(subjectId: string, picked: PickedPrivateDocument): Promise<PrivateDocument>;
  /** Visualización del adjunto (preview nativo). */
  preview(storagePath: string): Promise<void>;
}
/** Medida de laboratorio persistida con su trazabilidad de conversión. */
export interface LabResultRecord {
  resultId: string;
  panelId: string;
  metricId: string;
  valueOriginal: number;
  unitOriginal: string;
  valueNormalized: number | null;
  unitNormalized: string | null;
  conversionId: string | null;
  conversionVersion: number | null;
  qualityState: string;
  createdAt: string;
}

/** Panel con sus resultados y documentos. */
export interface LabPanelWithResults {
  panel: LabPanel;
  results: LabResultRecord[];
  documents: PrivateDocument[];
}

export interface LabPanel {
  panelId: string;
  subjectId: string;
  /** Sesión local que agrupa al panel como registro (toma de la muestra). */
  sessionId: string;
  missionPhase: MissionPhase;
  collectedAt: string;
  reportedAt: string | null;
  laboratory: string | null;
  sampleId: string | null;
  method: string | null;
  referenceIntervalOriginal: number | null;
  verificationState: LabVerificationState;
  note: string | null;
  createdAt: string;
}

/** Resultado de crear/obtener una línea basal versionada. */
export interface BaselineVersion {
  baselineId: string;
  subjectId: string;
  metricId: string;
  version: number;
  periodStart: string;
  periodEnd: string;
  method: string;
  methodVersion: number;
  parametersJson: string;
  conditionsJson: string;
  state: 'provisional' | 'reviewed' | 'superseded';
  sourceObservationIds: string[];
  computedAt: string;
  computedBy: string;
}

/** Entrada para registrar una línea basal a partir de observaciones. */
export interface CreateBaselineInput {
  subjectId: string;
  metricId: string;
  periodStart: string;
  periodEnd: string;
  method: string;
  methodVersion: number;
  parametersJson: string;
  conditionsJson: string;
  sourceObservationIds: string[];
}

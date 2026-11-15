import type { MissionPhase } from '../observations/observation';

/**
 * Instantáneas del historial remoto (Supabase) que se importan a SQLite.
 *
 * Reglas:
 * - Solo se importan datos del propio `subject_id` autenticado.
 * - La importación es idempotente y NO sobrescribe filas locales
 *   existentes (nunca hay last-write-wins silencioso).
 * - Los identificadores locales reutilizan `client_request_id`, que es
 *   el mismo id determinista que usa la app al guardar y al subir.
 */
export interface RemoteSessionSnapshot {
  /** Id local de la sesión (client_request_id remoto). */
  localSessionId: string;
  remoteSessionId: string;
  subjectId: string;
  missionPhase: MissionPhase;
  startedAt: string;
  createdAt: string;
}

export interface RemoteObservationSnapshot {
  /** Id local de la observación (client_request_id remoto). */
  localObservationId: string;
  localSessionId: string;
  metricId: string;
  valueOriginal: number;
  unitOriginal: string | null;
  observedAt: string;
  qualityState: 'ok' | 'suspect' | 'invalid';
  createdAt: string;
}

export interface RemoteHistoryImportResult {
  sessionsImported: number;
  observationsImported: number;
  /** Filas descartadas por no poder mapearse con honestidad (sin valor,
   * métrica desconocida o sesión ausente). Nunca se inventan valores. */
  observationsSkipped: number;
}

/** Puerto de importación del historial remoto hacia el almacén local. */
export interface RemoteHistoryImporter {
  importRemoteHistory(input: {
    sessions: readonly RemoteSessionSnapshot[];
    observations: readonly RemoteObservationSnapshot[];
  }): Promise<RemoteHistoryImportResult>;
}

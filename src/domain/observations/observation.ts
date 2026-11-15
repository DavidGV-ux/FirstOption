/**
 * Entidad de observación: una medición puntual de una métrica,
 * dentro de una sesión de registro.
 */

/** Fases de misión. La fase se registra; el análisis la usa como condición. */
export const MISSION_PHASES = ['preflight', 'inflight', 'postflight'] as const;
export type MissionPhase = (typeof MISSION_PHASES)[number];

export const MISSION_PHASE_LABELS_ES: Record<MissionPhase, string> = {
  preflight: 'Preflight',
  inflight: 'En vuelo',
  postflight: 'Postflight',
};

/** Estado de sincronización local. Ningún estado borra datos. */
export const SYNC_STATES = [
  'local_only',
  'pending_sync',
  'synced',
  'sync_failed',
  'conflict',
] as const;
export type SyncState = (typeof SYNC_STATES)[number];

/** Estado de calidad de captura. No es un veredicto clínico. */
export const QUALITY_STATES = ['ok', 'suspect', 'invalid'] as const;
export type QualityState = (typeof QUALITY_STATES)[number];

/**
 * Fuentes de datos externos de referencia (p. ej. NASA OSDR OSD-575).
 * Se guardan localmente para exploración, pero NO representan mediciones
 * de la persona usuaria: nunca se suben a su cuenta remota.
 */
export const EXTERNAL_REFERENCE_SOURCES = ['nasa_osdr_osd575'] as const;

export function isExternalReferenceSource(source: string): boolean {
  return (EXTERNAL_REFERENCE_SOURCES as readonly string[]).includes(source);
}

export interface Observation {
  observationId: string;
  sessionId: string;
  metricId: string;
  /** Valor en la unidad original. Para escalas ordinales: entero. */
  valueOriginal: number;
  unitOriginal: string | null;
  /** Solo con conversión verificada (Incremento 3); null por defecto. */
  valueNormalized: number | null;
  unitNormalized: string | null;
  /** Momento de la toma, ISO 8601 UTC. */
  observedAt: string;
  /** Fecha local de la toma (YYYY-MM-DD), para agrupación diaria. */
  localDate: string;
  qualityState: QualityState;
  syncState: SyncState;
  createdAt: string;
}

export interface MeasurementSession {
  sessionId: string;
  subjectId: string;
  missionPhase: MissionPhase;
  /** Momento del registro, ISO 8601 UTC. */
  recordedAt: string;
  recordedLocalDate: string;
  source: string;
  note: string | null;
  syncState: SyncState;
  createdAt: string;
}

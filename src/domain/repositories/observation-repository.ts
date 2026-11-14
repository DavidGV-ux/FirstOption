import type {
  MeasurementSession,
  MissionPhase,
  Observation,
  QualityState,
  SyncState,
} from '../observations/observation';
import type { MetricDefinition } from '../metrics/metric-definition';
/** Una sesión con sus observaciones, tal como sale del repositorio. */
export interface SessionWithObservations {
  session: MeasurementSession;
  observations: Observation[];
}

/**
 * Puerto del repositorio de registros. La UI nunca consulta tablas:
 * solo habla con esta interfaz a través de casos de uso.
 */
export interface ObservationRepository {
  /** Guarda sesión + observaciones en una sola transacción. */
  saveSessionWithObservations(
    session: MeasurementSession,
    observations: readonly NewObservationInput[],
  ): Promise<void>;

  /** Sesiones recientes con observaciones, más antigua al final. */
  listRecentSessions(limit: number): Promise<SessionWithObservations[]>;

  /** Cuenta operaciones pendientes de sincronización (aún locales). */
  countPendingSync(): Promise<{ sessions: number; observations: number }>;

  /** Catálogo de métricas disponible localmente. */
  listMetricDefinitions(): Promise<MetricDefinition[]>;
}

/** Identidad local del participante (sustituida por auth en Incremento 2). */
export interface SubjectIdentity {
  subjectId: string;
}

export interface SubjectIdentityStore {
  getOrCreateSubjectId(): Promise<string>;
}

/** Tipo auxiliar para construir observaciones nuevas. */
export interface NewObservationInput {
  metricId: string;
  valueOriginal: number;
  unitOriginal: string | null;
  observedAt: string;
  localDate: string;
  qualityState?: QualityState;
}

export type { MissionPhase, SyncState, QualityState };

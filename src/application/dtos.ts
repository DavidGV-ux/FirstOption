import type { NewObservationInput } from '@/domain/repositories/observation-repository';
import type { MissionPhase } from '@/domain/observations/observation';

/** DTO de entrada del caso de uso de registro diario. */
export interface RegisterDailyLogDto {
  observedAt: string;
  missionPhase: MissionPhase;
  mood: number | null;
  stress: number | null;
  fatigue: number | null;
  sleepQuality: number | null;
  sleepHours: number | null;
  heartRate: number | null;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  spo2: number | null;
  symptoms: Record<string, boolean>;
  note: string | null;
}

/** Resumen del resultado de un registro guardado. */
export interface SavedLogSummary {
  sessionId: string;
  observationCount: number;
  /** El guardado se confirma sin esperar red (offline-first). */
  savedOffline: true;
}

export type { NewObservationInput };

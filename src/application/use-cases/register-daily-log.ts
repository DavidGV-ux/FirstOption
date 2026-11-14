import { ValidationError, parseDailyLogInput } from '@/domain/observations/daily-log-schema';
import type { Clock } from '@/domain/shared/clock';
import type { IdGenerator } from '@/domain/shared/ids';
import type {
  MeasurementSession,
  MissionPhase,
  QualityState,
  SyncState,
} from '@/domain/observations/observation';
import type {
  NewObservationInput,
  ObservationRepository,
  SubjectIdentityStore,
} from '@/domain/repositories/observation-repository';
import type {
  RegisterDailyLogDto,
  SavedLogSummary,
} from '@/application/dtos';

/** Fecha local YYYY-MM-DD a partir de un instante ISO, sin depender del reloj del sistema. */
export function localDateFromIso(instantIso: string): string {
  const d = new Date(instantIso);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Instante inválido');
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Caso de uso: registrar un seguimiento diario.
 *
 * Contrato:
 * - Valida la entrada y construye la sesión + observaciones.
 * - Guarda en una transacción y confirma sin esperar red.
 * - Un fallo de análisis no impide guardar la medición.
 * - Un error de validación no deja datos a medias.
 */
export class RegisterDailyLogUseCase {
  constructor(
    private readonly repository: ObservationRepository,
    private readonly identity: SubjectIdentityStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(dto: RegisterDailyLogDto): Promise<SavedLogSummary> {
    // 1) Validación de entrada (reglas puras).
    const input = parseDailyLogInput(dto);

    // Regla temporal: no se aceptan tomas futuras.
    const nowIso = this.clock.nowIso();
    if (Date.parse(input.observedAt) > Date.parse(nowIso) + 60_000) {
      throw new ValidationError({
        observedAt: 'La fecha de la toma no puede ser futura',
      });
    }

    // 2) Construcción de la sesión y de las observaciones.
    const sessionId = this.ids.uuid();
    const subjectId = await this.identity.getOrCreateSubjectId();
    const createdAt = nowIso;
    const localDate = localDateFromIso(input.observedAt);

    const session: MeasurementSession = {
      sessionId,
      subjectId,
      missionPhase: input.missionPhase,
      recordedAt: createdAt,
      recordedLocalDate: localDate,
      source: 'manual_entry',
      note: input.note && input.note.length > 0 ? input.note : null,
      syncState: 'local_only' satisfies SyncState,
      createdAt,
    };

    const observations = buildObservations(input, localDate);
    if (observations.length === 0) {
      throw new ValidationError({ _form: 'Registra al menos una medición o síntoma' });
    }

    // 3) Guardado transaccional; la UI recibe confirmación inmediata.
    await this.repository.saveSessionWithObservations(session, observations);

    return {
      sessionId,
      observationCount: observations.length,
      savedOffline: true,
    };
  }
}

/** Mapea la entrada validada a observaciones del catálogo. */
export function buildObservations(
  input: RegisterDailyLogDto,
  localDate: string,
): NewObservationInput[] {
  const result: NewObservationInput[] = [];
  const push = (
    metricId: string,
    valueOriginal: number,
    unitOriginal: string | null,
  ) => {
    result.push({
      metricId,
      valueOriginal,
      unitOriginal,
      observedAt: input.observedAt,
      localDate,
      qualityState: 'ok' as QualityState,
    });
  };

  if (input.mood !== null) push('mood_self_report', input.mood, null);
  if (input.stress !== null) push('stress_self_report', input.stress, null);
  if (input.fatigue !== null) push('fatigue_self_report', input.fatigue, null);
  if (input.sleepQuality !== null) push('sleep_quality_self_report', input.sleepQuality, null);
  if (input.sleepHours !== null) push('sleep_duration', input.sleepHours, 'h');
  if (input.heartRate !== null) push('heart_rate', input.heartRate, 'lpm');
  if (input.bpSystolic !== null) push('bp_systolic', input.bpSystolic, 'mmHg');
  if (input.bpDiastolic !== null) push('bp_diastolic', input.bpDiastolic, 'mmHg');
  if (input.spo2 !== null) push('spo2', input.spo2, '%');

  for (const [metricId, present] of Object.entries(input.symptoms)) {
    if (present === true) {
      push(metricId, 1, null);
    }
  }
  return result;
}

export type { MissionPhase };

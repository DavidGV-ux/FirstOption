import {
  parseInspectionInput,
  type InspectionInput,
} from '@/domain/observations/inspection-schema';
import type { Clock } from '@/domain/shared/clock';
import type { IdGenerator } from '@/domain/shared/ids';
import type {
  MeasurementSession,
  QualityState,
  SyncState,
} from '@/domain/observations/observation';
import type {
  NewObservationInput,
  ObservationRepository,
  SubjectIdentityStore,
} from '@/domain/repositories/observation-repository';
import type { DocumentInspectionDto, SavedLogSummary } from '@/application/dtos';
import { localDateFromIso } from './register-daily-log';

/**
 * Caso de uso: documentar una inspección pupilar hecha con la linterna.
 *
 * Contrato honesto:
 * - La linterna no mide ni deriva valores: la única fuente es lo que la
 *   persona usuaria observa y describe (nota y/o respuesta explícita
 *   sobre alteración visual, síntoma del catálogo v1).
 * - No hay diagnóstico ni interpretación clínica; el registro describe.
 * - Guarda en una transacción (sesión + observación si aplica) con la
 *   entrada de outbox en la misma transacción (offline-first).
 */
export class DocumentPupilInspectionUseCase {
  constructor(
    private readonly repository: ObservationRepository,
    private readonly identity: SubjectIdentityStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(dto: DocumentInspectionDto): Promise<SavedLogSummary> {
    const input: InspectionInput = parseInspectionInput(dto);

    const nowIso = this.clock.nowIso();
    const sessionId = this.ids.uuid();
    const subjectId = await this.identity.getOrCreateSubjectId();
    const localDate = localDateFromIso(nowIso);

    // Nota de sesión: etiqueta factual + descripción de la persona.
    const userNote = input.note !== null && input.note.length > 0 ? input.note : null;
    const sessionNote = userNote === null
      ? 'Inspección pupilar con linterna'
      : `Inspección pupilar con linterna: ${userNote}`;

    const session: MeasurementSession = {
      sessionId,
      subjectId,
      missionPhase: input.missionPhase,
      recordedAt: nowIso,
      recordedLocalDate: localDate,
      // Fuente explícita: no es un registro diario común.
      source: 'pupil_inspection',
      note: sessionNote,
      syncState: 'local_only' satisfies SyncState,
      createdAt: nowIso,
    };

    const observations: NewObservationInput[] = [];
    if (input.visualDisturbance !== null) {
      observations.push({
        metricId: 'symptom_visual_disturbance',
        // 'si' → 1 (presente), 'no' → 0 (ausente). Reporte observado,
        // no una medición derivada de la cámara.
        valueOriginal: input.visualDisturbance === 'si' ? 1 : 0,
        unitOriginal: null,
        observedAt: nowIso,
        localDate,
        qualityState: 'ok' satisfies QualityState,
      });
    }

    await this.repository.saveSessionWithObservations(session, observations);

    return {
      sessionId,
      observationCount: observations.length,
      savedOffline: true,
    };
  }
}

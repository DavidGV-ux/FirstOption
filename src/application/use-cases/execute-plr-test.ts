import type { Clock } from '@/domain/shared/clock';
import type { IdGenerator } from '@/domain/shared/ids';
import type { SubjectIdentityStore, ObservationRepository } from '@/domain/repositories/observation-repository';
import type { MissionPhase, MeasurementSession, Observation } from '@/domain/observations/observation';
import type { VisualDisturbanceAnswer } from '@/domain/observations/inspection-schema';
import type { PlrResult } from '@/domain/camera-inspection/entities/plr-test';
import { localDateFromIso } from './register-daily-log';

export interface SavePlrTestDto {
  result: PlrResult;
  missionPhase: MissionPhase;
  visualDisturbance?: VisualDisturbanceAnswer | null;
  note?: string | null;
}

export class ExecutePlrTestUseCase {
  constructor(
    private readonly repo: ObservationRepository,
    private readonly identity: SubjectIdentityStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async saveAsObservationSession(dto: SavePlrTestDto): Promise<{ sessionId: string; observationCount: number }> {
    const { result, missionPhase, visualDisturbance = null, note } = dto;
    const nowIso = this.clock.nowIso();
    const sessionId = `ses-plr-${this.ids.uuid()}`;
    const subjectId = await this.identity.getOrCreateSubjectId();
    const localDate = localDateFromIso(nowIso);

    const userNote = note && note.trim().length > 0 ? note.trim() : null;
    const eyeLabel = result.eyeSide === 'left' ? 'Ojo izquierdo' : 'Ojo derecho';
    const interpretationLabel =
      result.interpretation === 'prompt'
        ? 'Reactivo / Ágil'
        : result.interpretation === 'delayed'
          ? 'Retardado (Alerta reducida / Fatiga central)'
          : result.interpretation === 'sluggish'
            ? 'Perezoso (Constricción lenta)'
            : 'Inconcluso';

    const latencyText = result.latencyMs !== null ? `${result.latencyMs} ms` : 'N/D';
    const constrictionVelText =
      result.constrictionVelocityPercentPerSec !== null
        ? `${result.constrictionVelocityPercentPerSec} %/s`
        : 'N/D';
    const redilationVelText =
      result.redilationVelocityPercentPerSec !== null
        ? `${result.redilationVelocityPercentPerSec} %/s`
        : 'N/D';

    const detailSummary = `[PLR ${eyeLabel}] Latencia: ${latencyText} | Constricción: ${result.constrictionAmplitudePercent}% a ${constrictionVelText} | Redilatación: ${redilationVelText} | Estado: ${interpretationLabel} (Confianza: ${Math.round(result.confidence * 100)}%)`;

    const sessionNote = userNote
      ? `${detailSummary}. Nota: ${userNote}`
      : detailSummary;

    const session: MeasurementSession = {
      sessionId,
      subjectId,
      missionPhase,
      recordedAt: nowIso,
      recordedLocalDate: localDate,
      source: 'pupil_inspection',
      note: sessionNote,
      syncState: 'local_only',
      createdAt: nowIso,
    };

    const observations: Observation[] = [];

    if (visualDisturbance !== null) {
      observations.push({
        observationId: `obs-plr-dist-${this.ids.uuid()}`,
        sessionId,
        metricId: 'symptom_visual_disturbance',
        valueOriginal: visualDisturbance === 'si' ? 1 : 0,
        unitOriginal: null,
        valueNormalized: null,
        unitNormalized: null,
        observedAt: nowIso,
        localDate,
        qualityState: 'ok',
        syncState: 'local_only',
        createdAt: nowIso,
      });
    }

    await this.repo.saveSessionWithObservations(session, observations);

    return {
      sessionId,
      observationCount: observations.length,
    };
  }
}

import type { Clock } from '@/domain/shared/clock';
import type { IdGenerator } from '@/domain/shared/ids';
import type { SubjectIdentityStore, ObservationRepository } from '@/domain/repositories/observation-repository';
import type { MissionPhase, MeasurementSession, Observation } from '@/domain/observations/observation';
import type { PulseEstimate } from '@/domain/camera-inspection/entities/pulse-estimate';
import { PpgProcessor, type PpgSample } from '@/infrastructure/camera/ppg-processor';
import { localDateFromIso } from './register-daily-log';

export interface SavePulseVitalsDto {
  estimate: PulseEstimate;
  missionPhase: MissionPhase;
  note?: string | null;
}

export class EstimatePulseVitalsUseCase {
  private readonly processor = new PpgProcessor();

  constructor(
    private readonly repo: ObservationRepository,
    private readonly identity: SubjectIdentityStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  processSamples(samples: readonly PpgSample[]): PulseEstimate {
    return this.processor.process(samples);
  }

  isFingerDetected(sample: PpgSample): boolean {
    return this.processor.isFingerDetected(sample);
  }

  async saveAsObservationSession(dto: SavePulseVitalsDto): Promise<{ sessionId: string; count: number }> {
    const { estimate, missionPhase, note } = dto;
    const nowIso = this.clock.nowIso();
    const sessionId = `ses-ppg-${this.ids.uuid()}`;
    const subjectId = await this.identity.getOrCreateSubjectId();
    const localDate = localDateFromIso(nowIso);

    const userNote = note && note.trim().length > 0 ? note.trim() : null;
    const sessionNote = userNote
      ? `Estimación óptica de frecuencia cardíaca con linterna: ${userNote}`
      : `Estimación óptica de frecuencia cardíaca con linterna (BPM: ${estimate.bpm}, SQI: ${Math.round(estimate.sqi * 100)}%)`;

    const session: MeasurementSession = {
      sessionId,
      subjectId,
      missionPhase,
      recordedAt: nowIso,
      recordedLocalDate: localDate,
      source: 'ppg_flashlight',
      note: sessionNote,
      syncState: 'local_only',
      createdAt: nowIso,
    };

    const observations: Observation[] = [
      {
        observationId: `obs-hr-${this.ids.uuid()}`,
        sessionId,
        metricId: 'heart_rate',
        valueOriginal: estimate.estimatedVitals.heartRate,
        unitOriginal: 'lpm',
        valueNormalized: null,
        unitNormalized: null,
        observedAt: nowIso,
        localDate,
        qualityState: estimate.quality === 'good' || estimate.quality === 'acceptable' ? 'ok' : 'suspect',
        syncState: 'local_only',
        createdAt: nowIso,
      },
    ];

    await this.repo.saveSessionWithObservations(session, observations);

    return {
      sessionId,
      count: observations.length,
    };
  }
}

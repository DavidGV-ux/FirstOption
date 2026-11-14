import type { Clock } from '@/domain/shared/clock';
import type { IdGenerator } from '@/domain/shared/ids';
import type { MissionPhase } from '@/domain/observations/observation';
import type {
  MeasurementSession,
  SyncState,
} from '@/domain/observations/observation';
import type { ObservationRepository, SubjectIdentityStore } from '@/domain/repositories/observation-repository';
import type { LabRepository, SaveLabPanelInput } from '@/domain/repositories/lab-repository';
import { localDateFromIso } from './register-daily-log';

export interface RegisterLabPanelDto {
  metricId: string;
  valueOriginal: number;
  unitOriginal: string;
  valueNormalized: number | null;
  unitNormalized: string | null;
  conversionId: string | null;
  conversionVersion: number | null;
  qualityState: string;
  missionPhase: MissionPhase;
  collectedAt: string;
  reportedAt: string | null;
  laboratory: string | null;
  sampleId: string | null;
  method: string | null;
  referenceIntervalOriginal: number | null;
  verificationState: 'unverified' | 'verified' | 'corrected';
  note: string | null;
}

export interface SavedLabPanelSummary {
  panelId: string;
  sessionId: string;
  savedOffline: true;
}

export class RegisterLabPanelUseCase {
  constructor(
    private readonly observations: ObservationRepository,
    private readonly lab: LabRepository,
    private readonly identity: SubjectIdentityStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(dto: RegisterLabPanelDto): Promise<SavedLabPanelSummary> {
    const subjectId = await this.identity.getOrCreateSubjectId();
    const nowIso = this.clock.nowIso();
    const recordedAt = dto.collectedAt;
    const localDate = localDateFromIso(recordedAt);
    const sessionId = this.ids.uuid();
    const panelId = `panel-${this.ids.uuid()}`;

    const session: MeasurementSession = {
      sessionId,
      subjectId,
      missionPhase: dto.missionPhase,
      recordedAt,
      recordedLocalDate: localDate,
      source: 'lab_panel',
      note: dto.note,
      syncState: 'local_only' satisfies SyncState,
      createdAt: nowIso,
    };
    // Sesión (sin observaciones diarias) para agrupar el panel.
    await this.observations.saveSessionWithObservations(session, []);

    const input: SaveLabPanelInput = {
      panel: {
        panelId,
        subjectId,
        sessionId,
        missionPhase: dto.missionPhase,
        collectedAt: dto.collectedAt,
        reportedAt: dto.reportedAt,
        laboratory: dto.laboratory,
        sampleId: dto.sampleId,
        method: dto.method,
        referenceIntervalOriginal: dto.referenceIntervalOriginal,
        verificationState: dto.verificationState,
        note: dto.note,
        createdAt: nowIso,
      },
      results: [
        {
          metricId: dto.metricId,
          valueOriginal: dto.valueOriginal,
          unitOriginal: dto.unitOriginal,
          valueNormalized: dto.valueNormalized,
          unitNormalized: dto.unitNormalized,
          conversionId: dto.conversionId,
          conversionVersion: dto.conversionVersion,
          qualityState: dto.qualityState,
        },
      ],
      documents: [],
    };
    await this.lab.saveLabPanel(input);

    return { panelId, sessionId, savedOffline: true };
  }
}

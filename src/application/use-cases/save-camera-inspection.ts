import type { Clock } from '@/domain/shared/clock';
import type { IdGenerator } from '@/domain/shared/ids';
import type { InspectionRepositoryPort } from '@/domain/camera-inspection/ports/inspection-repository-port';
import type { ImageEncoderPort } from '@/domain/camera-inspection/ports/image-encoder-port';
import type { ObservationRepository } from '@/domain/repositories/observation-repository';
import type { CameraInspectionSession } from '@/domain/camera-inspection/entities/inspection-session';
import type { CameraCapture, EyeSide, ApproximateDistance } from '@/domain/camera-inspection/entities/camera-capture';
import type { FrameAnalysis } from '@/domain/camera-inspection/entities/frame-analysis';
import type { PupilEstimate } from '@/domain/camera-inspection/entities/pupil-estimate';
import type { InspectionComparison } from '@/domain/camera-inspection/entities/inspection-comparison';
import type { CaptureMode } from '@/domain/camera-inspection/value-objects/capture-mode';
import type { LightingCondition } from '@/domain/camera-inspection/value-objects/lighting-condition';
import type { VisualDisturbanceAnswer } from '@/domain/observations/inspection-schema';
import type { MeasurementSession, Observation } from '@/domain/observations/observation';
import { localDateFromIso } from './register-daily-log';

export interface SaveCameraInspectionDto {
  session: CameraInspectionSession;
  eyeSide: EyeSide;
  captureMode: CaptureMode;
  lightingCondition: LightingCondition;
  approximateDistance: ApproximateDistance;
  metrics: FrameAnalysis | null;
  estimate: PupilEstimate | null;
  comparison?: InspectionComparison | null;
  visualDisturbance: VisualDisturbanceAnswer | null;
  note: string | null;
  saveImageConsent: boolean;
  rawImageBytes?: Uint8Array | null;
}

export interface SaveCameraInspectionResult {
  sessionId: string;
  captureId: string;
  imageSaved: boolean;
  imageSha256: string | null;
  savedOffline: boolean;
}

export class SaveCameraInspectionUseCase {
  constructor(
    private readonly inspectionRepo: InspectionRepositoryPort,
    private readonly observationRepo: ObservationRepository,
    private readonly encoder: ImageEncoderPort,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(dto: SaveCameraInspectionDto): Promise<SaveCameraInspectionResult> {
    const nowIso = this.clock.nowIso();
    const captureId = `cap-${this.ids.uuid()}`;
    const localDate = localDateFromIso(nowIso);

    let imageStoragePath: string | null = null;
    let imageSha256: string | null = null;
    let imageSaved = false;

    // Persistencia opcional de imagen solo con consentimiento explícito del usuario
    if (dto.saveImageConsent && dto.rawImageBytes && dto.rawImageBytes.length > 0) {
      const persisted = await this.encoder.saveToPrivateSandbox(
        dto.session.subjectId,
        captureId,
        dto.rawImageBytes,
      );
      imageStoragePath = persisted.storagePath;
      imageSha256 = persisted.sha256;
      imageSaved = true;
    }

    const qualityStatus = dto.estimate?.qualityStatus ?? (dto.metrics ? 'acceptable' : 'limited');

    const capture: CameraCapture = {
      captureId,
      sessionId: dto.session.sessionId,
      capturedAt: nowIso,
      eyeSide: dto.eyeSide,
      captureMode: dto.captureMode,
      lightingCondition: dto.lightingCondition,
      approximateDistance: dto.approximateDistance,
      imageSaved,
      imageStoragePath,
      imageSha256,
      qualityStatus,
      qualityNotes: dto.note,
      createdAt: nowIso,
    };

    const sessionWithEnd: CameraInspectionSession = {
      ...dto.session,
      endedAt: nowIso,
    };

    // 1. Guardar en repositorio de inspecciones
    await this.inspectionRepo.saveInspection({
      session: sessionWithEnd,
      capture,
      metrics: dto.metrics,
      estimate: dto.estimate,
      comparison: dto.comparison,
    });

    // 2. Guardar sesión y síntoma en el registro clínico diario general para el historial
    const userNote = dto.note !== null && dto.note.trim().length > 0 ? dto.note.trim() : null;
    const sessionNote = userNote === null
      ? `Inspección pupilar asistida (${dto.eyeSide === 'left' ? 'ojo izq.' : 'ojo der.'})`
      : `Inspección pupilar asistida (${dto.eyeSide === 'left' ? 'ojo izq.' : 'ojo der.'}): ${userNote}`;

    const generalSession: MeasurementSession = {
      sessionId: dto.session.sessionId,
      subjectId: dto.session.subjectId,
      missionPhase: dto.session.missionPhase,
      recordedAt: nowIso,
      recordedLocalDate: localDate,
      source: 'camera_assisted_inspection',
      note: sessionNote,
      syncState: 'local_only',
      createdAt: nowIso,
    };

    const observations: Observation[] = [];
    if (dto.visualDisturbance !== null) {
      observations.push({
        observationId: `obs-${this.ids.uuid()}`,
        sessionId: dto.session.sessionId,
        metricId: 'symptom_visual_disturbance',
        valueOriginal: dto.visualDisturbance === 'si' ? 1 : 0,
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

    await this.observationRepo.saveSessionWithObservations(generalSession, observations);

    return {
      sessionId: dto.session.sessionId,
      captureId,
      imageSaved,
      imageSha256,
      savedOffline: true,
    };
  }
}

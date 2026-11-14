import { Platform } from 'react-native';
import type { Clock } from '@/domain/shared/clock';
import type { IdGenerator } from '@/domain/shared/ids';
import type { SubjectIdentityStore } from '@/domain/repositories/observation-repository';
import type { MissionPhase } from '@/domain/observations/observation';
import type { CameraInspectionSession } from '@/domain/camera-inspection/entities/inspection-session';

export interface StartCameraInspectionDto {
  missionPhase: MissionPhase;
  cameraFacing?: 'front' | 'back';
}

export class StartCameraInspectionUseCase {
  constructor(
    private readonly identity: SubjectIdentityStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(dto: StartCameraInspectionDto): Promise<CameraInspectionSession> {
    const subjectId = await this.identity.getOrCreateSubjectId();
    const sessionId = `cis-${this.ids.uuid()}`;
    const nowIso = this.clock.nowIso();

    const osVersion = `${Platform.OS} ${String(Platform.Version)}`;
    const deviceModel = Platform.select({
      ios: 'iOS Device',
      android: 'Android Device',
      default: 'Unknown Device',
    });

    const session: CameraInspectionSession = {
      sessionId,
      subjectId,
      missionPhase: dto.missionPhase,
      startedAt: nowIso,
      endedAt: null,
      deviceModel,
      osVersion,
      appVersion: '1.0.0',
      cameraFacing: dto.cameraFacing ?? 'front',
      syncState: 'local_only',
      createdAt: nowIso,
    };

    return session;
  }
}

import type { MissionPhase, SyncState } from '@/domain/observations/observation';

/**
 * Entidad: Sesión de inspección asistida por cámara.
 */
export interface CameraInspectionSession {
  sessionId: string;
  subjectId: string;
  missionPhase: MissionPhase;
  startedAt: string;
  endedAt: string | null;
  deviceModel: string;
  osVersion: string;
  appVersion: string;
  cameraFacing: 'front' | 'back';
  syncState: SyncState;
  createdAt: string;
}

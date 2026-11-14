import type { SqlDriver } from '../database/driver';
import type {
  InspectionRepositoryPort,
  InspectionRecord,
  SaveInspectionTransactionInput,
} from '@/domain/camera-inspection/ports/inspection-repository-port';
import type { CameraInspectionSession } from '@/domain/camera-inspection/entities/inspection-session';
import type { CameraCapture, EyeSide } from '@/domain/camera-inspection/entities/camera-capture';
import type { FrameAnalysis } from '@/domain/camera-inspection/entities/frame-analysis';
import type { PupilEstimate } from '@/domain/camera-inspection/entities/pupil-estimate';
import type { InspectionComparison } from '@/domain/camera-inspection/entities/inspection-comparison';

export class SqliteInspectionRepository implements InspectionRepositoryPort {
  constructor(private readonly driver: SqlDriver) {}

  async saveInspection(input: SaveInspectionTransactionInput): Promise<void> {
    const { session, capture, metrics, estimate, comparison } = input;

    await this.driver.withTransaction(async () => {
      // 1. Sesión
      await this.driver.run(
        `INSERT INTO camera_inspection_sessions (
          session_id, subject_id, mission_phase, started_at, ended_at,
          device_model, os_version, app_version, camera_facing, sync_state, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.sessionId,
          session.subjectId,
          session.missionPhase,
          session.startedAt,
          session.endedAt,
          session.deviceModel,
          session.osVersion,
          session.appVersion,
          session.cameraFacing,
          session.syncState,
          session.createdAt,
        ],
      );

      // 2. Captura
      await this.driver.run(
        `INSERT INTO camera_captures (
          capture_id, session_id, captured_at, eye_side, capture_mode,
          lighting_condition, approximate_distance, image_saved,
          image_storage_path, image_sha256, quality_status, quality_notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          capture.captureId,
          capture.sessionId,
          capture.capturedAt,
          capture.eyeSide,
          capture.captureMode,
          capture.lightingCondition,
          capture.approximateDistance,
          capture.imageSaved ? 1 : 0,
          capture.imageStoragePath,
          capture.imageSha256,
          capture.qualityStatus,
          capture.qualityNotes,
          capture.createdAt,
        ],
      );

      // 3. Métricas de fotograma
      if (metrics !== null) {
        await this.driver.run(
          `INSERT INTO capture_quality_metrics (
            capture_id, brightness, contrast, sharpness, motion_score,
            blink_detected, eye_open, eye_in_guide, lighting_score,
            resolution_width, resolution_height, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            metrics.captureId,
            metrics.brightness,
            metrics.contrast,
            metrics.sharpness,
            metrics.motionScore,
            metrics.blinkDetected ? 1 : 0,
            metrics.eyeOpen ? 1 : 0,
            metrics.eyeInGuide ? 1 : 0,
            metrics.lightingScore,
            metrics.resolutionWidth,
            metrics.resolutionHeight,
            metrics.createdAt,
          ],
        );
      }

      // 4. Estimación pupilar
      if (estimate !== null) {
        await this.driver.run(
          `INSERT INTO pupil_estimates (
            estimate_id, capture_id, method_code, method_version,
            relative_scale, confidence, quality_status, limitations, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            estimate.estimateId,
            estimate.captureId,
            estimate.methodCode,
            estimate.methodVersion,
            estimate.relativeScale,
            estimate.confidence,
            estimate.qualityStatus,
            JSON.stringify(estimate.limitations),
            estimate.createdAt,
          ],
        );
      }

      // 5. Comparación (si se realizó en esta toma)
      if (comparison) {
        await this.driver.run(
          `INSERT INTO inspection_comparisons (
            comparison_id, subject_id, baseline_capture_id, current_capture_id,
            relative_change, direction, confidence, comparable, limitations, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            comparison.comparisonId,
            comparison.subjectId,
            comparison.baselineCaptureId,
            comparison.currentCaptureId,
            comparison.relativeChange,
            comparison.direction,
            comparison.confidence,
            comparison.comparable ? 1 : 0,
            JSON.stringify(comparison.limitations),
            comparison.createdAt,
          ],
        );
      }

      // 6. Registro de sincronización outbox (solo metadatos, JAMÁS imágenes)
      const outboxSessionPayload = JSON.stringify({
        session_id: session.sessionId,
        subject_id: session.subjectId,
        mission_phase: session.missionPhase,
        recorded_at: session.startedAt,
        source: 'camera_assisted_inspection',
        created_at: session.createdAt,
      });

      await this.driver.run(
        `INSERT OR REPLACE INTO sync_outbox (
          outbox_id, entity_type, entity_id, operation, payload, created_at, state
        ) VALUES (?, 'measurement_session', ?, 'upsert', ?, ?, 'pending')`,
        [`outbox-inspec-${session.sessionId}`, session.sessionId, outboxSessionPayload, session.createdAt],
      );
    });
  }

  async getLatestCapture(subjectId: string, eyeSide: EyeSide): Promise<InspectionRecord | null> {
    const row = await this.driver.getFirst<{
      // session
      session_id: string;
      subject_id: string;
      mission_phase: CameraInspectionSession['missionPhase'];
      started_at: string;
      ended_at: string | null;
      device_model: string;
      os_version: string;
      app_version: string;
      camera_facing: 'front' | 'back';
      session_sync_state: CameraInspectionSession['syncState'];
      session_created_at: string;
      // capture
      capture_id: string;
      captured_at: string;
      eye_side: EyeSide;
      capture_mode: CameraCapture['captureMode'];
      lighting_condition: CameraCapture['lightingCondition'];
      approximate_distance: CameraCapture['approximateDistance'];
      image_saved: number;
      image_storage_path: string | null;
      image_sha256: string | null;
      capture_quality_status: CameraCapture['qualityStatus'];
      quality_notes: string | null;
      capture_created_at: string;
      // metrics
      brightness: number | null;
      contrast: number | null;
      sharpness: number | null;
      motion_score: number | null;
      blink_detected: number | null;
      eye_open: number | null;
      eye_in_guide: number | null;
      lighting_score: number | null;
      resolution_width: number | null;
      resolution_height: number | null;
      metrics_created_at: string | null;
      // estimate
      estimate_id: string | null;
      method_code: string | null;
      method_version: string | null;
      relative_scale: number | null;
      confidence: number | null;
      estimate_quality_status: PupilEstimate['qualityStatus'] | null;
      limitations: string | null;
      estimate_created_at: string | null;
    }>(
      `SELECT
        s.session_id, s.subject_id, s.mission_phase, s.started_at, s.ended_at,
        s.device_model, s.os_version, s.app_version, s.camera_facing,
        s.sync_state AS session_sync_state, s.created_at AS session_created_at,
        c.capture_id, c.captured_at, c.eye_side, c.capture_mode,
        c.lighting_condition, c.approximate_distance, c.image_saved,
        c.image_storage_path, c.image_sha256, c.quality_status AS capture_quality_status,
        c.quality_notes, c.created_at AS capture_created_at,
        m.brightness, m.contrast, m.sharpness, m.motion_score,
        m.blink_detected, m.eye_open, m.eye_in_guide, m.lighting_score,
        m.resolution_width, m.resolution_height, m.created_at AS metrics_created_at,
        e.estimate_id, e.method_code, e.method_version, e.relative_scale,
        e.confidence, e.quality_status AS estimate_quality_status, e.limitations,
        e.created_at AS estimate_created_at
      FROM camera_captures c
      INNER JOIN camera_inspection_sessions s ON s.session_id = c.session_id
      LEFT JOIN capture_quality_metrics m ON m.capture_id = c.capture_id
      LEFT JOIN pupil_estimates e ON e.capture_id = c.capture_id
      WHERE s.subject_id = ? AND c.eye_side = ?
      ORDER BY c.captured_at DESC
      LIMIT 1`,
      [subjectId, eyeSide],
    );

    if (!row) {
      return null;
    }

    return this.mapToRecord(row);
  }

  async listRecentInspections(subjectId: string, limit = 20): Promise<readonly InspectionRecord[]> {
    const rows = await this.driver.getAll<any>(
      `SELECT
        s.session_id, s.subject_id, s.mission_phase, s.started_at, s.ended_at,
        s.device_model, s.os_version, s.app_version, s.camera_facing,
        s.sync_state AS session_sync_state, s.created_at AS session_created_at,
        c.capture_id, c.captured_at, c.eye_side, c.capture_mode,
        c.lighting_condition, c.approximate_distance, c.image_saved,
        c.image_storage_path, c.image_sha256, c.quality_status AS capture_quality_status,
        c.quality_notes, c.created_at AS capture_created_at,
        m.brightness, m.contrast, m.sharpness, m.motion_score,
        m.blink_detected, m.eye_open, m.eye_in_guide, m.lighting_score,
        m.resolution_width, m.resolution_height, m.created_at AS metrics_created_at,
        e.estimate_id, e.method_code, e.method_version, e.relative_scale,
        e.confidence, e.quality_status AS estimate_quality_status, e.limitations,
        e.created_at AS estimate_created_at
      FROM camera_captures c
      INNER JOIN camera_inspection_sessions s ON s.session_id = c.session_id
      LEFT JOIN capture_quality_metrics m ON m.capture_id = c.capture_id
      LEFT JOIN pupil_estimates e ON e.capture_id = c.capture_id
      WHERE s.subject_id = ?
      ORDER BY c.captured_at DESC
      LIMIT ?`,
      [subjectId, limit],
    );

    return rows.map((r) => this.mapToRecord(r));
  }

  async saveComparison(comparison: InspectionComparison): Promise<void> {
    await this.driver.run(
      `INSERT INTO inspection_comparisons (
        comparison_id, subject_id, baseline_capture_id, current_capture_id,
        relative_change, direction, confidence, comparable, limitations, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        comparison.comparisonId,
        comparison.subjectId,
        comparison.baselineCaptureId,
        comparison.currentCaptureId,
        comparison.relativeChange,
        comparison.direction,
        comparison.confidence,
        comparison.comparable ? 1 : 0,
        JSON.stringify(comparison.limitations),
        comparison.createdAt,
      ],
    );
  }

  async clearCaptureImageStorage(captureId: string): Promise<void> {
    await this.driver.run(
      `UPDATE camera_captures
       SET image_saved = 0, image_storage_path = NULL, image_sha256 = NULL
       WHERE capture_id = ?`,
      [captureId],
    );
  }

  private mapToRecord(row: any): InspectionRecord {
    const session: CameraInspectionSession = {
      sessionId: row.session_id,
      subjectId: row.subject_id,
      missionPhase: row.mission_phase,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      deviceModel: row.device_model,
      osVersion: row.os_version,
      appVersion: row.app_version,
      cameraFacing: row.camera_facing,
      syncState: row.session_sync_state,
      createdAt: row.session_created_at,
    };

    const capture: CameraCapture = {
      captureId: row.capture_id,
      sessionId: row.session_id,
      capturedAt: row.captured_at,
      eyeSide: row.eye_side,
      captureMode: row.capture_mode,
      lightingCondition: row.lighting_condition,
      approximateDistance: row.approximate_distance,
      imageSaved: row.image_saved === 1,
      imageStoragePath: row.image_storage_path,
      imageSha256: row.image_sha256,
      qualityStatus: row.capture_quality_status,
      qualityNotes: row.quality_notes,
      createdAt: row.capture_created_at,
    };

    let metrics: FrameAnalysis | null = null;
    if (row.brightness !== null && row.brightness !== undefined) {
      metrics = {
        captureId: row.capture_id,
        brightness: row.brightness,
        contrast: row.contrast,
        sharpness: row.sharpness,
        motionScore: row.motion_score,
        blinkDetected: row.blink_detected === 1,
        eyeOpen: row.eye_open === 1,
        eyeInGuide: row.eye_in_guide === 1,
        lightingScore: row.lighting_score,
        resolutionWidth: row.resolution_width,
        resolutionHeight: row.resolution_height,
        createdAt: row.metrics_created_at ?? row.capture_created_at,
      };
    }

    let estimate: PupilEstimate | null = null;
    if (row.estimate_id !== null && row.estimate_id !== undefined) {
      let limitationsList: string[] = [];
      try {
        limitationsList = JSON.parse(row.limitations);
      } catch {
        limitationsList = [];
      }
      estimate = {
        estimateId: row.estimate_id,
        captureId: row.capture_id,
        methodCode: row.method_code,
        methodVersion: row.method_version,
        relativeScale: row.relative_scale,
        confidence: row.confidence,
        qualityStatus: row.estimate_quality_status,
        limitations: limitationsList,
        createdAt: row.estimate_created_at ?? row.capture_created_at,
      };
    }

    return {
      session,
      capture,
      metrics,
      estimate,
    };
  }
}

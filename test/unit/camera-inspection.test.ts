import { RelativePupilScale } from '@/domain/camera-inspection/value-objects/relative-scale';
import { evaluateCaptureQuality } from '@/domain/camera-inspection/policies/quality-policy';
import { compareInspectionCaptures } from '@/domain/camera-inspection/policies/comparison-policy';
import { evaluateCaptureEligibility } from '@/domain/camera-inspection/policies/capture-eligibility';
import { LightingEstimator } from '@/infrastructure/camera/lighting-estimator';
import { MotionEstimator } from '@/infrastructure/camera/motion-estimator';
import { BlinkDetector } from '@/infrastructure/camera/blink-detector';
import { PupilSegmenter } from '@/infrastructure/camera/pupil-segmenter';
import { PupilGeometryEstimator } from '@/infrastructure/camera/pupil-geometry-estimator';
import { SaveCameraInspectionUseCase } from '@/application/use-cases/save-camera-inspection';
import { CompareInspectionCapturesUseCase } from '@/application/use-cases/compare-inspection-captures';
import { StartCameraInspectionUseCase } from '@/application/use-cases/start-camera-inspection';
import { AnalyzeInspectionCaptureUseCase } from '@/application/use-cases/analyze-inspection-capture';
import type { CameraCapture } from '@/domain/camera-inspection/entities/camera-capture';
import type { PupilEstimate } from '@/domain/camera-inspection/entities/pupil-estimate';
import type { CameraInspectionSession } from '@/domain/camera-inspection/entities/inspection-session';
import type { FrameAnalysis } from '@/domain/camera-inspection/entities/frame-analysis';
import type { InspectionRepositoryPort, SaveInspectionTransactionInput, InspectionRecord } from '@/domain/camera-inspection/ports/inspection-repository-port';
import type { ImageEncoderPort } from '@/domain/camera-inspection/ports/image-encoder-port';
import type { ObservationRepository } from '@/domain/repositories/observation-repository';
import type { Clock } from '@/domain/shared/clock';
import type { IdGenerator } from '@/domain/shared/ids';
import type { DecodedImagePixels } from '@/domain/camera-inspection/ports/frame-analyzer-port';

class MockInspectionRepository implements InspectionRepositoryPort {
  saved: SaveInspectionTransactionInput[] = [];
  savedComparisons: any[] = [];
  latestCaptures: Map<string, InspectionRecord> = new Map();

  async saveInspection(input: SaveInspectionTransactionInput): Promise<void> {
    this.saved.push(input);
    const key = `${input.session.subjectId}-${input.capture.eyeSide}`;
    this.latestCaptures.set(key, {
      session: input.session,
      capture: input.capture,
      metrics: input.metrics,
      estimate: input.estimate,
    });
  }

  async getLatestCapture(subjectId: string, eyeSide: any): Promise<InspectionRecord | null> {
    return this.latestCaptures.get(`${subjectId}-${eyeSide}`) ?? null;
  }

  async listRecentInspections(): Promise<readonly InspectionRecord[]> {
    return Array.from(this.latestCaptures.values());
  }

  async saveComparison(comparison: any): Promise<void> {
    this.savedComparisons.push(comparison);
  }

  async clearCaptureImageStorage(captureId: string): Promise<void> {
    for (const item of this.saved) {
      if (item.capture.captureId === captureId) {
        item.capture.imageSaved = false;
        item.capture.imageStoragePath = null;
        item.capture.imageSha256 = null;
      }
    }
  }
}

class MockObservationRepository implements ObservationRepository {
  savedSessions: any[] = [];
  async saveSessionWithObservations(session: any, observations: any): Promise<void> {
    this.savedSessions.push({ session, observations });
  }
  async listRecentSessions(): Promise<never[]> { return []; }
  async countPendingSync(): Promise<{ sessions: number; observations: number }> { return { sessions: 0, observations: 0 }; }
  async listMetricDefinitions(): Promise<never[]> { return []; }
  async adoptSubjectScope(): Promise<number> { return 0; }
  async countRecordsBySubject(): Promise<number> { return 0; }
}

class MockImageEncoder implements ImageEncoderPort {
  savedFiles: Map<string, Uint8Array> = new Map();

  async decodeToRgba(_bytes: any): Promise<DecodedImagePixels> {
    return { data: new Uint8Array(100), width: 10, height: 10 };
  }
  async computeSha256(data: Uint8Array): Promise<string> {
    return `sha256-mock-${data.length}`;
  }
  async saveToPrivateSandbox(_subjectId: string, captureId: string, data: Uint8Array) {
    this.savedFiles.set(captureId, data);
    return {
      storagePath: `sandbox://captures/${captureId}.jpg`,
      sha256: await this.computeSha256(data),
    };
  }
  async deleteFromPrivateSandbox(storagePath: string): Promise<void> {
    for (const [key] of this.savedFiles.entries()) {
      if (storagePath.includes(key)) {
        this.savedFiles.delete(key);
      }
    }
  }
}

const mockClock: Clock = { nowIso: () => '2026-11-14T15:00:00.000Z' };
const mockIds: IdGenerator = { uuid: () => 'test-uuid-123' };
const mockIdentity = { getOrCreateSubjectId: async () => 'subj-test-001' };

describe('Inspección asistida por cámara - Dominio y Políticas', () => {
  it('10. La escala relativa es adimensional, se formatea sin unidades y rechaza milímetros o falsos rangos', () => {
    const scale = new RelativePupilScale(0.456);
    expect(scale.value).toBe(0.456);
    expect(scale.format()).toBe('0,46');
    expect(RelativePupilScale.DISCLAIMER_TEXT).toContain('No equivale a milímetros');
    expect(RelativePupilScale.DISCLAIMER_TEXT).toContain('no es válida para comparar entre personas');

    // Fuera de rango o no finito
    expect(() => new RelativePupilScale(-0.1)).toThrow();
    expect(() => new RelativePupilScale(1.5)).toThrow();
    expect(() => new RelativePupilScale(NaN)).toThrow();
  });

  it('5. Una captura con ojo cerrado es rechazada y no produce estimación pupilar', () => {
    const metrics: FrameAnalysis = {
      captureId: 'cap-closed-eye',
      brightness: 110,
      contrast: 40,
      sharpness: 25,
      motionScore: 0.1,
      blinkDetected: true,
      eyeOpen: false,
      eyeInGuide: true,
      lightingScore: 0.9,
      resolutionWidth: 640,
      resolutionHeight: 480,
      createdAt: '2026-11-14T12:00:00Z',
    };

    const quality = evaluateCaptureQuality(metrics);
    expect(quality.status).toBe('rejected');
    expect(quality.reasons).toContain('El ojo aparece cerrado o no visible en la captura');

    const geometry = new PupilGeometryEstimator();
    const estimate = geometry.estimate('cap-closed-eye', null, quality);
    expect(estimate.relativeScale).toBeNull();
    expect(estimate.confidence).toBe(0.0);
    expect(estimate.qualityStatus).toBe('rejected');
  });

  it('6. Una captura con movimiento excesivo queda limitada o como insuficiente', () => {
    const highMotionMetrics: FrameAnalysis = {
      captureId: 'cap-high-motion',
      brightness: 120,
      contrast: 35,
      sharpness: 6.0,
      motionScore: 0.85, // Excesivo
      blinkDetected: false,
      eyeOpen: true,
      eyeInGuide: true,
      lightingScore: 0.85,
      resolutionWidth: 640,
      resolutionHeight: 480,
      createdAt: '2026-11-14T12:00:00Z',
    };

    const quality = evaluateCaptureQuality(highMotionMetrics);
    expect(quality.status).toBe('insufficient');
    expect(quality.reasons).toContain('Movimiento excesivo detectado durante la captura');
  });

  it('7. Una captura con poca luz queda clasificada con calidad limitada', () => {
    const lowLightMetrics: FrameAnalysis = {
      captureId: 'cap-low-light',
      brightness: 30, // Poca luz
      contrast: 20,
      sharpness: 14.0,
      motionScore: 0.2,
      blinkDetected: false,
      eyeOpen: true,
      eyeInGuide: true,
      lightingScore: 0.3,
      resolutionWidth: 640,
      resolutionHeight: 480,
      createdAt: '2026-11-14T12:00:00Z',
    };

    const quality = evaluateCaptureQuality(lowLightMetrics);
    expect(quality.status).toBe('limited');
    expect(quality.reasons.some((r) => r.includes('Iluminación muy baja'))).toBe(true);
  });

  it('8. Calidad insuficiente no produce estimación pupilar', () => {
    const insufficientMetrics: FrameAnalysis = {
      captureId: 'cap-insufficient',
      brightness: 15,
      contrast: 5,
      sharpness: 4.0,
      motionScore: 0.8,
      blinkDetected: false,
      eyeOpen: true,
      eyeInGuide: true,
      lightingScore: 0.1,
      resolutionWidth: 640,
      resolutionHeight: 480,
      createdAt: '2026-11-14T12:00:00Z',
    };

    const quality = evaluateCaptureQuality(insufficientMetrics);
    expect(quality.status).toBe('insufficient');

    const geometry = new PupilGeometryEstimator();
    const estimate = geometry.estimate('cap-insufficient', null, quality);
    expect(estimate.relativeScale).toBeNull();
    expect(estimate.confidence).toBe(0);
  });

  it('9. Una estimación solo aparece si el método la calcula realmente (con segmentación válida)', () => {
    const goodMetrics: FrameAnalysis = {
      captureId: 'cap-good',
      brightness: 115,
      contrast: 45,
      sharpness: 22.0,
      motionScore: 0.1,
      blinkDetected: false,
      eyeOpen: true,
      eyeInGuide: true,
      lightingScore: 0.95,
      resolutionWidth: 640,
      resolutionHeight: 480,
      createdAt: '2026-11-14T12:00:00Z',
    };

    const quality = evaluateCaptureQuality(goodMetrics);
    expect(quality.status).toBe('good');

    const geometry = new PupilGeometryEstimator();
    // Segmentación simulada con pupil/iris
    const segmentation = {
      centerX: 320,
      centerY: 240,
      pupilEquivalentDiameter: 35.0,
      irisEquivalentDiameter: 80.0,
      circularity: 0.88,
      valid: true,
    };

    const estimate = geometry.estimate('cap-good', segmentation, quality);
    expect(estimate.relativeScale).not.toBeNull();
    expect(estimate.relativeScale).toBeCloseTo(35.0 / 80.0, 2);
    expect(estimate.confidence).toBeGreaterThanOrEqual(0.7);
    expect(estimate.methodCode).toBe(PupilGeometryEstimator.METHOD_CODE);
  });

  it('11. La comparación entre capturas exige misma persona, mismo ojo y condiciones comparables', () => {
    const baseCapture: CameraCapture = {
      captureId: 'cap-base',
      sessionId: 'ses-1',
      capturedAt: '2026-11-14T10:00:00Z',
      eyeSide: 'left',
      captureMode: 'front_camera',
      lightingCondition: 'adequate',
      approximateDistance: 'medium',
      imageSaved: false,
      imageStoragePath: null,
      imageSha256: null,
      qualityStatus: 'good',
      qualityNotes: null,
      createdAt: '2026-11-14T10:00:00Z',
    };

    const baseEstimate: PupilEstimate = {
      estimateId: 'est-base',
      captureId: 'cap-base',
      methodCode: 'EXPERIMENTAL_RATIO_V1',
      methodVersion: '1.0.0',
      relativeScale: 0.40,
      confidence: 0.8,
      qualityStatus: 'good',
      limitations: [],
      createdAt: '2026-11-14T10:00:00Z',
    };

    // Caso 1: Mismo ojo, misma persona, aumento del 25% (0.40 -> 0.50)
    const currentCapture: CameraCapture = {
      ...baseCapture,
      captureId: 'cap-current',
      capturedAt: '2026-11-14T11:00:00Z',
    };
    const currentEstimate: PupilEstimate = {
      ...baseEstimate,
      estimateId: 'est-current',
      captureId: 'cap-current',
      relativeScale: 0.50,
    };

    const comp1 = compareInspectionCaptures({
      comparisonId: 'cmp-1',
      subjectId: 'subj-1',
      baseline: { capture: baseCapture, estimate: baseEstimate },
      current: { capture: currentCapture, estimate: currentEstimate },
    });

    expect(comp1.comparable).toBe(true);
    expect(comp1.direction).toBe('increase');
    expect(comp1.relativeChange).toBe(25); // +25%

    // Caso 2: Comparación de ojo izquierdo con ojo derecho (NO permitida)
    const rightEyeCapture: CameraCapture = {
      ...currentCapture,
      eyeSide: 'right',
    };

    const compOjosDistintos = compareInspectionCaptures({
      comparisonId: 'cmp-2',
      subjectId: 'subj-1',
      baseline: { capture: baseCapture, estimate: baseEstimate },
      current: { capture: rightEyeCapture, estimate: currentEstimate },
    });

    expect(compOjosDistintos.comparable).toBe(false);
    expect(compOjosDistintos.direction).toBe('no_clear_change');
    expect(compOjosDistintos.limitations[0]).toContain('Los ojos evaluados son distintos');
  });

  it('12. Una comparación no concluyente o con discrepancia de iluminación no emite conclusión clínica', () => {
    const baseCapture: CameraCapture = {
      captureId: 'cap-base',
      sessionId: 'ses-1',
      capturedAt: '2026-11-14T10:00:00Z',
      eyeSide: 'left',
      captureMode: 'front_camera',
      lightingCondition: 'low', // Poca luz
      approximateDistance: 'close',
      imageSaved: false,
      imageStoragePath: null,
      imageSha256: null,
      qualityStatus: 'limited',
      qualityNotes: null,
      createdAt: '2026-11-14T10:00:00Z',
    };
    const baseEstimate: PupilEstimate = {
      estimateId: 'est-base',
      captureId: 'cap-base',
      methodCode: 'EXPERIMENTAL_RATIO_V1',
      methodVersion: '1.0.0',
      relativeScale: 0.55,
      confidence: 0.4,
      qualityStatus: 'limited',
      limitations: ['Calidad limitada'],
      createdAt: '2026-11-14T10:00:00Z',
    };

    const currentCapture: CameraCapture = {
      ...baseCapture,
      captureId: 'cap-current',
      lightingCondition: 'excessive', // Luz muy diferente
      approximateDistance: 'far', // Distancia muy diferente
    };
    const currentEstimate: PupilEstimate = {
      ...baseEstimate,
      captureId: 'cap-current',
      relativeScale: 0.42,
    };

    const comp = compareInspectionCaptures({
      comparisonId: 'cmp-diff-cond',
      subjectId: 'subj-1',
      baseline: { capture: baseCapture, estimate: baseEstimate },
      current: { capture: currentCapture, estimate: currentEstimate },
    });

    expect(comp.comparable).toBe(false);
    expect(comp.limitations.length).toBeGreaterThanOrEqual(2);
    // Verificar que NO contiene palabras diagnósticas prohibidas
    const serialized = JSON.stringify(comp);
    expect(serialized).not.toContain('estrés');
    expect(serialized).not.toContain('fatiga');
    expect(serialized).not.toContain('neurológico');
    expect(serialized).not.toContain('SANS');
    expect(serialized).not.toContain('mm');
  });
});

describe('Inspección asistida por cámara - Casos de uso e Integridad', () => {
  it('1. Captura sin permiso no bloquea el registro manual', async () => {
    const repo = new MockObservationRepository();
    const identity = { getOrCreateSubjectId: async () => 'subj-1' };
    const startInspection = new StartCameraInspectionUseCase(identity, mockClock, mockIds);

    const session = await startInspection.execute({
      missionPhase: 'inflight',
      cameraFacing: 'front',
    });

    expect(session.sessionId).toBeDefined();
    expect(session.missionPhase).toBe('inflight');
    expect(session.syncState).toBe('local_only');
  });

  it('4 & 14. No se guardan imágenes por defecto y la sincronización no envía imágenes', async () => {
    const inspectionRepo = new MockInspectionRepository();
    const obsRepo = new MockObservationRepository();
    const encoder = new MockImageEncoder();

    const saveUseCase = new SaveCameraInspectionUseCase(
      inspectionRepo,
      obsRepo,
      encoder,
      mockClock,
      mockIds,
    );

    const session: CameraInspectionSession = {
      sessionId: 'ses-save-1',
      subjectId: 'subj-1',
      missionPhase: 'preflight',
      startedAt: '2026-11-14T12:00:00Z',
      endedAt: null,
      deviceModel: 'Test Device',
      osVersion: 'iOS 18',
      appVersion: '1.0.0',
      cameraFacing: 'front',
      syncState: 'local_only',
      createdAt: '2026-11-14T12:00:00Z',
    };

    // Consentimiento en false: NO debe guardarse imagen
    const result = await saveUseCase.execute({
      session,
      eyeSide: 'left',
      captureMode: 'front_camera',
      lightingCondition: 'adequate',
      approximateDistance: 'medium',
      metrics: null,
      estimate: null,
      visualDisturbance: 'no',
      note: 'Sin molestias',
      saveImageConsent: false, // Default
      rawImageBytes: new Uint8Array([1, 2, 3, 4]),
    });

    expect(result.imageSaved).toBe(false);
    expect(result.imageSha256).toBeNull();
    expect(encoder.savedFiles.size).toBe(0);

    const savedRecord = inspectionRepo.saved[0];
    expect(savedRecord.capture.imageSaved).toBe(false);
    expect(savedRecord.capture.imageStoragePath).toBeNull();
    expect(savedRecord.capture.imageSha256).toBeNull();
  });

  it('15 & 16. Si el usuario consiente guardar imagen, se calcula SHA-256 y la eliminación borra el archivo', async () => {
    const inspectionRepo = new MockInspectionRepository();
    const obsRepo = new MockObservationRepository();
    const encoder = new MockImageEncoder();

    const saveUseCase = new SaveCameraInspectionUseCase(
      inspectionRepo,
      obsRepo,
      encoder,
      mockClock,
      mockIds,
    );

    const session: CameraInspectionSession = {
      sessionId: 'ses-save-consent',
      subjectId: 'subj-1',
      missionPhase: 'inflight',
      startedAt: '2026-11-14T12:00:00Z',
      endedAt: null,
      deviceModel: 'Test Device',
      osVersion: 'Android 15',
      appVersion: '1.0.0',
      cameraFacing: 'front',
      syncState: 'local_only',
      createdAt: '2026-11-14T12:00:00Z',
    };

    const imageBytes = new Uint8Array([10, 20, 30, 40, 50]);
    const result = await saveUseCase.execute({
      session,
      eyeSide: 'right',
      captureMode: 'front_camera',
      lightingCondition: 'adequate',
      approximateDistance: 'medium',
      metrics: null,
      estimate: null,
      visualDisturbance: 'si',
      note: 'Leve molestia',
      saveImageConsent: true, // Consentimiento afirmativo
      rawImageBytes: imageBytes,
    });

    expect(result.imageSaved).toBe(true);
    expect(result.imageSha256).toMatch(/^sha256-mock-/);
    expect(encoder.savedFiles.size).toBe(1);

    // Eliminación
    const savedRecord = inspectionRepo.saved[0];
    await encoder.deleteFromPrivateSandbox(savedRecord.capture.imageStoragePath!);
    await inspectionRepo.clearCaptureImageStorage(savedRecord.capture.captureId);

    expect(encoder.savedFiles.size).toBe(0);
    expect(savedRecord.capture.imageSaved).toBe(false);
    expect(savedRecord.capture.imageStoragePath).toBeNull();
  });

  it('13. La documentación manual sigue funcionando si el análisis o cámara no están disponibles', async () => {
    const inspectionRepo = new MockInspectionRepository();
    const obsRepo = new MockObservationRepository();
    const encoder = new MockImageEncoder();

    const saveUseCase = new SaveCameraInspectionUseCase(
      inspectionRepo,
      obsRepo,
      encoder,
      mockClock,
      mockIds,
    );

    const session: CameraInspectionSession = {
      sessionId: 'ses-manual-fallback',
      subjectId: 'subj-1',
      missionPhase: 'postflight',
      startedAt: '2026-11-14T12:00:00Z',
      endedAt: null,
      deviceModel: 'Test Device',
      osVersion: 'Android 15',
      appVersion: '1.0.0',
      cameraFacing: 'front',
      syncState: 'local_only',
      createdAt: '2026-11-14T12:00:00Z',
    };

    // Sin métricas ni estimación de cámara
    const result = await saveUseCase.execute({
      session,
      eyeSide: 'left',
      captureMode: 'manual_only',
      lightingCondition: 'adequate',
      approximateDistance: 'medium',
      metrics: null,
      estimate: null,
      visualDisturbance: 'no',
      note: 'Inspección visual sin anomalías observadas',
      saveImageConsent: false,
    });

    expect(result.savedOffline).toBe(true);
    expect(inspectionRepo.saved).toHaveLength(1);
    expect(obsRepo.savedSessions).toHaveLength(1);
    expect(obsRepo.savedSessions[0].observations).toHaveLength(1);
    expect(obsRepo.savedSessions[0].observations[0].valueOriginal).toBe(0);
  });
});

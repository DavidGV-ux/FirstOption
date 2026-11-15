import { calculatePlrMetrics } from '@/domain/camera-inspection/policies/plr-policy';
import { PlrProcessor } from '@/infrastructure/camera/plr-processor';
import { ExecutePlrTestUseCase } from '@/application/use-cases/execute-plr-test';
import type { PlrTimePoint } from '@/domain/camera-inspection/entities/plr-test';
import type { ObservationRepository, SubjectIdentityStore } from '@/domain/repositories/observation-repository';
import type { MeasurementSession, Observation } from '@/domain/observations/observation';
import type { Clock } from '@/domain/shared/clock';
import type { IdGenerator } from '@/domain/shared/ids';

class MockObservationRepo implements ObservationRepository {
  savedSessions: MeasurementSession[] = [];
  savedObservations: Observation[] = [];

  async saveSessionWithObservations(session: MeasurementSession, observations: readonly Observation[]): Promise<void> {
    this.savedSessions.push(session);
    this.savedObservations.push(...observations);
  }

  async listRecentSessions(): Promise<any[]> {
    return [];
  }
  async getLatestSession(): Promise<any> {
    return null;
  }
  async getObservationsForSession(): Promise<any[]> {
    return [];
  }
  async countPendingSync(): Promise<any> {
    return { sessions: 0, observations: 0 };
  }
  async markSynced(): Promise<void> {}
  async reassignDeviceSubject(): Promise<any> {
    return { reassignedSessions: 0, reassignedObservations: 0 };
  }
  async getActiveSubjectId(): Promise<string> {
    return 'sub-mock';
  }
  async listMetricDefinitions(): Promise<any[]> { return []; }
  async adoptSubjectScope(): Promise<number> { return 0; }
  async countRecordsBySubject(): Promise<number> { return 0; }
}

describe('Reflejo Fotomotor Pupilar (PLR) - Dominio y Políticas', () => {
  const processor = new PlrProcessor();

  test('calcula correctamente latencia y cinética en una secuencia fisiológica reactiva normal', () => {
    const samples = processor.generateSyntheticSequence({
      baselineRatio: 0.50,
      latencyMs: 240,
      constrictionAmplitudePct: 35.0,
      sampleRateHz: 30,
    });

    const result = calculatePlrMetrics(samples, {
      flashStartTimeMs: processor.flashStartTimeMs,
      flashDurationMs: 300,
      eyeSide: 'left',
    });

    expect(result.interpretation).toBe('prompt');
    expect(result.neurologicalFatigueAssessment).toBe('low_fatigue');
    expect(result.baselineRatio).toBeCloseTo(0.50, 1);
    expect(result.constrictionAmplitudePercent).toBeGreaterThan(25);
    expect(result.latencyMs).not.toBeNull();
    // Latencia esperada ~240ms dentro del rango normal (200-350ms)
    expect(result.latencyMs!).toBeGreaterThanOrEqual(180);
    expect(result.latencyMs!).toBeLessThanOrEqual(350);
    expect(result.constrictionVelocityPercentPerSec).toBeGreaterThan(20);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  test('clasifica como delayed (latencia prolongada) cuando la respuesta pupilar tarda más de 350 ms', () => {
    const samples = processor.generateSyntheticSequence({
      baselineRatio: 0.52,
      latencyMs: 390, // Retraso compatible con fatiga del SNC / somnolencia
      constrictionAmplitudePct: 28.0,
      sampleRateHz: 30,
    });

    const result = calculatePlrMetrics(samples, {
      flashStartTimeMs: processor.flashStartTimeMs,
      flashDurationMs: 300,
      eyeSide: 'right',
    });

    expect(result.interpretation).toBe('delayed');
    expect(['moderate_fatigue', 'high_fatigue']).toContain(result.neurologicalFatigueAssessment);
    expect(result.latencyMs!).toBeGreaterThan(350);
    expect(result.limitations.some((l) => l.includes('Latencia'))).toBe(true);
  });

  test('devuelve inconclusive cuando las muestras son insuficientes o vacías', () => {
    const emptyResult = calculatePlrMetrics([], {
      flashStartTimeMs: 1200,
      eyeSide: 'left',
    });

    expect(emptyResult.interpretation).toBe('inconclusive');
    expect(emptyResult.latencyMs).toBeNull();
    expect(emptyResult.confidence).toBeLessThan(0.3);
  });

  test('detecta ausencia de constricción apreciable (amplitud < 5%)', () => {
    // Muestras planas sin miosis
    const flatSamples: PlrTimePoint[] = [];
    for (let t = 0; t <= 5000; t += 100) {
      flatSamples.push({
        timestampMs: t,
        pupilRatio: 0.45,
        flashActive: t >= 1200 && t < 1500,
      });
    }

    const result = calculatePlrMetrics(flatSamples, {
      flashStartTimeMs: 1200,
      eyeSide: 'left',
    });

    expect(result.latencyMs).toBeNull();
    expect(result.constrictionAmplitudePercent).toBeLessThan(5);
    expect(result.limitations.some((l) => l.includes('amplitud < 5%'))).toBe(true);
  });
});

describe('PlrProcessor - Protocolo y Fases temporales', () => {
  const processor = new PlrProcessor({
    baselineDurationMs: 1200,
    flashDurationMs: 300,
    constrictionDurationMs: 1700,
    redilationDurationMs: 2000,
  });

  test('asigna correctamente las fases según el tiempo transcurrido', () => {
    expect(processor.getPhaseAtTime(500)).toBe('baseline');
    expect(processor.getPhaseAtTime(1300)).toBe('flash');
    expect(processor.getPhaseAtTime(2000)).toBe('constriction');
    expect(processor.getPhaseAtTime(4000)).toBe('redilation');
    expect(processor.getPhaseAtTime(6000)).toBe('completed');
  });

  test('el flash solo está activo en la ventana de 1200 a 1500 ms', () => {
    expect(processor.isFlashActiveAtTime(1199)).toBe(false);
    expect(processor.isFlashActiveAtTime(1200)).toBe(true);
    expect(processor.isFlashActiveAtTime(1450)).toBe(true);
    expect(processor.isFlashActiveAtTime(1500)).toBe(false);
    expect(processor.isFlashActiveAtTime(1501)).toBe(false);
  });
});

describe('ExecutePlrTestUseCase - Aplicación y Persistencia', () => {
  test('persiste la sesión PLR y la observación clínica asociada', async () => {
    const mockRepo = new MockObservationRepo();
    const mockIdentity: SubjectIdentityStore = {
      getOrCreateSubjectId: async () => 'astronaut-101',
    };
    const mockClock: Clock = {
      nowIso: () => '2026-11-15T15:00:00.000Z',
    };
    const mockIds: IdGenerator = {
      uuid: () => 'test-uuid-456',
    };

    const useCase = new ExecutePlrTestUseCase(mockRepo, mockIdentity, mockClock, mockIds);

    const syntheticResult = new PlrProcessor().evaluate(
      new PlrProcessor().generateSyntheticSequence(),
      'left',
      'plr-test-1',
    );

    const outcome = await useCase.saveAsObservationSession({
      result: syntheticResult,
      missionPhase: 'inflight',
      visualDisturbance: 'no',
      note: 'Evaluación tras jornada de simulación EVA',
    });

    expect(outcome.sessionId).toContain('ses-plr-');
    expect(mockRepo.savedSessions.length).toBe(1);

    const savedSession = mockRepo.savedSessions[0];
    expect(savedSession.subjectId).toBe('astronaut-101');
    expect(savedSession.missionPhase).toBe('inflight');
    expect(savedSession.source).toBe('pupil_inspection');
    expect(savedSession.note).toContain('PLR Ojo izquierdo');
    expect(savedSession.note).toContain('EVA');

    // Debe haber registrado la observación de alteración visual
    expect(mockRepo.savedObservations.length).toBe(1);
    expect(mockRepo.savedObservations[0].metricId).toBe('symptom_visual_disturbance');
    expect(mockRepo.savedObservations[0].valueOriginal).toBe(0);
  });
});

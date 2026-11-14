import { DocumentPupilInspectionUseCase } from '@/application/use-cases/document-pupil-inspection';
import { ValidationError } from '@/domain/observations/daily-log-schema';
import type { Clock } from '@/domain/shared/clock';
import type { IdGenerator } from '@/domain/shared/ids';
import type {
  MeasurementSession,
} from '@/domain/observations/observation';
import type {
  NewObservationInput,
  ObservationRepository,
} from '@/domain/repositories/observation-repository';

/** Repositorio falso: solo captura lo guardado. */
class CaptureRepository implements ObservationRepository {
  saved: {
    session: MeasurementSession;
    observations: readonly NewObservationInput[];
  }[] = [];

  async saveSessionWithObservations(
    session: MeasurementSession,
    observations: readonly NewObservationInput[],
  ): Promise<void> {
    this.saved.push({ session, observations });
  }

  async listRecentSessions(): Promise<never[]> {
    return [];
  }

  async countPendingSync(): Promise<{ sessions: number; observations: number }> {
    return { sessions: 0, observations: 0 };
  }

  async listMetricDefinitions(): Promise<never[]> {
    return [];
  }
}

const clock: Clock = { nowIso: () => '2026-11-14T12:00:00.000Z' };
const ids: IdGenerator = { uuid: () => 'session-inspection-1' };
const identity = { getOrCreateSubjectId: async () => 'subject-1' };

function makeUseCase(repo: CaptureRepository) {
  return new DocumentPupilInspectionUseCase(repo, identity, clock, ids);
}

describe('DocumentPupilInspectionUseCase', () => {
  it('respuesta "si" guarda la sesión de inspección + síntoma de alteración visual en 1', async () => {
    const repo = new CaptureRepository();
    const useCase = makeUseCase(repo);
    const result = await useCase.execute({
      missionPhase: 'inflight',
      visualDisturbance: 'si',
      note: 'Pupila reactiva, leve molestia al desviar la mirada',
    });
    expect(result.observationCount).toBe(1);
    expect(result.savedOffline).toBe(true);
    const { session, observations } = repo.saved[0];
    expect(session.source).toBe('pupil_inspection');
    expect(session.missionPhase).toBe('inflight');
    expect(session.syncState).toBe('local_only');
    expect(session.note).toContain('Inspección pupilar con linterna:');
    expect(session.note).toContain('leve molestia');
    expect(observations).toHaveLength(1);
    expect(observations[0].metricId).toBe('symptom_visual_disturbance');
    expect(observations[0].valueOriginal).toBe(1);
    expect(observations[0].unitOriginal).toBeNull();
    expect(observations[0].observedAt).toBe('2026-11-14T12:00:00.000Z');
    expect(observations[0].localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('respuesta "no" registra ausencia (0), sin inventar mediciones adicionales', async () => {
    const repo = new CaptureRepository();
    const useCase = makeUseCase(repo);
    const result = await useCase.execute({
      missionPhase: 'preflight',
      visualDisturbance: 'no',
      note: null,
    });
    expect(result.observationCount).toBe(1);
    const { observations } = repo.saved[0];
    expect(observations[0].valueOriginal).toBe(0);
  });

  it('solo nota (sin respuesta) guarda sesión con 0 observaciones', async () => {
    const repo = new CaptureRepository();
    const useCase = makeUseCase(repo);
    const result = await useCase.execute({
      missionPhase: 'postflight',
      visualDisturbance: null,
      note: 'Sin hallazgos relevantes',
    });
    expect(result.observationCount).toBe(0);
    const { session, observations } = repo.saved[0];
    expect(observations).toHaveLength(0);
    expect(session.note).toBe('Inspección pupilar con linterna: Sin hallazgos relevantes');
  });

  it('sin nota y sin respuesta rechaza con validación (no crea sesiones vacías)', async () => {
    const repo = new CaptureRepository();
    const useCase = makeUseCase(repo);
    await expect(
      useCase.execute({
        missionPhase: 'inflight',
        visualDisturbance: null,
        note: null,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.saved).toHaveLength(0);
  });

  it('falta de fase de misión rechaza la entrada', async () => {
    const repo = new CaptureRepository();
    const useCase = makeUseCase(repo);
    await expect(
      useCase.execute({
        missionPhase: undefined as never,
        visualDisturbance: 'no',
        note: null,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('nota mayor al límite rechaza la entrada', async () => {
    const repo = new CaptureRepository();
    const useCase = makeUseCase(repo);
    await expect(
      useCase.execute({
        missionPhase: 'inflight',
        visualDisturbance: null,
        note: 'x'.repeat(2001),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

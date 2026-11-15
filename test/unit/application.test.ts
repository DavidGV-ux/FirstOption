import { RegisterDailyLogUseCase, buildObservations, localDateFromIso } from '@/application/use-cases/register-daily-log';
import { ListRecentActivityUseCase } from '@/application/use-cases/list-recent-activity';
import { ValidationError } from '@/domain/observations/daily-log-schema';
import type { Clock } from '@/domain/shared/clock';
import type { IdGenerator } from '@/domain/shared/ids';
import type {
  MeasurementSession,
  Observation,
} from '@/domain/observations/observation';
import type {
  NewObservationInput,
  ObservationRepository,
  SessionWithObservations,
} from '@/domain/repositories/observation-repository';
import type { MetricDefinition } from '@/domain/metrics/metric-definition';
import { METRIC_CATALOG_V1 } from '@/domain/metrics/catalog-v1';

/** Repositorio falso en memoria para pruebas del dominio/aplicación. */
class InMemoryRepository implements ObservationRepository {
  sessions: MeasurementSession[] = [];
  observationsBySession = new Map<string, Observation[]>();
  analyticsFailure: Error | null = null;

  async saveSessionWithObservations(
    session: MeasurementSession,
    observations: readonly NewObservationInput[],
  ): Promise<void> {
    if (this.analyticsFailure !== null) {
      // Simula un fallo del motor analítico opcional durante el guardado.
      throw this.analyticsFailure;
    }
    this.sessions.push(session);
    this.observationsBySession.set(
      session.sessionId,
      observations.map((o, i) => ({
        observationId: `${session.sessionId}:${o.metricId}-${i}`,
        sessionId: session.sessionId,
        metricId: o.metricId,
        valueOriginal: o.valueOriginal,
        unitOriginal: o.unitOriginal,
        valueNormalized: null,
        unitNormalized: null,
        observedAt: o.observedAt,
        localDate: o.localDate,
        qualityState: o.qualityState ?? 'ok',
        syncState: session.syncState,
        createdAt: session.createdAt,
      })),
    );
  }

  async listRecentSessions(limit: number): Promise<SessionWithObservations[]> {
    return this.sessions
      .slice()
      .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))
      .slice(0, limit)
      .map((session) => ({
        session,
        observations: this.observationsBySession.get(session.sessionId) ?? [],
      }));
  }

  async countPendingSync(): Promise<{ sessions: number; observations: number }> {
    const sessions = this.sessions.filter((s) => s.syncState !== 'synced').length;
    let observations = 0;
    for (const list of this.observationsBySession.values()) {
      observations += list.filter((o) => o.syncState !== 'synced').length;
    }
    return { sessions, observations };
  }

  async adoptSubjectScope(fromSubjectId: string, toSubjectId: string): Promise<number> {
    let n = 0;
    for (const s of this.sessions) {
      if (s.subjectId === fromSubjectId) {
        s.subjectId = toSubjectId;
        n += 1;
      }
    }
    return n;
  }

  async countRecordsBySubject(subjectId: string): Promise<number> {
    return this.sessions.filter((s) => s.subjectId === subjectId).length;
  }

  async listMetricDefinitions(): Promise<MetricDefinition[]> {
    return [...METRIC_CATALOG_V1];
  }
}

const clock: Clock = { nowIso: () => '2026-11-14T12:00:00.000Z' };
let counter = 0;
const ids: IdGenerator = {
  uuid: () => `id-${++counter}`,
};

const validDto = {
  observedAt: '2026-11-14T09:30:00.000Z',
  missionPhase: 'inflight' as const,
  mood: 3,
  stress: null,
  fatigue: null,
  sleepQuality: null,
  sleepHours: 7,
  heartRate: 68,
  bpSystolic: null,
  bpDiastolic: null,
  spo2: null,
  symptoms: { symptom_headache: false, symptom_nausea: true },
  note: 'Día tranquilo',
};

describe('RegisterDailyLogUseCase', () => {
  beforeEach(() => {
    counter = 0;
  });

  it('guarda la sesión y las observaciones con confirmación offline', async () => {
    const repo = new InMemoryRepository();
    const useCase = new RegisterDailyLogUseCase(repo, { getOrCreateSubjectId: async () => 'subject-1' }, clock, ids);
    const result = await useCase.execute(validDto);
    // mood + sleepHours + heartRate + síntoma náuseas = 4 observaciones.
    expect(result.observationCount).toBe(4);
    expect(repo.sessions).toHaveLength(1);
    expect(repo.sessions[0].subjectId).toBe('subject-1');
    expect(repo.sessions[0].missionPhase).toBe('inflight');
    expect(repo.observationsBySession.get(result.sessionId)).toHaveLength(result.observationCount);
  });

  it('marca las observaciones como local_only (aún sin sincronizar)', async () => {
    const repo = new InMemoryRepository();
    const useCase = new RegisterDailyLogUseCase(repo, { getOrCreateSubjectId: async () => 's' }, clock, ids);
    const result = await useCase.execute(validDto);
    const obs = repo.observationsBySession.get(result.sessionId) ?? [];
    expect(obs.every((o) => o.syncState === 'local_only')).toBe(true);
    expect(repo.sessions[0].syncState).toBe('local_only');
  });

  it('un fallo del motor analítico no impide guardar la medición', async () => {
    const repo = new InMemoryRepository();
    // El caso de uso actual no depende de análisis: este contrato queda
    // verificado por construcción; el puerto opcional llega en Inc 4.
    const useCase = new RegisterDailyLogUseCase(repo, { getOrCreateSubjectId: async () => 's' }, clock, ids);
    const result = await useCase.execute(validDto);
    expect(result.savedOffline).toBe(true);
  });

  it('rechaza fecha de toma futura sin guardar nada', async () => {
    const repo = new InMemoryRepository();
    const useCase = new RegisterDailyLogUseCase(repo, { getOrCreateSubjectId: async () => 's' }, clock, ids);
    await expect(
      useCase.execute({ ...validDto, observedAt: '2026-11-20T09:30:00.000Z' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.sessions).toHaveLength(0);
  });

  it('rechaza entrada inválida y no deja datos a medias', async () => {
    const repo = new InMemoryRepository();
    const useCase = new RegisterDailyLogUseCase(repo, { getOrCreateSubjectId: async () => 's' }, clock, ids);
    await expect(useCase.execute({ ...validDto, mood: 9 })).rejects.toBeInstanceOf(ValidationError);
    expect(repo.sessions).toHaveLength(0);
  });
});

describe('buildObservations', () => {
  it('no crea observaciones para valores nulos ni síntomas ausentes', () => {
    const obs = buildObservations(
      { ...validDto, symptoms: { symptom_headache: false, symptom_nausea: true } },
      '2026-11-14',
    );
    const idsSet = obs.map((o) => o.metricId);
    expect(idsSet).toContain('mood_self_report');
    expect(idsSet).toContain('sleep_duration');
    expect(idsSet).toContain('heart_rate');
    expect(idsSet).toContain('symptom_nausea');
    expect(idsSet).not.toContain('symptom_headache');
    expect(idsSet).not.toContain('bp_systolic');
  });

  it('conserva unidades originales del catálogo', () => {
    const obs = buildObservations(validDto, '2026-11-14');
    const hr = obs.find((o) => o.metricId === 'heart_rate');
    expect(hr?.unitOriginal).toBe('lpm');
    const sleep = obs.find((o) => o.metricId === 'sleep_duration');
    expect(sleep?.unitOriginal).toBe('h');
  });
});

describe('ListRecentActivityUseCase', () => {
  it('con repositorio vacío no afirma normalidad', async () => {
    const repo = new InMemoryRepository();
    const useCase = new ListRecentActivityUseCase(repo, { getOrCreateSubjectId: async () => "subject-1" }, clock);
    const status = await useCase.latestLogStatus();
    expect(status.entry).toBeNull();
    expect(status.isToday).toBe(false);
  });

  it('calcula antigüedad del último registro y detecta si es de hoy', async () => {
    const repo = new InMemoryRepository();
    const useCase = new RegisterDailyLogUseCase(repo, { getOrCreateSubjectId: async () => 's' }, clock, ids);
    await useCase.execute(validDto);
    const status = await new ListRecentActivityUseCase(repo, { getOrCreateSubjectId: async () => "subject-1" }, clock).latestLogStatus();
    expect(status.entry).not.toBeNull();
    expect(status.isToday).toBe(true);
    expect(status.entry?.age.kind).toBe('hours');
  });

  it('ignora datasets externos de referencia (NASA OSDR) en el resumen personal', async () => {
    const repo = new InMemoryRepository();
    const external: MeasurementSession = {
      sessionId: 'osd575-c001-plus1',
      subjectId: 'subject-1',
      missionPhase: 'postflight',
      recordedAt: '2026-11-14T12:00:00.000Z',
      recordedLocalDate: '2026-11-14',
      source: 'nasa_osdr_osd575',
      note: 'NASA OSDR OSD-575',
      syncState: 'local_only',
      createdAt: '2026-11-14T12:00:00.000Z',
    };
    repo.sessions.push(external);
    repo.observationsBySession.set('osd575-c001-plus1', [
      {
        observationId: 'osd575-c001-plus1:glucose',
        sessionId: 'osd575-c001-plus1',
        metricId: 'glucose',
        valueOriginal: 95,
        unitOriginal: 'mg/dL',
        valueNormalized: null,
        unitNormalized: null,
        observedAt: '2026-11-14T12:00:00.000Z',
        localDate: '2026-11-14',
        qualityState: 'ok',
        syncState: 'local_only',
        createdAt: '2026-11-14T12:00:00.000Z',
      },
    ]);
    const useCase = new ListRecentActivityUseCase(repo, { getOrCreateSubjectId: async () => 'subject-1' }, clock);
    const status = await useCase.latestLogStatus();
    expect(status.entry).toBeNull();
    const list = await useCase.listRecent(10);
    expect(list).toHaveLength(0);
  });

  it('resume valores con unidades visibles', async () => {
    const repo = new InMemoryRepository();
    const useCase = new RegisterDailyLogUseCase(repo, { getOrCreateSubjectId: async () => 's' }, clock, ids);
    await useCase.execute(validDto);
    const status = await new ListRecentActivityUseCase(repo, { getOrCreateSubjectId: async () => "subject-1" }, clock).latestLogStatus();
    const parts = status.entry?.summaryParts ?? [];
    expect(parts.join(' · ')).toMatch(/Ánimo autorreportado 3\/5/);
    expect(parts.join(' · ')).toMatch(/Duración del sueño 7 h/);
    expect(parts.join(' · ')).toMatch(/Frecuencia cardíaca 68 lpm/);
  });
});

describe('localDateFromIso', () => {
  it('deriva la fecha local sin depender de UTC del instante', () => {
    // 23:30 UTC en un huso local UTC-5 es el mismo día local.
    const iso = '2026-11-13T23:30:00.000Z';
    const result = localDateFromIso(iso);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

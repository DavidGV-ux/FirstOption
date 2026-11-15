import {
  PullRemoteHistoryUseCase,
  type PullStatus,
} from '@/application/use-cases/pull-remote-history';
import type {
  RemoteHistoryImportResult,
  RemoteObservationSnapshot,
  RemoteSessionSnapshot,
} from '@/domain/repositories/remote-history';

function makeQueryBuilder(data: unknown[], error: { message: string } | null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: (count: number) => Promise.resolve({ data: data.slice(0, count), error }),
    range: (from: number, to: number) =>
      Promise.resolve({ data: data.slice(from, to + 1), error }),
  };
  return builder;
}

function makeSupabase(options: {
  hasSession?: boolean;
  sessionError?: { message: string } | null;
  sessions?: Record<string, unknown>[];
  observations?: Record<string, unknown>[];
  sessionsError?: { message: string } | null;
  observationsError?: { message: string } | null;
}) {
  return {
    auth: {
      getSession: async () => {
        if (options.sessionError !== undefined && options.sessionError !== null) {
          return { data: { session: null }, error: options.sessionError };
        }
        return {
          data: {
            session:
              options.hasSession === false
                ? null
                : { user: { id: 'user-1' } },
          },
          error: null,
        };
      },
    },
    from: (table: string) => ({
      select: () =>
        table === 'measurement_sessions'
          ? makeQueryBuilder(options.sessions ?? [], options.sessionsError ?? null)
          : makeQueryBuilder(options.observations ?? [], options.observationsError ?? null),
    }),
  };
}

class CapturingImporter {
  input: {
    sessions: readonly RemoteSessionSnapshot[];
    observations: readonly RemoteObservationSnapshot[];
  } | null = null;
  result: RemoteHistoryImportResult = {
    sessionsImported: 1,
    observationsImported: 2,
    observationsSkipped: 0,
  };

  async importRemoteHistory(input: {
    sessions: readonly RemoteSessionSnapshot[];
    observations: readonly RemoteObservationSnapshot[];
  }): Promise<RemoteHistoryImportResult> {
    this.input = input;
    return this.result;
  }
}

const sessionRow = {
  id: 'remote-s1',
  client_request_id: 'local-s1',
  subject_id: 'user-1',
  mission_phase: 'preflight',
  started_at: '2026-01-01T10:00:00.000Z',
  created_at: '2026-01-01T10:01:00.000Z',
};

const baseObservation = {
  id: 'remote-o',
  client_request_id: 'local-s1:mood_self_report',
  session_id: 'remote-s1',
  metric_code: 'mood_self_report',
  value_numeric: 4,
  value_text: null,
  value_boolean: null,
  unit_code: null,
  measured_at: '2026-01-01T10:00:00.000Z',
  quality_status: 'accepted',
  created_at: '2026-01-01T10:01:00.000Z',
};

describe('PullRemoteHistoryUseCase', () => {
  it('sin sesión remota no descarga y reporta not_authenticated', async () => {
    const importer = new CapturingImporter();
    const useCase = new PullRemoteHistoryUseCase(
      makeSupabase({ hasSession: false }) as never,
      importer,
    );
    const result = await useCase.execute();
    expect(result.kind).toBe('not_authenticated');
    expect(importer.input).toBeNull();
  });

  it('mapea ids locales, calidades y valores sin inventar datos', async () => {
    const importer = new CapturingImporter();
    const useCase = new PullRemoteHistoryUseCase(
      makeSupabase({
        sessions: [sessionRow],
        observations: [
          baseObservation,
          {
            ...baseObservation,
            id: 'remote-o2',
            client_request_id: 'local-s1:symptom_nausea',
            metric_code: 'symptom_nauseas',
            value_numeric: null,
            value_boolean: true,
            quality_status: 'inconclusive',
          },
          {
            ...baseObservation,
            id: 'remote-o3',
            client_request_id: 'local-s1:symptom_false',
            metric_code: 'symptom_headache',
            value_numeric: null,
            value_boolean: false,
          },
          {
            ...baseObservation,
            id: 'remote-o4',
            client_request_id: 'remote-missing:mood',
            session_id: 'remote-sin-sesion-local',
          },
          {
            ...baseObservation,
            id: 'remote-o5',
            client_request_id: 'local-s1:rejected',
            metric_code: 'stress_self_report',
            quality_status: 'rejected',
          },
        ],
      }) as never,
      importer,
    );

    const result: PullStatus = await useCase.execute();
    expect(result.kind).toBe('pulled');
    expect(importer.input).not.toBeNull();
    const sessions = importer.input!.sessions;
    const observations = importer.input!.observations;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].localSessionId).toBe('local-s1');
    expect(sessions[0].remoteSessionId).toBe('remote-s1');

    // Se descartan: booleano false y sesión remota desconocida.
    expect(observations).toHaveLength(3);
    expect(observations[0]).toMatchObject({
      localObservationId: 'local-s1:mood_self_report',
      localSessionId: 'local-s1',
      metricId: 'mood_self_report',
      valueOriginal: 4,
      qualityState: 'ok',
    });
    expect(observations[1]).toMatchObject({
      metricId: 'symptom_nausea',
      valueOriginal: 1,
      qualityState: 'suspect',
    });
    expect(observations[2]).toMatchObject({
      metricId: 'stress_self_report',
      qualityState: 'invalid',
    });
    expect(result.kind === 'pulled' && result.skipped).toBe(2);
  });

  it('sin red devuelve offline con mensaje honesto y no importa', async () => {
    const importer = new CapturingImporter();
    const useCase = new PullRemoteHistoryUseCase(
      makeSupabase({
        sessionsError: { message: 'TypeError: Network request failed' },
      }) as never,
      importer,
    );
    const result = await useCase.execute();
    expect(result.kind).toBe('remote_error');
    if (result.kind === 'remote_error') {
      expect(result.message).toMatch(/Sin conexión/);
    }
    expect(importer.input).toBeNull();
  });

  it('un error de sesión sin red se reporta como offline', async () => {
    const importer = new CapturingImporter();
    const useCase = new PullRemoteHistoryUseCase(
      makeSupabase({ sessionError: { message: 'network down' } }) as never,
      importer,
    );
    const result = await useCase.execute();
    expect(result.kind).toBe('offline');
  });

  it('tolera el modelo remoto antiguo (session_id/recorded_at) si el v2 no existe', async () => {
    const importer = new CapturingImporter();
    const legacySession = {
      session_id: '11111111-1111-4111-8111-111111111111',
      subject_id: 'user-1',
      mission_phase: 'inflight',
      recorded_at: '2026-02-01T08:00:00.000Z',
      created_at: '2026-02-01T08:01:00.000Z',
    };
    const legacyObservation = {
      observation_id: '11111111-1111-4111-8111-111111111111:mood_self_report',
      session_id: legacySession.session_id,
      metric_id: 'mood_self_report',
      value_original: 3,
      unit_original: null,
      observed_at: '2026-02-01T08:00:00.000Z',
      quality_state: 'ok',
      created_at: '2026-02-01T08:01:00.000Z',
    };
    const supabase = {
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: 'user-1' } } },
          error: null,
        }),
      },
      from: (table: string) => ({
        select: (columns: string) => {
          const isModern =
            columns.includes('client_request_id') || columns.includes('metric_code');
          const data =
            table === 'measurement_sessions' ? [legacySession] : [legacyObservation];
          return makeQueryBuilder(
            isModern ? [] : data,
            isModern
              ? { message: 'column measurement_sessions.client_request_id does not exist' }
              : null,
          );
        },
      }),
    };

    const useCase = new PullRemoteHistoryUseCase(supabase as never, importer);
    const result = await useCase.execute();
    expect(result.kind).toBe('pulled');
    expect(importer.input?.sessions[0]).toMatchObject({
      localSessionId: legacySession.session_id,
      missionPhase: 'inflight',
    });
    expect(importer.input?.observations[0]).toMatchObject({
      localSessionId: legacySession.session_id,
      metricId: 'mood_self_report',
      valueOriginal: 3,
      qualityState: 'ok',
    });
  });
});

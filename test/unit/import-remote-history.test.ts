import type { SqlDriver } from '@/infrastructure/database/driver';
import { SqliteObservationRepository } from '@/infrastructure/repositories/sqlite-observation-repository';

/** Driver mínimo: simula las dos tablas que toca la importación. */
class FakeDriver implements SqlDriver {
  readonly metrics = new Set<string>(['mood_self_report', 'symptom_nausea']);
  readonly sessions = new Map<string, string>();
  readonly observations = new Map<string, string>();
  readonly statements: string[] = [];

  async exec(): Promise<void> {}

  async run(sql: string, params: readonly unknown[] = []): Promise<{ changes: number }> {
    this.statements.push(sql);
    if (sql.includes('INSERT OR IGNORE INTO measurement_sessions')) {
      const id = String(params[0]);
      if (this.sessions.has(id)) return { changes: 0 };
      this.sessions.set(id, String(params[1]));
      return { changes: 1 };
    }
    if (sql.includes('INSERT OR IGNORE INTO observations')) {
      const id = String(params[0]);
      if (this.observations.has(id)) return { changes: 0 };
      this.observations.set(id, String(params[1]));
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  async getFirst<T>(): Promise<T | null> {
    return null;
  }

  async getAll<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    if (sql.includes('FROM metric_definitions')) {
      return [...this.metrics].map((metric_id) => ({ metric_id })) as T[];
    }
    if (sql.includes('FROM measurement_sessions')) {
      return params
        .map((id) => String(id))
        .filter((id) => this.sessions.has(id))
        .map((session_id) => ({
          session_id,
          subject_id: this.sessions.get(session_id),
        })) as T[];
    }
    return [];
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  async close(): Promise<void> {}
}

const session = {
  localSessionId: 'local-s1',
  remoteSessionId: 'remote-s1',
  subjectId: 'user-1',
  missionPhase: 'preflight' as const,
  startedAt: '2026-01-01T10:00:00.000Z',
  createdAt: '2026-01-01T10:01:00.000Z',
};

const baseObservation = {
  localObservationId: 'local-s1:mood_self_report',
  localSessionId: 'local-s1',
  metricId: 'mood_self_report',
  valueOriginal: 4,
  unitOriginal: null,
  observedAt: '2026-01-01T10:00:00.000Z',
  qualityState: 'ok' as const,
  createdAt: '2026-01-01T10:01:00.000Z',
};

describe('SqliteObservationRepository.importRemoteHistory', () => {
  it('importa filas nuevas como sincronizadas y descarta lo no mapeable', async () => {
    const driver = new FakeDriver();
    const repository = new SqliteObservationRepository(driver);

    const result = await repository.importRemoteHistory({
      sessions: [session],
      observations: [
        baseObservation,
        {
          ...baseObservation,
          localObservationId: 'local-s1:desconocida',
          metricId: 'metrica_inexistente',
        },
        {
          ...baseObservation,
          localObservationId: 'local-s2:mood_self_report',
          localSessionId: 'sesion_inexistente',
        },
      ],
    });

    expect(result).toEqual({
      sessionsImported: 1,
      observationsImported: 1,
      observationsSkipped: 2,
    });
    expect([...driver.sessions.keys()]).toEqual(['local-s1']);
    expect([...driver.observations.keys()]).toEqual(['local-s1:mood_self_report']);
    expect(
      driver.statements.some((sql) =>
        sql.includes("'remote_import'") && sql.includes("'synced'"),
      ),
    ).toBe(true);
  });

  it('es idempotente: repetir la descarga no duplica ni sobrescribe', async () => {
    const driver = new FakeDriver();
    const repository = new SqliteObservationRepository(driver);
    const input = { sessions: [session], observations: [baseObservation] };

    const first = await repository.importRemoteHistory(input);
    const second = await repository.importRemoteHistory(input);

    expect(first.sessionsImported).toBe(1);
    expect(first.observationsImported).toBe(1);
    expect(second.sessionsImported).toBe(0);
    expect(second.observationsImported).toBe(0);
    expect(driver.sessions.size).toBe(1);
    expect(driver.observations.size).toBe(1);
  });
});

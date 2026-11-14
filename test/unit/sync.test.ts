import { SyncNowUseCase, type SyncStatus } from '@/application/use-cases/sync-now';
import type { OutboxRow, SyncOutboxStore } from '@/domain/repositories/sync-outbox';

/** Supabase falso: registra upserts por tabla y simula auth. */
function makeFakeSupabase(options: {
  hasSession: boolean;
  failTables?: string[];
}) {
  const upserts: { table: string; payloads: Record<string, unknown>[] }[] = [];
  const supabase = {
    auth: {
      getSession: async () => ({
        data: { session: options.hasSession ? { user: { id: 'user-1' } } : null },
        error: null,
      }),
      refreshSession: async () => ({
        data: { session: options.hasSession ? { user: { id: 'user-1' } } : null },
        error: null,
      }),
    },
    from: (table: string) => ({
      upsert: async (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        if (options.failTables?.includes(table)) {
          return { data: null, error: { message: `Tabla ${table} no disponible` } };
        }
        const list = Array.isArray(payload) ? payload : [payload];
        upserts.push({ table, payloads: list });
        return { data: null, error: null };
      },
    }),
  };
  return { supabase, upserts };
}

class InMemoryOutbox implements SyncOutboxStore {
  rows: OutboxRow[] = [];
  doneIds: string[] = [];
  failedIds: string[] = [];
  errors = new Map<string, string>();
  syncedEntities: { type: string; id: string }[] = [];
  cursors = new Map<string, string>();

  async listPendingOutbox(limit = 200): Promise<OutboxRow[]> {
    return this.rows
      .filter((r) => r.entity_type !== undefined)
      .slice(0, limit);
  }

  async markOutboxDone(outboxId: string): Promise<void> {
    this.doneIds.push(outboxId);
    this.rows = this.rows.filter((r) => r.outbox_id !== outboxId);
  }

  async markOutboxFailed(outboxId: string, error: string): Promise<void> {
    this.failedIds.push(outboxId);
    this.errors.set(outboxId, error);
  }

  async markEntitiesSynced(entityType: string, entityId: string): Promise<void> {
    this.syncedEntities.push({ type: entityType, id: entityId });
  }

  async getCursor(key: string): Promise<string | null> {
    return this.cursors.get(key) ?? null;
  }

  async setCursor(key: string, value: string): Promise<void> {
    this.cursors.set(key, value);
  }
}

function makeRow(id: string, type: OutboxRow['entity_type'], payload: Record<string, unknown>): OutboxRow {
  return {
    outbox_id: `${type}:${id}`,
    entity_type: type,
    entity_id: id,
    payload: JSON.stringify(payload),
    attempts: 0,
  };
}

describe('SyncNowUseCase', () => {
  it('sin sesión remota reporta not_authenticated y no empuja nada', async () => {
    const store = new InMemoryOutbox();
    store.rows.push(makeRow('s1', 'measurement_session', {}));
    const { supabase, upserts } = makeFakeSupabase({ hasSession: false });
    const useCase = new SyncNowUseCase(supabase as never, store);
    const result = await useCase.execute();
    expect(result.kind).toBe('not_authenticated');
    expect(upserts).toHaveLength(0);
    expect(store.rows).toHaveLength(1); // no se descartó nada
  });

  it('empuja sesiones antes que observaciones (FK remota) y marca como done', async () => {
    const store = new InMemoryOutbox();
    store.rows.push(
      makeRow('o1', 'observation', { observation_id: 'o1' }),
      makeRow('s1', 'measurement_session', { session_id: 's1' }),
    );
    const { supabase, upserts } = makeFakeSupabase({ hasSession: true });
    const useCase = new SyncNowUseCase(supabase as never, store);
    const result: SyncStatus = await useCase.execute();
    expect(result.kind).toBe('synced');
    if (result.kind === 'synced') {
      expect(result.pushed).toBe(2);
      expect(result.remaining).toBe(0);
    }
    expect(upserts[0].table).toBe('measurement_sessions');
    expect(upserts[1].table).toBe('observations');
    expect(store.doneIds).toHaveLength(2);
    expect(store.syncedEntities).toHaveLength(2);
    expect(store.rows).toHaveLength(0);
    expect(store.cursors.get('sessions_pushed_cursor')).toBeDefined();
  });

  it('un fallo remoto queda en outbox con error visible; no se pierde el registro', async () => {
    const store = new InMemoryOutbox();
    store.rows.push(
      makeRow('s1', 'measurement_session', { session_id: 's1' }),
      makeRow('o1', 'observation', { observation_id: 'o1' }),
    );
    const { supabase } = makeFakeSupabase({
      hasSession: true,
      failTables: ['observations'],
    });
    const useCase = new SyncNowUseCase(supabase as never, store);
    const result = await useCase.execute();
    expect(result.kind).toBe('synced'); // la sesión sí se empujó
    expect(store.doneIds).toEqual(['measurement_session:s1']);
    expect(store.failedIds).toContain('observation:o1');
    expect(store.errors.get('observation:o1')).toMatch(/no disponible/);
    // El registro fallido sigue pendiente para reintento: no se descarta.
    expect(store.rows.some((r) => r.entity_id === 'o1')).toBe(true);
  });

  it('sin cliente Supabase configurado reporta remote_error honesto', async () => {
    const store = new InMemoryOutbox();
    const useCase = new SyncNowUseCase(null, store);
    const result = await useCase.execute();
    expect(result.kind).toBe('remote_error');
  });
});

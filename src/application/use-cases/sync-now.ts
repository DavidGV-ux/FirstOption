import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OutboxRow,
  SyncOutboxStore,
} from '@/domain/repositories/sync-outbox';

export type SyncStatus =
  | { kind: 'synced'; pushed: number; remaining: number }
  | { kind: 'not_authenticated' }
  | { kind: 'offline'; message: string }
  | { kind: 'remote_error'; message: string };

const CURSOR_KEY = 'sessions_pushed_cursor';

/**
 * Caso de uso: sincronizar ahora (push hacia Supabase).
 *
 * Contrato:
 * - Idempotente: los UUID/generados en cliente son PK remotas (upsert).
 * - Sin last-write-wins silencioso: solo upsert de filas nuevas locales;
 *   los conflictos remotos quedan para revisión (Inc 6).
 * - Reintentos con registro de error; nunca se descarta una operación
 *   pendiente sin confirmación.
 * - Sin sesión remota → estado honesto 'not_authenticated'.
 */
export class SyncNowUseCase {
  constructor(
    private readonly supabase: SupabaseClient | null,
    private readonly store: SyncOutboxStore,
  ) {}

  async execute(): Promise<SyncStatus> {
    if (this.supabase === null) {
      return {
        kind: 'remote_error',
        message: 'Supabase no está configurado en esta compilación.',
      };
    }

    const { data: sessionData, error: sessionError } = await this.supabase.auth.getSession();
    if (sessionError !== null || sessionData?.session === null) {
      return { kind: 'not_authenticated' };
    }

    // La sesión remota puede estar expirada; si el refresh falla, se
    // reporta como autenticación requerida, no como error de red.
    const { data: refreshed, error: refreshError } = await this.supabase.auth.refreshSession();
    if (refreshError !== null && refreshed?.session === null) {
      return { kind: 'not_authenticated' };
    }

    const pending = await this.store.listPendingOutbox(200);
    if (pending.length === 0) {
      return { kind: 'synced', pushed: 0, remaining: 0 };
    }

    // Orden determinista: sesiones antes que sus observaciones (FK remota),
    // luego por antigüedad.
    pending.sort((a, b) => {
      if (a.entity_type !== b.entity_type) {
        return a.entity_type === 'measurement_session' ? -1 : 1;
      }
      return a.outbox_id.localeCompare(b.outbox_id);
    });

    let pushed = 0;
    let failures = 0;
    for (const row of pending) {
      try {
        await this.pushOne(row);
        await this.store.markOutboxDone(row.outbox_id);
        await this.store.markEntitiesSynced(row.entity_type, row.entity_id);
        pushed += 1;
      } catch (error) {
        failures += 1;
        const message = error instanceof Error ? error.message : 'Error desconocido';
        await this.store.markOutboxFailed(row.outbox_id, message);
      }
    }

    const remaining = failures > 0 ? await this.countPending() : 0;
    await this.store.setCursor(CURSOR_KEY, new Date().toISOString());
    if (pushed === 0 && failures > 0) {
      return {
        kind: 'remote_error',
        message: 'No se pudo sincronizar todavía. Se reintenta automáticamente; los datos locales están a salvo.',
      };
    }
    return { kind: 'synced', pushed, remaining };
  }

  private async pushOne(row: OutboxRow): Promise<void> {
    if (this.supabase === null) {
      throw new Error('Cliente Supabase ausente');
    }
    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    const table =
      row.entity_type === 'measurement_session' ? 'measurement_sessions' : 'observations';
    const { error } = await this.supabase
      .from(table)
      .upsert(payload, { onConflict: row.entity_type === 'measurement_session' ? 'session_id' : 'observation_id' });
    if (error !== null) {
      throw new Error(error.message);
    }
  }

  private async countPending(): Promise<number> {
    const pending = await this.store.listPendingOutbox(1000);
    return pending.length;
  }
}

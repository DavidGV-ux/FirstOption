/**
 * Puerto de la cola de sincronización (outbox). La aplicación depende
 * de esta interfaz; la infraestructura SQLite la implementa.
 */

export type OutboxEntityType = 'measurement_session' | 'observation';

export interface OutboxRow {
  outbox_id: string;
  entity_type: OutboxEntityType;
  entity_id: string;
  payload: string;
  attempts: number;
}

export interface SyncOutboxStore {
  /** Entradas pendientes o fallidas, más antiguas primero. */
  listPendingOutbox(limit?: number): Promise<OutboxRow[]>;
  markOutboxDone(outboxId: string): Promise<void>;
  markOutboxFailed(outboxId: string, error: string): Promise<void>;
  markEntitiesSynced(entityType: OutboxEntityType, entityId: string): Promise<void>;
  getCursor(key: string): Promise<string | null>;
  setCursor(key: string, value: string): Promise<void>;
}

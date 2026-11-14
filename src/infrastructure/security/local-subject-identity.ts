import { randomUUID } from 'expo-crypto';
import type { SqlDriver } from '../database/driver';

/**
 * Identidad del participante.
 *
 * Prioridad:
 * 1. Usuario autenticado en Supabase (auth.uid()) → sus datos remotos
 *    cumplen RLS y FK con auth.users.
 * 2. Identidad local (UUID generado en la primera ejecución) → datos
 *    solo locales. Si luego se sincronizan sin haber iniciado sesión
 *    antes del registro, fallarán la FK remota y quedarán pendientes
 *    con el error visible (nunca se descartan).
 *
 * En el Incremento 1 era solo identidad local; ahora integra auth.
 */
export interface RemoteSubjectProvider {
  getUserId(): Promise<string | null>;
}

export interface SubjectIdentityLike {
  getOrCreateSubjectId(): Promise<string>;
}

export class LocalSubjectIdentity implements SubjectIdentityLike {
  constructor(
    private readonly driver: SqlDriver,
    private readonly remoteSubject: RemoteSubjectProvider | null = null,
  ) {}

  async getOrCreateSubjectId(): Promise<string> {
    if (this.remoteSubject !== null) {
      const remoteId = await this.remoteSubject.getUserId();
      if (remoteId !== null) {
        return remoteId;
      }
    }
    const row = await this.driver.getFirst<{ value: string }>(
      "SELECT value FROM schema_meta WHERE key = 'local_subject_id'",
    );
    if (row) {
      return row.value;
    }
    const id = randomUUID();
    await this.driver.run(
      "INSERT INTO schema_meta (key, value) VALUES ('local_subject_id', ?)",
      [id],
    );
    return id;
  }
}

import { randomUUID } from 'expo-crypto';
import type { SqlDriver } from '../database/driver';

/**
 * Identidad local del participante.
 *
 * En el Incremento 1 es un UUID local generado en la primera
 * ejecución. En el Incremento 2 se sustituye por el identificador de
 * Supabase Auth y los datos locales se separan por cuenta.
 */
export interface SubjectIdentityLike {
  getOrCreateSubjectId(): Promise<string>;
}

export class LocalSubjectIdentity implements SubjectIdentityLike {
  constructor(private readonly driver: SqlDriver) {}

  async getOrCreateSubjectId(): Promise<string> {
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

import { randomUUID } from 'expo-crypto';
import type { SubjectIdentityStore } from '@/domain/repositories/observation-repository';
import type { SqlDriver } from '../database/driver';

export interface RemoteSubjectProvider {
  getUserId(): Promise<string | null>;
}

export interface SubjectIdentityLike {
  /** Identidad efectiva: cuenta remota si hay sesión, si no el scope local. */
  getOrCreateSubjectId(): Promise<string>;
  /** Scope local del dispositivo (siempre el UUID local), para adopción. */
  getLocalDeviceScopeId(): Promise<string>;
}

export class LocalSubjectIdentity implements SubjectIdentityLike, SubjectIdentityStore {
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
    return this.getLocalDeviceScopeId();
  }

  async getLocalDeviceScopeId(): Promise<string> {
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

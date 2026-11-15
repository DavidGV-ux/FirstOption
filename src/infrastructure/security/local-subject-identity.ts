import { randomUUID } from 'expo-crypto';
import type { SubjectIdentityStore } from '@/domain/repositories/observation-repository';
import type { SqlDriver } from '../database/driver';

export interface RemoteSubjectProvider {
  getUserId(): Promise<string | null>;
}

export interface RemoteSubjectWithEmail extends RemoteSubjectProvider {
  getEmail(): Promise<string | null>;
}

/** Datos mínimos de la cuenta/sesión local para el respaldo offline. */
export interface LocalIdentityFallbackStore {
  loadAccount(): Promise<{ email: string; remoteUserId: string | null } | null>;
  loadSession(): Promise<{ email: string } | null>;
}

/**
 * Identidad remota con respaldo local.
 *
 * Con internet y sesión de Supabase válida usa la sesión viva. Si la
 * sesión no puede leerse (sin red, token expirado, SecureStore lento),
 * cae al `remoteUserId` de la cuenta local SOLO si existe una sesión de
 * dispositivo iniciada para ese mismo correo. Así el historial remoto
 * sigue visible sin conexión, pero cerrar sesión no deja datos abiertos.
 */
export class SessionAwareRemoteSubject implements RemoteSubjectWithEmail {
  constructor(
    private readonly live: RemoteSubjectWithEmail,
    private readonly fallback: LocalIdentityFallbackStore,
  ) {}

  async getUserId(): Promise<string | null> {
    try {
      const liveId = await this.live.getUserId();
      if (liveId !== null) return liveId;
    } catch {
      // Sin red o almacenamiento no disponible: se intenta el respaldo.
    }
    const account = await this.fallbackAccount();
    return account?.remoteUserId ?? null;
  }

  async getEmail(): Promise<string | null> {
    try {
      const liveEmail = await this.live.getEmail();
      if (liveEmail !== null) return liveEmail;
    } catch {
      // Se intenta el respaldo local.
    }
    const account = await this.fallbackAccount();
    return account?.email ?? null;
  }

  private async fallbackAccount(): Promise<{
    email: string;
    remoteUserId: string | null;
  } | null> {
    try {
      const [account, session] = await Promise.all([
        this.fallback.loadAccount(),
        this.fallback.loadSession(),
      ]);
      if (account === null || session === null) return null;
      if (account.email.trim().toLowerCase() !== session.email.trim().toLowerCase()) {
        return null;
      }
      return account;
    } catch {
      return null;
    }
  }
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

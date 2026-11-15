import type { Clock } from '@/domain/shared/clock';

/** Registro de cuenta guardado en el dispositivo. */
export interface LocalAccountRecord {
  localAccountId: string;
  email: string;
  displayName: string | null;
  /**
   * Contraseña temporal para crear la cuenta remota cuando no había
   * internet. Vive únicamente en el almacén seguro del sistema operativo
   * y se elimina en cuanto la cuenta queda vinculada al servidor.
   */
  password: string | null;
  passwordSalt: string;
  passwordVerifier: string;
  remoteUserId: string | null;
  pendingRemoteUpload: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocalSessionRecord {
  accountId: string;
  email: string;
  startedAt: string;
}

/** Persistencia local de la cuenta y de la sesión de dispositivo. */
export interface LocalAccountStore {
  loadAccount(): Promise<LocalAccountRecord | null>;
  saveAccount(account: LocalAccountRecord): Promise<void>;
  loadSession(): Promise<LocalSessionRecord | null>;
  saveSession(session: LocalSessionRecord): Promise<void>;
  clearSession(): Promise<void>;
}

export interface AuthUser {
  userId: string;
  email: string;
}

export type RemoteAuthResult =
  | {
      ok: true;
      user: AuthUser | null;
      needsEmailConfirmation: boolean;
    }
  | { ok: false; message: string; network: boolean };

/** Adaptador de autenticación remota (Supabase Auth). */
export interface RemoteAuthPort {
  getSession(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<RemoteAuthResult>;
  signUp(
    email: string,
    password: string,
    displayName: string | null,
  ): Promise<RemoteAuthResult>;
  signOut(): Promise<void>;
}

export interface PasswordHasher {
  newId(): string;
  newSalt(): string;
  hash(password: string, salt: string): Promise<string>;
}

export interface AuthSession {
  kind: 'remote' | 'local';
  email: string | null;
  userId: string | null;
  displayName: string | null;
  /** true si la cuenta se creó sin internet y aún no existe en el servidor. */
  pendingRemoteUpload: boolean;
}

export type AuthOutcome =
  | { ok: true; session: AuthSession; message?: string }
  | { ok: false; message: string };

export type ReconcileOutcome =
  | { kind: 'no_pending' }
  | { kind: 'not_configured'; message: string }
  | { kind: 'linked'; message: string }
  | { kind: 'still_pending'; message: string };

/**
 * Autenticación con soporte offline.
 *
 * Reglas:
 * - Con internet se usa Supabase Auth; el resultado remoto manda.
 * - Sin internet (o sin Supabase configurado) se permite entrar con una
 *   cuenta guardada en el dispositivo.
 * - Crear una cuenta sin internet la guarda localmente y la deja
 *   pendiente; al recuperar conexión se intenta crear en Supabase de
 *   forma automática con las credenciales guardadas en SecureStore.
 * - Un error de credenciales del servidor nunca se sustituye por una
 *   validación local silenciosa.
 * - La contraseña temporal se borra al vincular la cuenta remota.
 */
export class ManageAuthUseCase {
  constructor(
    private readonly store: LocalAccountStore,
    private readonly remote: RemoteAuthPort | null,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async getSession(): Promise<AuthSession | null> {
    const remoteUser = this.remote === null ? null : await this.remote.getSession();
    const account = await this.store.loadAccount();
    if (remoteUser !== null) {
      return {
        kind: 'remote',
        email: remoteUser.email,
        userId: remoteUser.userId,
        displayName: account?.displayName ?? null,
        pendingRemoteUpload: false,
      };
    }

    const localSession = await this.store.loadSession();
    if (localSession === null) return null;
    if (account !== null && account.email === localSession.email) {
      return {
        kind: 'local',
        email: account.email,
        userId: account.remoteUserId ?? account.localAccountId,
        displayName: account.displayName,
        pendingRemoteUpload: account.pendingRemoteUpload,
      };
    }
    return {
      kind: 'local',
      email: localSession.email,
      userId: localSession.accountId,
      displayName: null,
      pendingRemoteUpload: false,
    };
  }

  async getLocalAccount(): Promise<LocalAccountRecord | null> {
    return this.store.loadAccount();
  }

  async signIn(rawEmail: string, password: string): Promise<AuthOutcome> {
    const email = normalizeEmail(rawEmail);
    if (!email.includes('@')) {
      return { ok: false, message: 'Ingresa un correo válido.' };
    }
    if (password.length < 6) {
      return { ok: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
    }

    if (this.remote !== null) {
      const remote = await this.remote.signIn(email, password);
      if (remote.ok) {
        const userId = remote.user?.userId ?? null;
        const account = await this.persistAccount({
          email,
          passwordForPendingUpload: null,
          passwordForVerification: password,
          displayName: (await this.store.loadAccount())?.displayName ?? null,
          remoteUserId: userId,
          pendingRemoteUpload: false,
        });
        await this.startLocalSession(account);
        return {
          ok: true,
          session: {
            kind: 'remote',
            email: remote.user?.email ?? email,
            userId,
            displayName: account.displayName,
            pendingRemoteUpload: false,
          },
        };
      }
      // Solo hay fallback local si el fallo es de red, nunca si el
      // servidor rechazó las credenciales.
      if (!remote.network) {
        return { ok: false, message: remote.message };
      }
    }

    const local = await this.store.loadAccount();
    if (local === null || local.email !== email) {
      return {
        ok: false,
        message:
          'Sin conexión y no hay una cuenta guardada en este dispositivo. Conéctate a internet para iniciar sesión o crear una cuenta.',
      };
    }
    const verifier = await this.hasher.hash(password, local.passwordSalt);
    if (verifier !== local.passwordVerifier) {
      return { ok: false, message: 'Correo o contraseña incorrectos.' };
    }
    await this.startLocalSession(local);
    return {
      ok: true,
      session: {
        kind: 'local',
        email: local.email,
        userId: local.remoteUserId ?? local.localAccountId,
        displayName: local.displayName,
        pendingRemoteUpload: local.pendingRemoteUpload,
      },
      message: local.pendingRemoteUpload
        ? 'Sesión local iniciada. La cuenta se validará al recuperar internet.'
        : 'Sesión local iniciada sin conexión.',
    };
  }

  async signUp(
    rawEmail: string,
    password: string,
    displayName: string | null,
  ): Promise<AuthOutcome> {
    const email = normalizeEmail(rawEmail);
    const name = displayName?.trim() ? displayName.trim() : null;
    if (!email.includes('@')) {
      return { ok: false, message: 'Ingresa un correo válido.' };
    }
    if (password.length < 6) {
      return { ok: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
    }

    if (this.remote !== null) {
      const remote = await this.remote.signUp(email, password, name);
      if (remote.ok) {
        const userId = remote.user?.userId ?? null;
        const account = await this.persistAccount({
          email,
          passwordForPendingUpload: null,
          passwordForVerification: password,
          displayName: name,
          remoteUserId: userId,
          pendingRemoteUpload: false,
        });
        await this.startLocalSession(account);
        if (remote.needsEmailConfirmation) {
          return {
            ok: true,
            session: {
              kind: 'local',
              email,
              userId,
              displayName: name,
              pendingRemoteUpload: false,
            },
            message:
              'Cuenta creada. Revisa tu correo para confirmarla; mientras tanto puedes usar la app en este dispositivo.',
          };
        }
        return {
          ok: true,
          session: {
            kind: 'remote',
            email: remote.user?.email ?? email,
            userId,
            displayName: name,
            pendingRemoteUpload: false,
          },
        };
      }
      if (!remote.network) {
        return { ok: false, message: remote.message };
      }
    }

    // Sin internet (o sin Supabase): se guarda la cuenta en el dispositivo.
    const account = await this.persistAccount({
      email,
      passwordForPendingUpload: password,
      passwordForVerification: password,
      displayName: name,
      remoteUserId: null,
      pendingRemoteUpload: true,
    });
    await this.startLocalSession(account);
    return {
      ok: true,
      session: {
        kind: 'local',
        email,
        userId: account.localAccountId,
        displayName: name,
        pendingRemoteUpload: true,
      },
      message:
        'Cuenta guardada en este dispositivo sin conexión. Se validará y subirá automáticamente cuando haya internet.',
    };
  }

  async signOut(): Promise<void> {
    try {
      if (this.remote !== null) await this.remote.signOut();
    } finally {
      await this.store.clearSession();
    }
  }

  /**
   * Intenta crear en Supabase una cuenta creada sin internet.
   * Idempotente: si la cuenta ya existe, intenta iniciar sesión con las
   * mismas credenciales para vincularla.
   */
  async reconcilePendingAccount(): Promise<ReconcileOutcome> {
    const account = await this.store.loadAccount();
    if (account === null || !account.pendingRemoteUpload) {
      return { kind: 'no_pending' };
    }
    if (this.remote === null) {
      return {
        kind: 'not_configured',
        message: 'Supabase no está configurado en esta compilación.',
      };
    }
    if (account.password === null) {
      return {
        kind: 'still_pending',
        message: 'Falta la contraseña local para validar la cuenta pendiente.',
      };
    }

    let result = await this.remote.signUp(
      account.email,
      account.password,
      account.displayName,
    );
    if (!result.ok && !result.network) {
      // Puede existir ya (por ejemplo, otro dispositivo la creó antes).
      const signIn = await this.remote.signIn(account.email, account.password);
      if (!signIn.ok) {
        return {
          kind: 'still_pending',
          message: signIn.network
            ? 'Sin conexión: la cuenta local sigue pendiente.'
            : 'La cuenta ya existe en el servidor, pero las credenciales no coinciden. Inicia sesión manualmente.',
        };
      }
      result = signIn;
    }
    if (!result.ok) {
      return {
        kind: 'still_pending',
        message: 'Sin conexión: la cuenta local sigue pendiente de validación.',
      };
    }

    const userId = result.user?.userId ?? account.remoteUserId ?? null;
    const updated: LocalAccountRecord = {
      ...account,
      remoteUserId: userId,
      pendingRemoteUpload: false,
      password: null,
      updatedAt: this.clock.nowIso(),
    };
    await this.store.saveAccount(updated);
    await this.startLocalSession(updated);

    return {
      kind: 'linked',
      message: 'Cuenta local validada y creada en Supabase.',
    };
  }

  private async startLocalSession(account: LocalAccountRecord): Promise<void> {
    await this.store.saveSession({
      accountId: account.localAccountId,
      email: account.email,
      startedAt: this.clock.nowIso(),
    });
  }

  private async persistAccount(input: {
    email: string;
    passwordForPendingUpload: string | null;
    passwordForVerification: string | null;
    displayName: string | null;
    remoteUserId: string | null;
    pendingRemoteUpload: boolean;
  }): Promise<LocalAccountRecord> {
    const existing = await this.store.loadAccount();
    const reuse = existing !== null && existing.email === input.email;
    const salt = reuse && existing ? existing.passwordSalt : this.hasher.newSalt();
    const verifier =
      input.passwordForVerification !== null
        ? await this.hasher.hash(input.passwordForVerification, salt)
        : (reuse && existing ? existing.passwordVerifier : await this.hasher.hash('', salt));
    const now = this.clock.nowIso();
    const account: LocalAccountRecord = {
      localAccountId: reuse && existing ? existing.localAccountId : this.hasher.newId(),
      email: input.email,
      displayName: input.displayName,
      password: input.passwordForPendingUpload,
      passwordSalt: salt,
      passwordVerifier: verifier,
      remoteUserId: input.remoteUserId,
      pendingRemoteUpload: input.pendingRemoteUpload,
      createdAt: reuse && existing ? existing.createdAt : now,
      updatedAt: now,
    };
    await this.store.saveAccount(account);
    return account;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

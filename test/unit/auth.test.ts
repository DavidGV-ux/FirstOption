import {
  ManageAuthUseCase,
  type AuthUser,
  type LocalAccountRecord,
  type LocalAccountStore,
  type LocalSessionRecord,
  type PasswordHasher,
  type RemoteAuthPort,
  type RemoteAuthResult,
} from '@/application/use-cases/manage-auth';

class InMemoryAccountStore implements LocalAccountStore {
  account: LocalAccountRecord | null = null;
  session: LocalSessionRecord | null = null;

  async loadAccount(): Promise<LocalAccountRecord | null> {
    return this.account;
  }
  async saveAccount(account: LocalAccountRecord): Promise<void> {
    this.account = account;
  }
  async loadSession(): Promise<LocalSessionRecord | null> {
    return this.session;
  }
  async saveSession(session: LocalSessionRecord): Promise<void> {
    this.session = session;
  }
  async clearSession(): Promise<void> {
    this.session = null;
  }
}

class FakeHasher implements PasswordHasher {
  private next = 0;
  newId(): string {
    this.next += 1;
    return `id-${this.next}`;
  }
  newSalt(): string {
    this.next += 1;
    return `salt-${this.next}`;
  }
  async hash(password: string, salt: string): Promise<string> {
    return `${salt}:${password}`;
  }
}

class FakeRemote implements RemoteAuthPort {
  online = true;
  session: AuthUser | null = null;
  accounts = new Map<string, string>();
  requireConfirmation = false;
  signUpCalls = 0;
  signInCalls = 0;

  async getSession(): Promise<AuthUser | null> {
    return this.session;
  }

  async signIn(email: string, password: string): Promise<RemoteAuthResult> {
    this.signInCalls += 1;
    if (!this.online) {
      return { ok: false, message: 'Network request failed', network: true };
    }
    if (this.accounts.get(email) !== password) {
      return { ok: false, message: 'Correo o contraseña incorrectos.', network: false };
    }
    this.session = { userId: `remote-${email}`, email };
    return { ok: true, user: this.session, needsEmailConfirmation: false };
  }

  async signUp(
    email: string,
    password: string,
    _displayName: string | null,
  ): Promise<RemoteAuthResult> {
    this.signUpCalls += 1;
    if (!this.online) {
      return { ok: false, message: 'Network request failed', network: true };
    }
    if (this.accounts.has(email)) {
      return { ok: false, message: 'User already registered', network: false };
    }
    this.accounts.set(email, password);
    const user = { userId: `remote-${email}`, email };
    if (!this.requireConfirmation) this.session = user;
    return { ok: true, user, needsEmailConfirmation: this.requireConfirmation };
  }

  async signOut(): Promise<void> {
    this.session = null;
  }
}

const clock = { nowIso: () => '2026-01-01T00:00:00.000Z' };

function makeAuth(store: InMemoryAccountStore, remote: FakeRemote | null) {
  return new ManageAuthUseCase(store, remote, new FakeHasher(), clock);
}

describe('ManageAuthUseCase', () => {
  it('crea una cuenta local pendiente sin internet y permite iniciar sesión sin conexión', async () => {
    const store = new InMemoryAccountStore();
    const remote = new FakeRemote();
    remote.online = false;
    const auth = makeAuth(store, remote);

    const signUp = await auth.signUp('Test@Example.com', 'secreto1', 'Test');
    expect(signUp.ok).toBe(true);
    if (!signUp.ok) return;
    expect(signUp.session.kind).toBe('local');
    expect(signUp.session.pendingRemoteUpload).toBe(true);
    expect(store.account?.email).toBe('test@example.com');
    expect(store.account?.pendingRemoteUpload).toBe(true);
    expect(store.account?.password).toBe('secreto1');
    expect(store.session).not.toBeNull();

    const signIn = await auth.signIn('test@example.com', 'secreto1');
    expect(signIn.ok).toBe(true);
    if (!signIn.ok) return;
    expect(signIn.session.kind).toBe('local');
    expect(signIn.session.pendingRemoteUpload).toBe(true);
  });

  it('rechaza una contraseña local incorrecta', async () => {
    const store = new InMemoryAccountStore();
    const remote = new FakeRemote();
    remote.online = false;
    const auth = makeAuth(store, remote);
    await auth.signUp('test@example.com', 'secreto1', null);
    await auth.signOut();

    const signIn = await auth.signIn('test@example.com', 'otra-clave');
    expect(signIn.ok).toBe(false);
    if (signIn.ok) return;
    expect(signIn.message).toMatch(/incorrect/i);
  });

  it('valida y sube la cuenta pendiente al recuperar internet, borrando la contraseña temporal', async () => {
    const store = new InMemoryAccountStore();
    const remote = new FakeRemote();
    remote.online = false;
    const auth = makeAuth(store, remote);

    await auth.signUp('test@example.com', 'secreto1', 'Test');
    expect(store.account?.password).toBe('secreto1');

    remote.online = true;
    const outcome = await auth.reconcilePendingAccount();
    expect(outcome.kind).toBe('linked');
    expect(remote.accounts.get('test@example.com')).toBe('secreto1');
    expect(store.account?.pendingRemoteUpload).toBe(false);
    expect(store.account?.password).toBeNull();
    expect(store.account?.remoteUserId).toBe('remote-test@example.com');
  });

  it('vincula una cuenta ya existente en el servidor usando las mismas credenciales', async () => {
    const store = new InMemoryAccountStore();
    const remote = new FakeRemote();
    remote.online = false;
    const auth = makeAuth(store, remote);
    await auth.signUp('test@example.com', 'secreto1', null);

    remote.online = true;
    remote.accounts.set('test@example.com', 'secreto1');
    const outcome = await auth.reconcilePendingAccount();
    expect(outcome.kind).toBe('linked');
    expect(store.account?.pendingRemoteUpload).toBe(false);
    expect(store.account?.password).toBeNull();
  });

  it('si sigue sin internet, la cuenta permanece pendiente', async () => {
    const store = new InMemoryAccountStore();
    const remote = new FakeRemote();
    remote.online = false;
    const auth = makeAuth(store, remote);
    await auth.signUp('test@example.com', 'secreto1', null);

    const outcome = await auth.reconcilePendingAccount();
    expect(outcome.kind).toBe('still_pending');
    expect(store.account?.pendingRemoteUpload).toBe(true);
    expect(store.account?.password).toBe('secreto1');
  });

  it('un error de credenciales del servidor no se sustituye por la validación local', async () => {
    const store = new InMemoryAccountStore();
    const remote = new FakeRemote();
    remote.online = false;
    const auth = makeAuth(store, remote);
    await auth.signUp('test@example.com', 'secreto1', null);

    // Vuelve la red, pero el servidor rechaza las credenciales.
    remote.online = true;
    const signIn = await auth.signIn('test@example.com', 'otra-clave');
    expect(signIn.ok).toBe(false);
    if (signIn.ok) return;
    expect(signIn.message).toMatch(/correo o contraseña/i);
    expect(remote.signInCalls).toBe(1);
  });

  it('con un fallo de red usa la cuenta local guardada', async () => {
    const store = new InMemoryAccountStore();
    const remote = new FakeRemote();
    remote.online = false;
    const auth = makeAuth(store, remote);
    await auth.signUp('test@example.com', 'secreto1', null);
    await auth.signOut();

    const signIn = await auth.signIn('test@example.com', 'secreto1');
    expect(signIn.ok).toBe(true);
    if (!signIn.ok) return;
    expect(signIn.session.kind).toBe('local');
  });

  it('inicia sesión remota y guarda verificación local sin contraseña temporal', async () => {
    const store = new InMemoryAccountStore();
    const remote = new FakeRemote();
    remote.accounts.set('test@example.com', 'secreto1');
    const auth = makeAuth(store, remote);

    const signIn = await auth.signIn('test@example.com', 'secreto1');
    expect(signIn.ok).toBe(true);
    if (!signIn.ok) return;
    expect(signIn.session.kind).toBe('remote');
    expect(store.account?.password).toBeNull();
    expect(store.account?.remoteUserId).toBe('remote-test@example.com');

    // Más tarde, sin conexión, la cuenta local sigue siendo verificable.
    remote.online = false;
    remote.session = null;
    const offline = await auth.signIn('test@example.com', 'secreto1');
    expect(offline.ok).toBe(true);
  });

  it('cerrar sesión limpia la sesión local sin borrar la cuenta', async () => {
    const store = new InMemoryAccountStore();
    const remote = new FakeRemote();
    remote.online = false;
    const auth = makeAuth(store, remote);
    await auth.signUp('test@example.com', 'secreto1', null);

    await auth.signOut();
    expect(store.session).toBeNull();
    expect(store.account).not.toBeNull();
    expect(await auth.getSession()).toBeNull();
  });
});

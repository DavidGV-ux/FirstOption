import {
  SessionAwareRemoteSubject,
  type LocalIdentityFallbackStore,
} from '@/infrastructure/security/local-subject-identity';

function makeFallback(options: {
  account?: { email: string; remoteUserId: string | null } | null;
  session?: { email: string } | null;
}): LocalIdentityFallbackStore {
  return {
    loadAccount: async () => options.account ?? null,
    loadSession: async () => options.session ?? null,
  };
}

function makeLive(options: {
  userId?: string | null;
  email?: string | null;
  throws?: boolean;
}) {
  return {
    getUserId: async () => {
      if (options.throws) throw new Error('sin red');
      return options.userId ?? null;
    },
    getEmail: async () => {
      if (options.throws) throw new Error('sin red');
      return options.email ?? null;
    },
  };
}

describe('SessionAwareRemoteSubject', () => {
  it('usa la sesión viva cuando existe', async () => {
    const subject = new SessionAwareRemoteSubject(
      makeLive({ userId: 'remote-live', email: 'live@example.com' }),
      makeFallback({
        account: { email: 'local@example.com', remoteUserId: 'remote-local' },
        session: { email: 'local@example.com' },
      }),
    );
    await expect(subject.getUserId()).resolves.toBe('remote-live');
    await expect(subject.getEmail()).resolves.toBe('live@example.com');
  });

  it('sin sesión viva cae al remoteUserId de la cuenta local con sesión iniciada', async () => {
    const subject = new SessionAwareRemoteSubject(
      makeLive({ userId: null, email: null }),
      makeFallback({
        account: { email: 'persona@example.com', remoteUserId: 'remote-123' },
        session: { email: 'Persona@Example.com' },
      }),
    );
    await expect(subject.getUserId()).resolves.toBe('remote-123');
    await expect(subject.getEmail()).resolves.toBe('persona@example.com');
  });

  it('también cae al respaldo si leer la sesión lanza un error de red', async () => {
    const subject = new SessionAwareRemoteSubject(
      makeLive({ throws: true }),
      makeFallback({
        account: { email: 'persona@example.com', remoteUserId: 'remote-123' },
        session: { email: 'persona@example.com' },
      }),
    );
    await expect(subject.getUserId()).resolves.toBe('remote-123');
  });

  it('no expone historial remoto tras cerrar sesión local', async () => {
    const subject = new SessionAwareRemoteSubject(
      makeLive({ userId: null }),
      makeFallback({
        account: { email: 'persona@example.com', remoteUserId: 'remote-123' },
        session: null,
      }),
    );
    await expect(subject.getUserId()).resolves.toBeNull();
  });

  it('no mezcla cuentas cuando el correo local no coincide', async () => {
    const subject = new SessionAwareRemoteSubject(
      makeLive({ userId: null }),
      makeFallback({
        account: { email: 'otra@example.com', remoteUserId: 'remote-otra' },
        session: { email: 'persona@example.com' },
      }),
    );
    await expect(subject.getUserId()).resolves.toBeNull();
  });

  it('una cuenta local pendiente no tiene identidad remota', async () => {
    const subject = new SessionAwareRemoteSubject(
      makeLive({ userId: null }),
      makeFallback({
        account: { email: 'pendiente@example.com', remoteUserId: null },
        session: { email: 'pendiente@example.com' },
      }),
    );
    await expect(subject.getUserId()).resolves.toBeNull();
    await expect(subject.getEmail()).resolves.toBe('pendiente@example.com');
  });
});

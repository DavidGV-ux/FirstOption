import type {
  ObservationRepository,
  SubjectIdentityStore,
} from '@/domain/repositories/observation-repository';

export interface AccountScope {
  subjectId: string;
  kind: 'remote' | 'device';
  email: string | null;
}

/**
 * Gestión de alcance por cuenta (Incremento 2+).
 *
 * - La identidad efectiva es la cuenta remota si hay sesión, si no el
 *   scope local del dispositivo. Los repositorios filtran por ese id.
 * - La adopción de registros locales a la cuenta es SIEMPRE explícita:
 *   nunca se reasignan silenciosamente.
 */
export class ManageAccountScopeUseCase {
  constructor(
    private readonly identity: SubjectIdentityStore & {
      getLocalDeviceScopeId(): Promise<string>;
    },
    private readonly repository: ObservationRepository,
    private readonly remoteSubject: { getUserId(): Promise<string | null>; getEmail(): Promise<string | null> } | null,
  ) {}

  async current(): Promise<AccountScope> {
    const subjectId = await this.identity.getOrCreateSubjectId();
    const remoteId = this.remoteSubject === null ? null : await this.remoteSubject.getUserId();
    const email = this.remoteSubject === null ? null : await this.remoteSubject.getEmail();
    return {
      subjectId,
      kind: remoteId !== null && remoteId === subjectId ? 'remote' : 'device',
      email,
    };
  }

  async localRecordCount(): Promise<number> {
    const local = await this.identity.getLocalDeviceScopeId();
    return this.repository.countRecordsBySubject(local);
  }

  async adoptLocalRecords(): Promise<number> {
    const local = await this.identity.getLocalDeviceScopeId();
    const remote = this.remoteSubject === null ? null : await this.remoteSubject.getUserId();
    if (remote === null) {
      throw new Error('Debes iniciar sesión para asociar los registros locales.');
    }
    if (local === remote) return 0;
    return this.repository.adoptSubjectScope(local, remote);
  }
}

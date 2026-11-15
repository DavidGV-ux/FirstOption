import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuthUser,
  RemoteAuthPort,
  RemoteAuthResult,
} from '@/application/use-cases/manage-auth';

/** Adaptador de Supabase Auth con mensajes en español. */
export class SupabaseAuthAdapter implements RemoteAuthPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async getSession(): Promise<AuthUser | null> {
    try {
      const { data } = await this.supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) return null;
      return { userId: user.id, email: user.email ?? '' };
    } catch {
      return null;
    }
  }

  async signIn(email: string, password: string): Promise<RemoteAuthResult> {
    try {
      const { data, error } = await withTimeout(
        this.supabase.auth.signInWithPassword({ email, password }),
      );
      if (error !== null) {
        return {
          ok: false,
          message: mapAuthError(error.message),
          network: isNetworkError(error),
        };
      }
      const user = data.user;
      return {
        ok: true,
        user: user ? { userId: user.id, email: user.email ?? email } : null,
        needsEmailConfirmation: false,
      };
    } catch {
      return {
        ok: false,
        message: 'No se pudo contactar al servidor. Verifica tu conexión.',
        network: true,
      };
    }
  }

  async signUp(
    email: string,
    password: string,
    displayName: string | null,
  ): Promise<RemoteAuthResult> {
    try {
      const { data, error } = await withTimeout(
        this.supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
          },
        }),
      );
      if (error !== null) {
        return {
          ok: false,
          message: mapAuthError(error.message),
          network: isNetworkError(error),
        };
      }

      // El perfil remoto es opcional: si falla (por ejemplo, sin sesión
      // por confirmación de correo), la cuenta local ya quedó guardada.
      if (data.user?.id) {
        try {
          await this.supabase
            .from('profiles')
            .upsert({
              id: data.user.id,
              display_name: displayName,
              updated_at: new Date().toISOString(),
            })
            .select();
        } catch {
          // No bloquear el registro por el perfil remoto.
        }
      }

      return {
        ok: true,
        user: data.user
          ? { userId: data.user.id, email: data.user.email ?? email }
          : null,
        needsEmailConfirmation: data.session === null,
      };
    } catch {
      return {
        ok: false,
        message: 'No se pudo contactar al servidor. Verifica tu conexión.',
        network: true,
      };
    }
  }

  async signOut(): Promise<void> {
    try {
      const { error } = await withTimeout(this.supabase.auth.signOut());
      if (error !== null) throw error;
    } catch {
      // Aunque el servidor no responda, la sesión local debe cerrarse.
      await this.supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
  }
}

/** Evita que una petición de red deje la UI esperando indefinidamente. */
async function withTimeout<T>(work: Promise<T>, ms = 12_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('network timeout')), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

function isNetworkError(error: { message: string; status?: number }): boolean {
  const status = error.status;
  if (status === undefined || status === 0 || status >= 500) return true;
  return /network|fetch|timeout|offline|connection/i.test(error.message);
}

/** Mensajes de error de auth en español, sin exponer detalles técnicos. */
function mapAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (message.includes('already registered') || message.includes('already been registered')) {
    return 'Ese correo ya está registrado. Inicia sesión.';
  }
  if (message.includes('Email not confirmed')) {
    return 'Confirma tu correo antes de iniciar sesión.';
  }
  if (message.toLowerCase().includes('password')) {
    return 'La contraseña no cumple los requisitos mínimos (6 caracteres).';
  }
  if (message.toLowerCase().includes('network')) {
    return 'Sin conexión con el servidor. Inténtalo cuando haya internet.';
  }
  return 'No se pudo completar la operación. Inténtalo de nuevo.';
}

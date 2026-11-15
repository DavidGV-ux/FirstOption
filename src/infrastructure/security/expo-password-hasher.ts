import * as Crypto from 'expo-crypto';
import type { PasswordHasher } from '@/application/use-cases/manage-auth';

/**
 * Hash de contraseña para la verificación local.
 * No sustituye al hash del servidor: solo permite iniciar sesión sin
 * conexión con una cuenta ya guardada en el dispositivo.
 */
export class ExpoPasswordHasher implements PasswordHasher {
  newId(): string {
    return Crypto.randomUUID();
  }

  newSalt(): string {
    return Crypto.randomUUID();
  }

  async hash(password: string, salt: string): Promise<string> {
    return Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${salt}:${password}`,
    );
  }
}

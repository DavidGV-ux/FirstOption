import { randomUUID } from 'expo-crypto';
import type { IdGenerator } from '@/domain/shared/ids';

/** Generador de UUID v4 en el cliente (requerimiento offline-first). */
export class CryptoIdGenerator implements IdGenerator {
  uuid(): string {
    return randomUUID();
  }
}

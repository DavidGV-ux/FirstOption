import type { Clock } from '@/domain/shared/clock';

/**
 * Reloj del sistema para marcar created_at. La fecha de toma real
 * siempre la ingresa la persona; el reloj solo sella cuándo se guardó.
 */
export class SystemClock implements Clock {
  nowIso(): string {
    return new Date().toISOString();
  }
}

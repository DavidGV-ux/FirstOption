/**
 * Antigüedad relativa para la pantalla de inicio.
 *
 * Reglas de honestidad:
 * - Nunca devuelve "normal" ni interpreta la ausencia de datos.
 * - Solo describe cuánto hace que ocurrió un registro.
 */

export type RelativeAge =
  | { kind: 'just_now'; label: string }
  | { kind: 'minutes'; minutes: number; label: string }
  | { kind: 'hours'; hours: number; label: string }
  | { kind: 'days'; days: number; label: string };

function minutesLabel(m: number): string {
  if (m < 1) return 'hace menos de un minuto';
  if (m === 1) return 'hace 1 minuto';
  return `hace ${m} minutos`;
}

function hoursLabel(h: number): string {
  if (h === 1) return 'hace 1 hora';
  return `hace ${h} horas`;
}

function daysLabel(d: number): string {
  if (d === 1) return 'hace 1 día';
  return `hace ${d} días`;
}

/**
 * Diferencia entre un instante y la referencia, con límites superiores
 * por tramo para evitar falsa precisión (p. ej. "hace 1 hora" hasta
 * 89 min). Los cálculos no dependen del índice de fila ni del huso
 * horario local: trabajan con ISO UTC.
 */
export function relativeAgeIso(instantIso: string, nowIso: string): RelativeAge {
  const t = Date.parse(instantIso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(t) || Number.isNaN(now)) {
    throw new Error('Instante inválido');
  }
  const diffMs = now - t;
  if (diffMs < 0) {
    // El esquema de entrada rechaza fechas futuras; esto sería un error
    // de datos y se reporta como tal, nunca como "reciente".
    throw new Error('El instante es posterior a la referencia');
  }
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return { kind: 'just_now', label: 'justo ahora' };
  if (minutes < 60) return { kind: 'minutes', minutes, label: minutesLabel(minutes) };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { kind: 'hours', hours, label: hoursLabel(hours) };
  const days = Math.floor(diffMs / 86_400_000);
  return { kind: 'days', days, label: daysLabel(days) };
}

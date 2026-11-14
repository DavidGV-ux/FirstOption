import { z } from 'zod';
import { ValidationError } from '@/domain/shared/validation-error';

/**
 * Esquema de entrada del registro diario (Incremento 1).
 *
 * Reglas:
 * - Las escalas son enteros dentro de su rango; se rechazan decimales.
 * - Los signos vitales son opcionales; si se ingresa presión arterial,
 *   se requieren ambas componentes con relación PAD < PAS.
 * - No se aceptan fechas futuras: una medición no puede haber ocurrido
 *   después de "ahora".
 * - El sueño es horas decimales 0–16 con un decimal máximo.
 */

export const DAILY_SCALES = {
  min: 1,
  max: 5,
} as const;

export const SLEEP_HOURS_BOUNDS = { min: 0, max: 16 } as const;

export const HEART_RATE_BOUNDS = { min: 25, max: 230 } as const;
export const BP_SYSTOLIC_BOUNDS = { min: 50, max: 280 } as const;
export const BP_DIASTOLIC_BOUNDS = { min: 25, max: 180 } as const;
export const SPO2_BOUNDS = { min: 50, max: 100 } as const;

export const NOTE_MAX_LENGTH = 2000;

const ordinalScale = z
  .number({ message: 'Selecciona un valor' })
  .int('Selecciona un valor de la escala')
  .min(DAILY_SCALES.min, `El valor debe estar entre ${DAILY_SCALES.min} y ${DAILY_SCALES.max}`)
  .max(DAILY_SCALES.max, `El valor debe estar entre ${DAILY_SCALES.min} y ${DAILY_SCALES.max}`);

const optionalInt = (min: number, max: number, label: string) =>
  z
    .number({ message: `Ingresa ${label}` })
    .int(`${label} debe ser un número entero`)
    .min(min, `${label} fuera de rango plausible (${min}–${max})`)
    .max(max, `${label} fuera de rango plausible (${min}–${max})`)
    .nullable();

const optionalDecimal = (min: number, max: number, maxDecimals: number, label: string) =>
  z
    .number({ message: `Ingresa ${label}` })
    .min(min, `${label} fuera de rango plausible (${min}–${max})`)
    .max(max, `${label} fuera de rango plausible (${min}–${max})`)
    .refine(
      (v) => {
        const decimals = (String(v).split('.')[1] ?? '').length;
        return decimals <= maxDecimals;
      },
      { message: `${label} admite hasta ${maxDecimals} decimal(es)` },
    )
    .nullable();

/** Fecha ISO de la toma; se valida además contra el reloj en el caso de uso. */
const observedAtSchema = z
  .string()
  .min(1, 'Ingresa la fecha de la toma')
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Fecha inválida' });

export const dailyLogInputSchema = z
  .object({
    /** Momento de la toma (ISO 8601). */
    observedAt: observedAtSchema,
    missionPhase: z.enum(['preflight', 'inflight', 'postflight'], {
      message: 'Selecciona la fase de la misión',
    }),
    mood: ordinalScale.nullable(),
    stress: ordinalScale.nullable(),
    fatigue: ordinalScale.nullable(),
    sleepQuality: ordinalScale.nullable(),
    sleepHours: optionalDecimal(
      SLEEP_HOURS_BOUNDS.min,
      SLEEP_HOURS_BOUNDS.max,
      1,
      'la duración del sueño',
    ),
    heartRate: optionalInt(
      HEART_RATE_BOUNDS.min,
      HEART_RATE_BOUNDS.max,
      'la frecuencia cardíaca',
    ),
    bpSystolic: optionalInt(
      BP_SYSTOLIC_BOUNDS.min,
      BP_SYSTOLIC_BOUNDS.max,
      'la presión sistólica',
    ),
    bpDiastolic: optionalInt(
      BP_DIASTOLIC_BOUNDS.min,
      BP_DIASTOLIC_BOUNDS.max,
      'la presión diastólica',
    ),
    spo2: optionalInt(SPO2_BOUNDS.min, SPO2_BOUNDS.max, 'la saturación'),
    symptoms: z.record(z.string().min(1), z.boolean()),
    note: z.string().max(NOTE_MAX_LENGTH, `La nota admite hasta ${NOTE_MAX_LENGTH} caracteres`).trim().nullable(),
  })
  .superRefine((input, ctx) => {
    // Presión arterial: o ambas o ninguna.
    if ((input.bpSystolic === null) !== (input.bpDiastolic === null)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Ingresa la presión arterial completa (sistólica y diastólica)',
        path: ['bpSystolic'],
      });
      return;
    }
    if (input.bpSystolic !== null && input.bpDiastolic !== null) {
      if (input.bpDiastolic >= input.bpSystolic) {
        ctx.addIssue({
          code: 'custom',
          message: 'La presión diastólica debe ser menor que la sistólica',
          path: ['bpDiastolic'],
        });
      }
    }
    // Al menos una medición en el registro.
    const hasAny =
      input.mood !== null ||
      input.stress !== null ||
      input.fatigue !== null ||
      input.sleepQuality !== null ||
      input.sleepHours !== null ||
      input.heartRate !== null ||
      input.bpSystolic !== null ||
      input.spo2 !== null ||
      Object.values(input.symptoms).some(Boolean);
    if (!hasAny) {
      ctx.addIssue({
        code: 'custom',
        message: 'Registra al menos una medición o síntoma',
        path: ['mood'],
      });
    }
  });

export type DailyLogInput = z.infer<typeof dailyLogInputSchema>;

/** Error de validación de entrada; el mensaje es para la persona usuaria. */
export { ValidationError };

/** Parsea y normaliza la entrada; lanza ValidationError con mensajes en español. */
export function parseDailyLogInput(raw: unknown): DailyLogInput {
  const result = dailyLogInputSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || '_form';
    if (!fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  throw new ValidationError(fieldErrors);
}

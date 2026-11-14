import { z } from 'zod';
import { NOTE_MAX_LENGTH, ValidationError } from './daily-log-schema';

/**
 * Esquema de entrada de la inspección pupilar documentada (linterna).
 *
 * Reglas honestas:
 * - La linterna NO deriva ninguna medición: lo que se guarda es lo que
 *   la persona usuaria observa y describe, más una respuesta explícita
 *   opcional sobre alteración visual (síntoma del catálogo v1).
 * - Se exige al menos una nota o una respuesta registrada: no se crean
 *   sesiones vacías.
 * - La fase de misión es obligatoria y explícita (no se adivina).
 */

export const VISUAL_DISTURBANCE_ANSWERS = ['si', 'no', 'no_evaluado'] as const;
export type VisualDisturbanceAnswer = (typeof VISUAL_DISTURBANCE_ANSWERS)[number];

export const inspectionInputSchema = z
  .object({
    missionPhase: z.enum(['preflight', 'inflight', 'postflight'], {
      message: 'Selecciona la fase de la misión',
    }),
    /** Respuesta observada sobre alteración visual; null = no evaluado. */
    visualDisturbance: z.enum(VISUAL_DISTURBANCE_ANSWERS).nullable(),
    /** Descripción libre de lo observado; opcional. */
    note: z
      .string()
      .max(NOTE_MAX_LENGTH, `La nota admite hasta ${NOTE_MAX_LENGTH} caracteres`)
      .trim()
      .nullable(),
  })
  .superRefine((input, ctx) => {
    const hasNote = input.note !== null && input.note.length > 0;
    const hasAnswer = input.visualDisturbance !== null;
    if (!hasNote && !hasAnswer) {
      ctx.addIssue({
        code: 'custom',
        message: 'Escribe lo observado o registra una respuesta antes de guardar',
        path: ['note'],
      });
    }
  });

export type InspectionInput = z.infer<typeof inspectionInputSchema>;

/** Parsea y normaliza la entrada; lanza ValidationError con mensajes en español. */
export function parseInspectionInput(raw: unknown): InspectionInput {
  const result = inspectionInputSchema.safeParse(raw);
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

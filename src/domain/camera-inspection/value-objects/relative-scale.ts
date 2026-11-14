import { ValidationError } from '@/domain/shared/validation-error';

/**
 * Escala relativa experimental de diámetro pupilar.
 *
 * REGLAS HONESTAS Y ÉTICAS:
 * - Es un número adimensional (ratio área o diámetro relativo a iris/referencia).
 * - NO equivale a milímetros bajo ninguna circunstancia.
 * - NO es válida para comparar entre personas.
 * - Válida SOLO para comparar capturas sucesivas de la misma persona y condiciones.
 * - Rango plausible de ratio pupila/iris en visión humana: ~0.15 a ~0.85.
 */
export class RelativePupilScale {
  readonly value: number;

  constructor(value: number) {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      throw new ValidationError({
        relativeScale: 'El valor de la escala relativa debe ser un número finito.',
      });
    }
    if (value <= 0 || value > 1.0) {
      throw new ValidationError({
        relativeScale:
          'La escala relativa debe estar en el intervalo (0, 1.0]. No representa unidades absolutas.',
      });
    }
    // Redondear a 3 decimales para evitar falsa precisión
    this.value = Math.round(value * 1000) / 1000;
  }

  /**
   * Representación textual formateada.
   */
  format(): string {
    return this.value.toFixed(2).replace('.', ',');
  }

  /**
   * Etiquetas obligatorias de advertencia.
   */
  static readonly DISCLAIMER_TEXT =
    'Escala relativa experimental. No equivale a milímetros y no es válida para comparar entre personas.';
}

/**
 * Error de validación de entrada. El mensaje legible y los errores
 * por campo son para la persona usuaria (nunca para diagnóstico).
 */
export class ValidationError extends Error {
  readonly fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>) {
    super('Entrada inválida');
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

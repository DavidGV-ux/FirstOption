/**
 * Puerto de reloj. El dominio no lee el reloj del sistema directamente:
 * la infraestructura lo provee. Nunca se usa como sustituto de la fecha
 * de toma reportada por el participante.
 */
export interface Clock {
  /** Instante actual en ISO 8601 UTC. */
  nowIso(): string;
}

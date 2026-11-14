/**
 * Puerto de generación de identificadores. Los UUID se generan en el
 * cliente (requerimiento offline-first); la implementación vive en
 * infraestructura (expo-crypto).
 */
export interface IdGenerator {
  uuid(): string;
}

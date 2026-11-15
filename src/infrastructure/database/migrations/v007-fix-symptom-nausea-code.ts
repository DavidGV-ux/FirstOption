/**
 * Migración v7 / reparación de compatibilidad: corrige el código legado
 * "symptom_nauseas" -> "symptom_nausea".
 *
 * No destructiva e idempotente:
 * - Corrige observaciones locales persistidas con el código legado.
 * - Corrige payloads de sync_outbox (claves metric_id / metricid / metric_code).
 * - Solo re-encola operaciones no completadas (pending/failed) y limpia
 *   last_error de esas filas; conserva attempts/IDs y no elimina registros.
 */
export const MIGRATION_V7_STATEMENTS: readonly string[] = [
  `UPDATE observations
   SET metric_id = 'symptom_nausea'
   WHERE metric_id = 'symptom_nauseas'`,

  `UPDATE sync_outbox
   SET payload = replace(payload, '"metric_id":"symptom_nauseas"', '"metric_id":"symptom_nausea"')
   WHERE payload LIKE '%"metric_id":"symptom_nauseas"%'`,

  `UPDATE sync_outbox
   SET payload = replace(payload, '"metricid":"symptom_nauseas"', '"metricid":"symptom_nausea"')
   WHERE payload LIKE '%"metricid":"symptom_nauseas"%'`,

  `UPDATE sync_outbox
   SET payload = replace(payload, '"metric_code":"symptom_nauseas"', '"metric_code":"symptom_nausea"')
   WHERE payload LIKE '%"metric_code":"symptom_nauseas"%'`,

  // Fallback acotado al token conocido; re-encola solo pending/failed y limpia su last_error.
  `UPDATE sync_outbox
   SET payload = replace(payload, 'symptom_nauseas', 'symptom_nausea'),
       state = CASE WHEN state IN ('pending', 'failed') THEN 'pending' ELSE state END,
       last_error = CASE WHEN state IN ('pending', 'failed') THEN NULL ELSE last_error END
   WHERE payload LIKE '%symptom_nauseas%'`,
];

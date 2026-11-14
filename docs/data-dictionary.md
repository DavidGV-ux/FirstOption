# Diccionario de datos (Incremento 1)

Esquema local SQLite versión 1 (`PRAGMA user_version = 1`). Las tablas
del esquema remoto (profiles, missions, …) se documentan como
migraciones propuestas cuando entre en juego el Incremento 2.

## metric_definitions

Catálogo de métricas medibles. Toda observación referencia una fila.

| Campo | Tipo | Notas |
|---|---|---|
| metric_id | TEXT PK | snake_case, p. ej. `hemoglobin`, `mood_self_report` |
| name_es | TEXT | Nombre visible en español |
| short_name_es | TEXT NULL | Abreviatura, p. ej. `Hb` |
| category | TEXT | `daily_self_report` \| `symptom` \| `vital` \| `hematology` |
| value_type | TEXT | `ordinal_scale` \| `integer` \| `decimal` \| `boolean` |
| canonical_unit | TEXT NULL | Unidad canónica (p. ej. `g/L`); null en escalas y booleanos |
| scale_min / scale_max | INTEGER NULL | Solo escalas ordinales (1–5) |
| plausible_min / plausible_max | REAL NULL | Límites de calidad de datos; **no** son umbrales clínicos |
| max_decimals | INTEGER NULL | Precisión máxima de captura |
| definition_version | INTEGER | Versión de la definición |

## measurement_sessions

Una sesión = un registro del participante en un momento.

| Campo | Tipo | Notas |
|---|---|---|
| session_id | TEXT PK | UUID generado en el cliente |
| subject_id | TEXT | Identidad del participante (local en Inc 1; Supabase Auth en Inc 2) |
| mission_phase | TEXT | `preflight` \| `inflight` \| `postflight` |
| recorded_at | TEXT | ISO 8601 UTC del guardado |
| recorded_local_date | TEXT | Fecha local YYYY-MM-DD del guardado |
| source | TEXT | `manual_entry` (Inc 1) |
| note | TEXT NULL | Nota opcional del registro |
| sync_state | TEXT | `local_only` \| `pending_sync` \| `synced` \| `sync_failed` \| `conflict` |
| created_at | TEXT | ISO 8601 UTC |

## observations

Una fila por métrica dentro de una sesión.

| Campo | Tipo | Notas |
|---|---|---|
| observation_id | TEXT PK | Determinista: `sessionId:metricId` (idempotencia local) |
| session_id | TEXT FK → measurement_sessions | |
| metric_id | TEXT FK → metric_definitions | |
| value_original | REAL | Valor en la unidad original |
| unit_original | TEXT NULL | Unidad original (null en escalas/booleanos) |
| value_normalized | REAL NULL | Solo con conversión verificada (Inc 3); null por defecto |
| unit_normalized | TEXT NULL | |
| observed_at | TEXT | ISO 8601 UTC de la **toma** |
| local_date | TEXT | Fecha local de la toma |
| quality_state | TEXT | `ok` \| `suspect` \| `invalid` |
| sync_state | TEXT | Igual que sesiones |
| created_at | TEXT | |

## schema_meta

Clave/valor internos: `local_subject_id`, `metric_catalog_version`,
`schema_started_at_utc`.

## Convenciones

- Todas las marcas de tiempo ISO 8601 UTC; las fechas locales van en
  campos `local_date`/`recorded_local_date`.
- El valor original **nunca** se sobrescribe: las correcciones (Inc 3+)
  preservarán el original y marcarán análisis desactualizados.
- Sin eliminación en cascada: ninguna operación silenciosa borra datos
  clínicos.

## Tablas del esquema remoto (propuestas, Inc 2+)

Cuando exista el proyecto Supabase se propondrán migraciones no
destructivas para: profiles, missions, mission_memberships,
care_team_assignments, metric_definitions (remota), lab_panels,
attachments, baseline_versions, analysis_definitions, analysis_runs,
analysis_input_observations, forecast_points, protocol_versions,
review_events, consents, audit_events; y locales: sync_outbox,
sync_cursors, sync_conflicts. Cada propuesta incluirá RLS y supuestos
documentados.

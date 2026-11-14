-- Órbita Salud — Propuesta: análisis reproducibles (Incrementos 4–5)
-- ESTADO: PROPUESTA — no aplicada.
-- Requisito central: cada analysis_run debe ser REPRODUCIBLE. No basta
-- una explicación textual: se guardan método, versión, parámetros,
-- fecha de corte, línea basal usada y las observaciones de entrada.

-- ---------------------------------------------------------------------------
-- baseline_versions: líneas basales versionadas
-- ---------------------------------------------------------------------------
create table if not exists public.baseline_versions (
  baseline_id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references auth.users (id) on delete cascade,
  metric_id text not null references public.metric_definitions (metric_id),
  version integer not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  method text not null,
  method_version integer not null default 1,
  parameters jsonb not null default '{}'::jsonb,
  conditions jsonb not null default '{}'::jsonb,     -- fase, dispositivo, etc.
  state text not null default 'provisional'
    check (state in ('provisional','reviewed','superseded')),
  source_observation_ids uuid[] not null default '{}',
  computed_at timestamptz not null default now(),
  computed_by text not null default 'client',
  unique (subject_id, metric_id, version)
);

-- ---------------------------------------------------------------------------
-- analysis_definitions: definiciones versionadas de análisis
-- ---------------------------------------------------------------------------
create table if not exists public.analysis_definitions (
  analysis_def_id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null
    check (kind in ('descriptive','trend','forecast','threshold_scenario')),
  metric_scope text[] not null default '{}',
  method text not null,
  method_version integer not null default 1,
  parameters jsonb not null default '{}'::jsonb,
  min_requirements jsonb not null default '{}'::jsonb, -- configurables por métrica
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- analysis_runs: ejecuciones reproducibles
-- status: done | outdated | error | not_concluded
-- ---------------------------------------------------------------------------
create table if not exists public.analysis_runs (
  analysis_run_id uuid primary key default gen_random_uuid(),
  analysis_def_id uuid not null references public.analysis_definitions (analysis_def_id),
  subject_id uuid not null references auth.users (id) on delete cascade,
  metric_id text not null references public.metric_definitions (metric_id),
  status text not null default 'done'
    check (status in ('done','outdated','error','not_concluded')),
  as_of timestamptz not null,                        -- fecha de corte (datos ≤ as_of)
  baseline_id uuid references public.baseline_versions (baseline_id),
  method text not null,
  method_version integer not null,
  parameters jsonb not null default '{}'::jsonb,
  result jsonb,                                      -- resultado tipado, no solo texto
  eligibility jsonb,                                 -- checks de elegibilidad ejecutados
  limitations jsonb not null default '[]'::jsonb,
  validation_state text not null default 'unvalidated',
  input_fingerprint text,                            -- hash de los ids de entrada
  created_at timestamptz not null default now(),
  server_received_at timestamptz not null default now(),
  superseded_by uuid references public.analysis_runs (analysis_run_id)
);
create index if not exists idx_runs_subject_metric
  on public.analysis_runs (subject_id, metric_id, as_of desc);

-- ---------------------------------------------------------------------------
-- analysis_input_observations: vínculo explícito run ↔ observaciones usadas
-- ---------------------------------------------------------------------------
create table if not exists public.analysis_input_observations (
  analysis_run_id uuid not null references public.analysis_runs (analysis_run_id)
    on delete cascade,
  observation_id text not null references public.observations (observation_id),
  used_as text not null default 'input'
    check (used_as in ('input','excluded_outlier','excluded_quality')),
  primary key (analysis_run_id, observation_id)
);

-- ---------------------------------------------------------------------------
-- forecast_points: puntos proyectados con incertidumbre solo si es real
-- ---------------------------------------------------------------------------
create table if not exists public.forecast_points (
  point_id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references public.analysis_runs (analysis_run_id)
    on delete cascade,
  target_time timestamptz not null,
  estimate numeric,
  pi_lower numeric,        -- intervalo de PREDICCIÓN real (nunca IC de la media)
  pi_upper numeric,
  pi_level numeric,        -- nivel nominal, p. ej. 0.80
  assumptions jsonb not null default '{}'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  unique (analysis_run_id, target_time)
);

-- ---------------------------------------------------------------------------
-- protocol_versions: protocolos deterministas y versionados
-- approved_* controlan si puede emitir eventos clínicos; sin aprobación
-- solo recordatorios/descriptivos.
-- ---------------------------------------------------------------------------
create table if not exists public.protocol_versions (
  protocol_id text not null,
  version integer not null,
  name_es text not null,
  source text not null,
  population text not null,
  units text,
  conditions jsonb not null default '{}'::jsonb,
  rules jsonb not null default '[]'::jsonb,          -- deterministas, explicables
  approval_state text not null default 'not_approved'
    check (approval_state in ('not_approved','approved_for_reminders',
                              'approved_for_descriptive','approved_for_clinical')),
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (protocol_id, version)
);

-- ---------------------------------------------------------------------------
-- review_events: revisión humana de eventos y alertas (Inc 6)
-- ---------------------------------------------------------------------------
create table if not exists public.review_events (
  review_id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null check (entity_type in ('analysis_run','session','protocol_event')),
  entity_id text not null,
  outcome text not null
    check (outcome in ('reviewed_ok','escalated','dismissed','corrected')),
  reviewer uuid references auth.users (id),
  reason text not null,
  created_at timestamptz not null default now()
);

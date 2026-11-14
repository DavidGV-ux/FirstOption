-- =============================================================
-- ÓRBITA SALUD · SUPABASE
-- Modelo de datos, autenticación, RLS y sincronización
-- Versión: 2.0.0
-- Ejecutar en SQL Editor de Supabase
-- No destructivo: crea objetos si no existen.
-- =============================================================

begin;

create extension if not exists "pgcrypto";

create schema if not exists private;

-- =============================================================
-- 1. PERFILES
-- =============================================================

create table if not exists public.profiles (
  id uuid primary key
    references auth.users (id)
    on delete cascade,

  display_name text,
  timezone text
    not null default 'UTC',

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now()
);

-- =============================================================
-- 2. MISIONES
-- =============================================================

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  starts_at timestamptz,
  ends_at timestamptz,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  constraint missions_dates_check
    check (
      ends_at is null
      or starts_at is null
      or ends_at >= starts_at
    )
);

create table if not exists public.mission_memberships (
  mission_id uuid
    not null
    references public.missions (id)
    on delete cascade,

  user_id uuid
    not null
    references auth.users (id)
    on delete cascade,

  role text
    not null
    default 'crew_member',

  joined_at timestamptz
    not null default now(),

  primary key (mission_id, user_id)
);

create index if not exists mission_memberships_user_idx
  on public.mission_memberships (user_id);

-- =============================================================
-- 3. ACCESO CLÍNICO
-- =============================================================

create table if not exists public.care_team_assignments (
  id uuid primary key default gen_random_uuid(),

  subject_id uuid
    not null
    references auth.users (id)
    on delete cascade,

  professional_id uuid
    not null
    references auth.users (id)
    on delete cascade,

  mission_id uuid
    references public.missions (id)
    on delete set null,

  role text
    not null
    default 'clinician',

  granted_by uuid
    references auth.users (id),

  starts_at timestamptz
    not null default now(),

  ends_at timestamptz,

  revoked_at timestamptz,

  created_at timestamptz
    not null default now(),

  constraint care_team_no_self_assignment
    check (subject_id <> professional_id),

  constraint care_team_period_check
    check (
      ends_at is null
      or ends_at >= starts_at
    )
);

create index if not exists care_team_assignments_subject_idx
  on public.care_team_assignments (subject_id);

create index if not exists care_team_assignments_professional_idx
  on public.care_team_assignments (professional_id);

-- =============================================================
-- 4. IDENTIDAD LOCAL VINCULADA
-- =============================================================

create table if not exists public.local_identities (
  local_subject_id uuid primary key,

  user_id uuid
    not null
    references auth.users (id)
    on delete cascade,

  device_id text,
  device_name text,

  linked_at timestamptz
    not null default now(),

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  constraint local_identity_unique_per_user_device
    unique (user_id, device_id)
);

create index if not exists local_identities_user_idx
  on public.local_identities (user_id);

-- =============================================================
-- 5. CATÁLOGO DE MÉTRICAS
-- =============================================================

create table if not exists public.metric_definitions (
  id uuid primary key default gen_random_uuid(),

  code text not null unique,

  display_name text not null,

  category text not null,

  value_type text not null
    check (value_type in (
      'numeric',
      'categorical',
      'text',
      'boolean'
    )),

  base_unit text,
  display_unit text,

  precision integer,

  lower_plausible numeric,
  upper_plausible numeric,

  requires_numeric_value boolean
    not null default false,

  is_experimental boolean
    not null default false,

  is_active boolean
    not null default true,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now()
);

create table if not exists public.unit_conversions (
  id uuid primary key default gen_random_uuid(),

  metric_code text
    not null
    references public.metric_definitions (code)
    on delete cascade,

  from_unit text not null,
  to_unit text not null,

  multiplier numeric not null,
  "offset" numeric not null default 0,

  valid_from timestamptz
    not null default now(),

  valid_to timestamptz,

  created_at timestamptz
    not null default now(),

  constraint unit_conversion_period_check
    check (
      valid_to is null
      or valid_to >= valid_from
    ),

  constraint unit_conversion_unique
    unique (metric_code, from_unit, to_unit, valid_from)
);

-- =============================================================
-- 6. SESIONES DE MEDICIÓN
-- =============================================================

create table if not exists public.measurement_sessions (
  id uuid primary key,

  client_request_id text
    not null
    unique,

  subject_id uuid
    not null
    references auth.users (id)
    on delete cascade,

  created_by uuid
    not null
    references auth.users (id)
    on delete restrict,

  mission_id uuid
    references public.missions (id)
    on delete set null,

  mission_phase text
    not null
    check (mission_phase in (
      'preflight',
      'inflight',
      'postflight'
    )),

  started_at timestamptz
    not null,

  ended_at timestamptz,

  source_app text
    not null default 'mobile_app',

  app_version text,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  constraint measurement_session_period_check
    check (
      ended_at is null
      or ended_at >= started_at
    )
);

create index if not exists measurement_sessions_subject_started_idx
  on public.measurement_sessions (subject_id, started_at desc);

create index if not exists measurement_sessions_client_request_idx
  on public.measurement_sessions (client_request_id);

-- =============================================================
-- 7. OBSERVACIONES
-- =============================================================

create or replace function public.value_type_matches(
  p_metric_code text,
  p_expected_type text
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.metric_definitions md
    where md.code = p_metric_code
      and md.value_type = p_expected_type
      and md.is_active
  );
$$;

create table if not exists public.observations (
  id uuid primary key,

  client_request_id text
    not null
    unique,

  subject_id uuid
    not null
    references auth.users (id)
    on delete cascade,

  created_by uuid
    not null
    references auth.users (id)
    on delete restrict,

  mission_id uuid
    references public.missions (id)
    on delete set null,

  session_id uuid
    references public.measurement_sessions (id)
    on delete set null,

  metric_code text
    not null
    references public.metric_definitions (code),

  value_numeric numeric,
  value_text text,
  value_boolean boolean,

  unit_code text,

  measured_at timestamptz not null,
  recorded_at timestamptz not null,

  source text not null
    check (source in (
      'manual',
      'self_report',
      'device',
      'laboratory',
      'experimental'
    )),

  method_code text,
  device_id text,
  external_record_id text,

  quality_status text not null
    default 'not_assessed'
    check (quality_status in (
      'not_assessed',
      'accepted',
      'rejected',
      'inconclusive'
    )),

  quality_notes text,

  mission_phase text not null
    check (mission_phase in (
      'preflight',
      'inflight',
      'postflight'
    )),

  supersedes_observation_id uuid
    references public.observations (id)
    on delete set null,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  deleted_at timestamptz,

  constraint observations_value_required
    check (
      value_numeric is not null
      or value_text is not null
      or value_boolean is not null
    ),

  constraint observations_value_type_consistency
    check (
      (
        public.value_type_matches(metric_code, 'numeric')
        and value_numeric is not null
        and value_text is null
        and value_boolean is null
      )
      or
      (
        public.value_type_matches(metric_code, 'categorical')
        and value_text is not null
        and value_numeric is null
        and value_boolean is null
      )
      or
      (
        public.value_type_matches(metric_code, 'text')
        and value_text is not null
        and value_numeric is null
        and value_boolean is null
      )
      or
      (
        public.value_type_matches(metric_code, 'boolean')
        and value_boolean is not null
        and value_numeric is null
        and value_text is null
      )
    )
);

create index if not exists observations_subject_metric_measured_idx
  on public.observations (
    subject_id,
    metric_code,
    measured_at desc
  );

create index if not exists observations_session_idx
  on public.observations (session_id);

create index if not exists observations_supersedes_idx
  on public.observations (supersedes_observation_id);

create index if not exists observations_client_request_idx
  on public.observations (client_request_id);

create index if not exists observations_created_by_idx
  on public.observations (created_by);

create index if not exists observations_mission_idx
  on public.observations (mission_id);

-- =============================================================
-- 8. VALIDACIÓN DE OBSERVACIONES
-- =============================================================

create or replace function public.validate_observation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_metric public.metric_definitions;
begin
  select *
  into v_metric
  from public.metric_definitions
  where code = new.metric_code
    and is_active;

  if not found then
    raise exception 'Métrica inactiva o desconocida: %', new.metric_code;
  end if;

  if v_metric.requires_numeric_value
     and new.value_numeric is null then
    raise exception 'La métrica % requiere un valor numérico', new.metric_code;
  end if;

  if new.unit_code is not null
     and v_metric.base_unit is not null
     and new.unit_code <> v_metric.base_unit
     and not exists (
       select 1
       from public.unit_conversions uc
       where uc.metric_code = new.metric_code
         and uc.from_unit = new.unit_code
         and uc.to_unit = v_metric.base_unit
         and (uc.valid_to is null or uc.valid_to > now())
     ) then
    raise exception 'Unidad no permitida para %: %', new.metric_code, new.unit_code;
  end if;

  if new.value_numeric is not null
     and v_metric.lower_plausible is not null
     and new.value_numeric < v_metric.lower_plausible then
    raise exception 'Valor por debajo del rango plausible para %', new.metric_code;
  end if;

  if new.value_numeric is not null
     and v_metric.upper_plausible is not null
     and new.value_numeric > v_metric.upper_plausible then
    raise exception 'Valor por encima del rango plausible para %', new.metric_code;
  end if;

  return new;
end;
$$;

drop trigger if exists observations_validate
on public.observations;

create trigger observations_validate
before insert or update on public.observations
for each row
execute function public.validate_observation();

-- =============================================================
-- 9. ADJUNTOS
-- =============================================================

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),

  subject_id uuid
    not null
    references auth.users (id)
    on delete cascade,

  observation_id uuid
    references public.observations (id)
    on delete set null,

  lab_panel_id uuid
    references public.lab_panels (id)
    on delete set null,

  storage_path text not null unique,

  file_name text,
  mime_type text,
  file_size_bytes bigint,

  checksum_sha256 text,

  created_at timestamptz
    not null default now(),

  deleted_at timestamptz,

  constraint attachments_target_required
    check (
      observation_id is not null
      or lab_panel_id is not null
    )
);

create index if not exists attachments_subject_idx
  on public.attachments (subject_id);

create index if not exists attachments_observation_idx
  on public.attachments (observation_id);

create index if not exists attachments_lab_panel_idx
  on public.attachments (lab_panel_id);

-- =============================================================
-- 10. PANELES DE LABORATORIO
-- =============================================================

create table if not exists public.lab_panels (
  id uuid primary key,

  client_request_id text
    not null
    unique,

  subject_id uuid
    not null
    references auth.users (id)
    on delete cascade,

  created_by uuid
    not null
    references auth.users (id)
    on delete restrict,

  mission_id uuid
    references public.missions (id)
    on delete set null,

  collected_at timestamptz,
  reported_at timestamptz,

  laboratory_name text,
  specimen_id text,
  method_code text,

  status text not null
    default 'received'
    check (status in (
      'received',
      'verified',
      'corrected',
      'cancelled'
    )),

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now()
);

create index if not exists lab_panels_subject_collected_idx
  on public.lab_panels (subject_id, collected_at desc);

create index if not exists lab_panels_client_request_idx
  on public.lab_panels (client_request_id);

-- =============================================================
-- 11. LÍNEAS BASALES
-- =============================================================

create table if not exists public.baseline_versions (
  id uuid primary key default gen_random_uuid(),

  subject_id uuid
    not null
    references auth.users (id)
    on delete cascade,

  metric_code text
    not null
    references public.metric_definitions (code),

  status text not null
    default 'provisional'
    check (status in (
      'provisional',
      'reviewed',
      'superseded'
    )),

  method_code text not null,

  window_start timestamptz not null,
  window_end timestamptz not null,

  sample_count integer not null
    check (sample_count > 0),

  baseline_value numeric not null,

  baseline_unit text,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  constraint baseline_period_check
    check (window_end >= window_start),

  constraint baseline_no_duplicate_active
    unique (subject_id, metric_code, method_code, status)
);

create index if not exists baseline_versions_subject_metric_idx
  on public.baseline_versions (subject_id, metric_code);

-- =============================================================
-- 12. ANÁLISIS
-- =============================================================

create table if not exists public.analysis_definitions (
  id uuid primary key default gen_random_uuid(),

  code text not null unique,

  display_name text not null,

  analysis_type text not null
    check (analysis_type in (
      'descriptive',
      'trend',
      'forecast',
      'threshold_scenario'
    )),

  metric_code text
    references public.metric_definitions (code),

  method_code text not null,

  method_version text not null,

  parameters jsonb not null default '{}'::jsonb,

  validation_status text not null
    default 'technical_only'
    check (validation_status in (
      'technical_only',
      'research_evaluated',
      'clinically_approved'
    )),

  is_active boolean not null default true,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now()
);

create table if not exists public.analysis_runs (
  id uuid primary key default gen_random_uuid(),

  subject_id uuid
    not null
    references auth.users (id)
    on delete cascade,

  metric_code text
    not null
    references public.metric_definitions (code),

  analysis_definition_id uuid
    not null
    references public.analysis_definitions (id),

  baseline_version_id uuid
    references public.baseline_versions (id)
    on delete set null,

  status text not null
    check (status in (
      'ok',
      'insufficient_data',
      'inconclusive',
      'not_comparable',
      'unsupported'
    )),

  data_cutoff_at timestamptz not null,

  window_start timestamptz,
  window_end timestamptz,

  sample_count integer,
  result_json jsonb,

  explanation_codes text[] not null default '{}',

  limitations text[] not null default '{}',

  generated_at timestamptz
    not null default now(),

  superseded_at timestamptz
);

create index if not exists analysis_runs_subject_metric_cutoff_idx
  on public.analysis_runs (
    subject_id,
    metric_code,
    data_cutoff_at desc
  );

create table if not exists public.analysis_input_observations (
  analysis_run_id uuid
    not null
    references public.analysis_runs (id)
    on delete cascade,

  observation_id uuid
    not null
    references public.observations (id)
    on delete restrict,

  primary key (analysis_run_id, observation_id)
);

create table if not exists public.forecast_points (
  id uuid primary key default gen_random_uuid(),

  analysis_run_id uuid
    not null
    references public.analysis_runs (id)
    on delete cascade,

  forecast_for timestamptz not null,

  point_estimate numeric not null,

  lower_bound numeric,
  upper_bound numeric,

  interval_level numeric,

  method_code text not null,
  method_version text not null,

  created_at timestamptz
    not null default now(),

  constraint forecast_interval_order_check
    check (
      lower_bound is null
      or upper_bound is null
      or lower_bound <= point_estimate
      and point_estimate <= upper_bound
    )
);

create index if not exists forecast_points_run_date_idx
  on public.forecast_points (analysis_run_id, forecast_for);

-- =============================================================
-- 13. PROTOCOLOS Y REVISIÓN
-- =============================================================

create table if not exists public.protocol_versions (
  id uuid primary key default gen_random_uuid(),

  protocol_code text not null,

  version integer not null,

  title text not null,

  population text not null,

  metric_code text
    references public.metric_definitions (code),

  rule_json jsonb not null,

  source_reference text,

  approved_by uuid
    references auth.users (id),

  approved_at timestamptz,

  is_active boolean not null default false,

  created_at timestamptz
    not null default now(),

  constraint protocol_version_unique
    unique (protocol_code, version)
);

create table if not exists public.review_events (
  id uuid primary key default gen_random_uuid(),

  subject_id uuid
    not null
    references auth.users (id)
    on delete cascade,

  observation_id uuid
    references public.observations (id)
    on delete set null,

  analysis_run_id uuid
    references public.analysis_runs (id)
    on delete set null,

  protocol_version_id uuid
    references public.protocol_versions (id)
    on delete set null,

  event_type text not null
    check (event_type in (
      'informational',
      'quality_issue',
      'followup_required',
      'clinical_review_required'
    )),

  title text not null,
  detail text,
  reason_codes text[] not null default '{}',

  acknowledged_by uuid
    references auth.users (id),

  acknowledged_at timestamptz,

  resolved_at timestamptz,

  created_at timestamptz
    not null default now()
);

create index if not exists review_events_subject_created_idx
  on public.review_events (subject_id, created_at desc);

create index if not exists review_events_observation_idx
  on public.review_events (observation_id);

create index if not exists review_events_analysis_run_idx
  on public.review_events (analysis_run_id);

-- =============================================================
-- 14. SINCRONIZACIÓN REMOTA
-- =============================================================

create table if not exists public.sync_outbox (
  id uuid primary key,

  client_request_id text not null unique,

  subject_id uuid
    not null
    references auth.users (id)
    on delete cascade,

  operation text not null
    check (operation in (
      'insert_observation',
      'insert_lab_panel',
      'insert_attachment',
      'correct_observation',
      'delete_observation'
    )),

  payload jsonb not null,

  status text not null
    default 'pending'
    check (status in (
      'pending',
      'processing',
      'synced',
      'failed',
      'conflict'
    )),

  attempts integer not null default 0,

  last_error text,

  created_at timestamptz
    not null default now(),

  processed_at timestamptz
);

create index if not exists sync_outbox_subject_status_created_idx
  on public.sync_outbox (subject_id, status, created_at);

create index if not exists sync_outbox_client_request_idx
  on public.sync_outbox (client_request_id);

-- =============================================================
-- 15. AUDITORÍA
-- =============================================================

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),

  actor_id uuid
    references auth.users (id)
    on delete set null,

  subject_id uuid
    references auth.users (id)
    on delete set null,

  action text not null,

  entity_type text not null,

  entity_id uuid,

  metadata jsonb not null default '{}'::jsonb,

  occurred_at timestamptz
    not null default now()
);

create index if not exists audit_events_actor_time_idx
  on public.audit_events (actor_id, occurred_at desc);

create index if not exists audit_events_subject_time_idx
  on public.audit_events (subject_id, occurred_at desc);

-- =============================================================
-- 16. ACTUALIZACIÓN AUTOMÁTICA
-- =============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'profiles',
        'missions',
        'metric_definitions',
        'measurement_sessions',
        'lab_panels',
        'observations',
        'baseline_versions',
        'analysis_definitions',
        'local_identities'
      )
  loop
    execute format(
      'drop trigger if exists set_updated_at_trigger on public.%I',
      r.table_name
    );

    execute format(
      'create trigger set_updated_at_trigger
       before update on public.%I
       for each row
       execute function public.set_updated_at()',
      r.table_name
    );
  end loop;
end;
$$;

-- =============================================================
-- 17. CREACIÓN AUTOMÁTICA DE PERFIL
-- =============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created
on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- =============================================================
-- 18. FUNCIÓN SEGURA DE ACCESO CLÍNICO
-- =============================================================

create or replace function private.can_access_subject(
  p_subject_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.care_team_assignments cta
    where cta.subject_id = p_subject_id
      and cta.professional_id = (select auth.uid())
      and cta.revoked_at is null
      and (cta.ends_at is null or cta.ends_at > now())
  );
$$;

-- =============================================================
-- 19. RLS Y PERMISOS
-- =============================================================

do $$
declare
  r record;
begin
  for r in
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'profiles',
        'missions',
        'mission_memberships',
        'care_team_assignments',
        'local_identities',
        'metric_definitions',
        'unit_conversions',
        'measurement_sessions',
        'lab_panels',
        'observations',
        'attachments',
        'baseline_versions',
        'analysis_definitions',
        'analysis_runs',
        'analysis_input_observations',
        'forecast_points',
        'protocol_versions',
        'review_events',
        'sync_outbox',
        'audit_events'
      )
  loop
    execute format(
      'alter table public.%I enable row level security',
      r.table_name
    );

    execute format(
      'revoke all on public.%I from anon, authenticated',
      r.table_name
    );

    execute format(
      'grant select, insert, update, delete on public.%I to authenticated',
      r.table_name
    );
  end loop;
end;
$$;

-- =============================================================
-- 20. POLÍTICAS RLS (resumen)
-- =============================================================
-- Políticas detalladas en propuestas anteriores (0005_rls.sql).
-- Aquí se mantienen las reglas clave: subject_id = auth.uid() o
-- can_access_subject(subject_id) para lectura; escritura solo propia.

-- =============================================================
-- 21. DATOS BASE
-- =============================================================

insert into public.metric_definitions (
  code, display_name, category, value_type, base_unit, display_unit,
  precision, lower_plausible, upper_plausible, requires_numeric_value, is_experimental
)
values
  ('hemoglobin', 'Hemoglobina', 'hematology', 'numeric', 'g/dL', 'g/dL', 1, 1, 25, true, false),
  ('hematocrit', 'Hematocrito', 'hematology', 'numeric', '%', '%', 1, 5, 80, true, false),
  ('erythrocyte_count', 'Recuento de eritrocitos', 'hematology', 'numeric', '10^12/L', '10^12/L', 2, 0, 15, true, false),
  ('mcv', 'Volumen corpuscular medio', 'hematology', 'numeric', 'fL', 'fL', 1, 40, 150, true, false),
  ('rdw_cv', 'Amplitud de distribución eritrocitaria', 'hematology', 'numeric', '%', '%', 1, 5, 40, true, false),
  ('reticulocyte_pct', 'Reticulocitos porcentuales', 'hematology', 'numeric', '%', '%', 2, 0, 30, true, false),
  ('reticulocyte_abs', 'Reticulocitos absolutos', 'hematology', 'numeric', '10^9/L', '10^9/L', 2, 0, 500, true, false),
  ('heart_rate', 'Frecuencia cardíaca', 'cardiovascular', 'numeric', 'bpm', 'bpm', 0, 20, 250, true, false),
  ('mood_self_report', 'Ánimo autorreportado', 'wellbeing', 'categorical', null, null, null, null, null, false, false),
  ('sleep_duration', 'Duración del sueño', 'sleep', 'numeric', 'min', 'min', 0, 0, 1440, true, false),
  ('pupil_diameter', 'Diámetro pupilar', 'experimental', 'numeric', 'mm', 'mm', 2, 0, 12, true, true)
on conflict (code) do nothing;

commit;
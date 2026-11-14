-- =====================================================================
-- Órbita Salud — ESQUEMA REMOTO COMPLETO (un solo archivo)
-- Proyecto: trlxutcmumcfeeigogwm
-- Aplicar en: Supabase Dashboard → SQL Editor → New query → Run
-- Idempotente y no destructivo: se puede ejecutar más de una vez.
-- Incluye los 5 bloques en orden: identidad, mediciones, análisis/protocolos,
-- semilla del catálogo + trigger de perfil, y RLS completa.
-- =====================================================================


-- =====================================================================
-- BLOQUE 001: Órbita Salud — Propuesta de esquema remoto (Incremento 2)
-- =====================================================================

-- Órbita Salud — Propuesta de esquema remoto (Incremento 2)
-- ESTADO: PROPUESTA — no aplicada. Requiere aprobación explícita.
-- Principios: no destructiva, idempotente (IF NOT EXISTS / ON CONFLICT DO NOTHING),
-- RLS por defecto, auditoría controlada por servidor, privilegio mínimo.

-- ---------------------------------------------------------------------------
-- Extensiones
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Utilidad: updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: perfil mínimo del participante o profesional
-- Supuesto: identidad = auth.users (Supabase Auth). role controla UI, no permisos.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text not null default 'participant'
    check (role in ('participant','professional','technical_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- missions y mission_memberships
-- Supuesto: pertenecer a una misión NO concede acceso clínico (solo contexto).
-- ---------------------------------------------------------------------------
create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.mission_memberships (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  phase text not null check (phase in ('preflight','inflight','postflight')),
  created_at timestamptz not null default now(),
  unique (mission_id, user_id)
);

-- ---------------------------------------------------------------------------
-- care_team_assignments: acceso profesional EXPLÍCITO por participante
-- Supuesto: sin esta fila, ningún profesional ve datos clínicos del sujeto.
-- technical_admin no tiene asignaciones clínicas por defecto.
-- ---------------------------------------------------------------------------
create table if not exists public.care_team_assignments (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references auth.users (id) on delete cascade,
  professional_id uuid not null references auth.users (id) on delete cascade,
  scope text not null default 'full'
    check (scope in ('full','read_only')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (subject_id, professional_id)
);

-- ---------------------------------------------------------------------------
-- metric_definitions: catálogo maestro remoto (autoridad del catálogo)
-- Supuesto: el catálogo local (SQLite) se siembra y versiona desde aquí.
-- ---------------------------------------------------------------------------
create table if not exists public.metric_definitions (
  metric_id text primary key,
  name_es text not null,
  short_name_es text,
  category text not null
    check (category in ('daily_self_report','symptom','vital','hematology')),
  value_type text not null
    check (value_type in ('ordinal_scale','integer','decimal','boolean')),
  canonical_unit text,
  scale_min integer,
  scale_max integer,
  plausible_min numeric,
  plausible_max numeric,
  max_decimals integer,
  definition_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_metric_definitions_updated_at on public.metric_definitions;
create trigger trg_metric_definitions_updated_at
  before update on public.metric_definitions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- consents: consentimientos específicos y versionados
-- Supuesto: cada función que toca datos sensibles (voz, pupila, sync) exige
-- una fila de consentimiento activa con su versión de texto.
-- ---------------------------------------------------------------------------
create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  consent_type text not null
    check (consent_type in ('data_sync','voice_recording','voice_analysis',
                            'pupil_capture','external_instrument','lab_documents')),
  text_version text not null,
  granted boolean not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, consent_type, text_version, granted_at)
);

-- ---------------------------------------------------------------------------
-- audit_events: trazabilidad controlada por servidor
-- Supuesto: los clientes NO pueden insertar ni modificar auditoría
-- directamente; se alimenta vía triggers security definer (ver RLS).
-- ---------------------------------------------------------------------------
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor uuid references auth.users (id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  -- inmutable: sin update/delete por diseño (se revoca en RLS)
  constraint audit_action_shape check (action <> '' and entity_type <> '')
);
create index if not exists idx_audit_events_entity
  on public.audit_events (entity_type, entity_id, occurred_at);
create index if not exists idx_audit_events_actor
  on public.audit_events (actor, occurred_at);


-- =====================================================================
-- BLOQUE 002: Órbita Salud — Propuesta: datos de medición (Incremento 2)
-- =====================================================================

-- Órbita Salud — Propuesta: datos de medición (Incremento 2)
-- ESTADO: PROPUESTA — no aplicada.
-- Supuestos clave:
-- * subject_id = auth.users.id del participante (dueño de los datos).
-- * Los UUID se generan en el cliente: todas las PK son uuid sin default
--   para no chocar con la idempotencia del outbox (el cliente manda el id).
-- * recorded_at/observed_at son instantes del dispositivo; server_created_at
--   y server_received_at dan la trazabilidad de reloj del servidor.

-- ---------------------------------------------------------------------------
-- measurement_sessions
-- ---------------------------------------------------------------------------
create table if not exists public.measurement_sessions (
  session_id uuid primary key,                       -- generado en cliente
  subject_id uuid not null references auth.users (id) on delete cascade,
  mission_id uuid references public.missions (id),
  mission_phase text not null
    check (mission_phase in ('preflight','inflight','postflight')),
  recorded_at timestamptz not null,
  recorded_local_date date not null,
  source text not null default 'manual_entry',
  note text,
  created_at timestamptz not null default now(),     -- reloj del cliente
  server_received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- trazabilidad de correcciones: nunca sobrescribir silenciosamente
  superseded_by uuid references public.measurement_sessions (session_id),
  is_corrected boolean not null default false
);
create index if not exists idx_sessions_subject_time
  on public.measurement_sessions (subject_id, recorded_at desc);

-- ---------------------------------------------------------------------------
-- observations: una fila por métrica dentro de una sesión
-- value_original es el dato de procedencia: NUNCA se sobrescribe.
-- ---------------------------------------------------------------------------
create table if not exists public.observations (
  -- texto determinista generado en el cliente (sessionId:metricId):
  -- permite idempotencia exacta en reintentos de sincronización.
  observation_id text primary key,
  session_id uuid not null references public.measurement_sessions (session_id)
    on delete cascade,
  metric_id text not null references public.metric_definitions (metric_id),
  value_original numeric not null,
  unit_original text,
  value_normalized numeric,                          -- solo conversión verificada
  unit_normalized text,
  conversion_method text,
  observed_at timestamptz not null,
  local_date date not null,
  quality_state text not null default 'ok'
    check (quality_state in ('ok','suspect','invalid')),
  quality_reason text,
  corrected_value numeric,
  correction_reason text,
  created_at timestamptz not null default now(),
  server_received_at timestamptz not null default now(),
  superseded_by uuid references public.observations (observation_id)
);
create index if not exists idx_observations_session
  on public.observations (session_id);
create index if not exists idx_observations_metric_time
  on public.observations (metric_id, observed_at);

-- ---------------------------------------------------------------------------
-- lab_panels: agrupación de resultados de laboratorio (Incremento 3)
-- Supuesto: panel = una toma de laboratorio con origen y método explícitos.
-- ---------------------------------------------------------------------------
create table if not exists public.lab_panels (
  panel_id uuid primary key,                         -- generado en cliente
  subject_id uuid not null references auth.users (id) on delete cascade,
  collected_at timestamptz not null,
  reported_at timestamptz,
  laboratory text,
  sample_id text,
  method text,
  reference_interval_original text,                  -- intervalo ORIGINAL del informe
  document_attachment_id uuid,                       -- FK agregada en attachments
  verification_state text not null default 'unverified'
    check (verification_state in ('unverified','verified','corrected')),
  created_at timestamptz not null default now(),
  server_received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- attachments: documentos privados (informes de laboratorio, audio opcional)
-- Supuesto: binario en Storage privado (bucket 'private-attachments',
-- path por subject_id). Aquí solo metadatos.
-- ---------------------------------------------------------------------------
create table if not exists public.attachments (
  attachment_id uuid primary key,                    -- generado en cliente
  subject_id uuid not null references auth.users (id) on delete cascade,
  kind text not null
    check (kind in ('lab_document','audio_note','other')),
  storage_path text not null,
  mime_type text not null,
  byte_size bigint not null,
  sha256 text not null,                              -- integridad, no contenido
  retention_policy text not null default 'until_consent_revoked',
  created_at timestamptz not null default now(),
  server_received_at timestamptz not null default now()
);
create index if not exists idx_attachments_subject
  on public.attachments (subject_id, kind);


-- =====================================================================
-- BLOQUE 003: Órbita Salud — Propuesta: análisis reproducibles (Incrementos 4–5)
-- =====================================================================

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


-- =====================================================================
-- BLOQUE 004: Órbita Salud — Propuesta: seed del catálogo + integración de auth
-- =====================================================================

-- Órbita Salud — Propuesta: seed del catálogo + integración de auth
-- ESTADO: PROPUESTA — no aplicada.
-- El catálogo remoto es la fuente de verdad; el cliente lo siembra
-- localmente y lo usa para validar unidades. Esta semilla replica el
-- catálogo local v1 (misma definición, misma versión).

insert into public.metric_definitions
  (metric_id, name_es, short_name_es, category, value_type, canonical_unit,
   scale_min, scale_max, plausible_min, plausible_max, max_decimals, definition_version)
values
  ('mood_self_report', 'Ánimo autorreportado', 'Ánimo', 'daily_self_report', 'ordinal_scale', null, 1, 5, null, null, null, 1),
  ('stress_self_report', 'Estrés percibido', 'Estrés', 'daily_self_report', 'ordinal_scale', null, 1, 5, null, null, null, 1),
  ('fatigue_self_report', 'Fatiga autorreportada', 'Fatiga', 'daily_self_report', 'ordinal_scale', null, 1, 5, null, null, null, 1),
  ('sleep_quality_self_report', 'Calidad del sueño autorreportada', 'Calidad de sueño', 'daily_self_report', 'ordinal_scale', null, 1, 5, null, null, null, 1),
  ('sleep_duration', 'Duración del sueño', 'Sueño', 'daily_self_report', 'decimal', 'h', null, null, 0, 16, 1, 1),
  ('symptom_headache', 'Cefalea', null, 'symptom', 'boolean', null, null, null, null, null, null, 1),
  ('symptom_nausea', 'Náuseas', null, 'symptom', 'boolean', null, null, null, null, null, null, 1),
  ('symptom_dizziness', 'Mareo', null, 'symptom', 'boolean', null, null, null, null, null, null, 1),
  ('symptom_msk_pain', 'Dolor musculoesquelético', null, 'symptom', 'boolean', null, null, null, null, null, null, 1),
  ('symptom_visual_disturbance', 'Alteración visual', null, 'symptom', 'boolean', null, null, null, null, null, null, 1),
  ('symptom_nasal_congestion', 'Congestión nasal', null, 'symptom', 'boolean', null, null, null, null, null, null, 1),
  ('heart_rate', 'Frecuencia cardíaca', 'FC', 'vital', 'integer', 'lpm', null, null, 25, 230, null, 1),
  ('bp_systolic', 'Presión arterial sistólica', 'PAS', 'vital', 'integer', 'mmHg', null, null, 50, 280, null, 1),
  ('bp_diastolic', 'Presión arterial diastólica', 'PAD', 'vital', 'integer', 'mmHg', null, null, 25, 180, null, 1),
  ('spo2', 'Saturación periférica de oxígeno', 'SpO₂', 'vital', 'integer', '%', null, null, 50, 100, null, 1),
  ('hemoglobin', 'Hemoglobina', 'Hb', 'hematology', 'decimal', 'g/L', null, null, 30, 250, 1, 1),
  ('hematocrit', 'Hematocrito', 'Hto', 'hematology', 'decimal', '%', null, null, 10, 75, 1, 1),
  ('rbc_count', 'Recuento de eritrocitos', null, 'hematology', 'decimal', '10¹²/L', null, null, 1, 10, 2, 1),
  ('mcv', 'Volumen corpuscular medio', 'VCM', 'hematology', 'decimal', 'fL', null, null, 50, 150, 1, 1),
  ('rdw', 'Amplitud de distribución eritrocitaria', 'RDW', 'hematology', 'decimal', '%', null, null, 8, 35, 1, 1),
  ('reticulocyte_pct', 'Reticulocitos porcentuales', null, 'hematology', 'decimal', '%', null, null, 0, 15, 2, 1),
  ('reticulocyte_absolute', 'Reticulocitos absolutos', null, 'hematology', 'decimal', '10⁹/L', null, null, 0, 500, 1, 1),
  ('ferritin', 'Ferritina', null, 'hematology', 'decimal', 'µg/L', null, null, 0, 5000, 1, 1),
  ('transferrin_saturation', 'Saturación de transferrina', null, 'hematology', 'decimal', '%', null, null, 0, 100, 1, 1),
  ('bilirubin_total', 'Bilirrubina total', null, 'hematology', 'decimal', 'µmol/L', null, null, 0, 600, 1, 1),
  ('bilirubin_direct', 'Bilirrubina directa', null, 'hematology', 'decimal', 'µmol/L', null, null, 0, 600, 1, 1),
  ('haptoglobin', 'Haptoglobina', null, 'hematology', 'decimal', 'g/L', null, null, 0, 5, 2, 1)
on conflict (metric_id) do update
  set name_es = excluded.name_es,
      short_name_es = excluded.short_name_es,
      category = excluded.category,
      value_type = excluded.value_type,
      canonical_unit = excluded.canonical_unit,
      scale_min = excluded.scale_min,
      scale_max = excluded.scale_max,
      plausible_min = excluded.plausible_min,
      plausible_max = excluded.plausible_max,
      max_decimals = excluded.max_decimals,
      definition_version = excluded.definition_version,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Perfil automático al registrarse en Supabase Auth
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''), 'participant')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =====================================================================
-- BLOQUE 005: Órbita Salud — Propuesta: Row Level Security (Incremento 2)
-- =====================================================================

-- Órbita Salud — Propuesta: Row Level Security (Incremento 2)
-- ESTADO: PROPUESTA — no aplicada.
-- Principios:
-- * El participante accede SOLO a sus propios datos.
-- * La pertenencia a una misión NO concede acceso clínico.
-- * El acceso profesional requiere care_team_assignments explícito y vigente.
-- * audit_events no es modificable por clientes (sin políticas de escritura).
-- * metric_definitions es de solo lectura para clientes.

alter table public.profiles enable row level security;
alter table public.missions enable row level security;
alter table public.mission_memberships enable row level security;
alter table public.care_team_assignments enable row level security;
alter table public.metric_definitions enable row level security;
alter table public.measurement_sessions enable row level security;
alter table public.observations enable row level security;
alter table public.lab_panels enable row level security;
alter table public.attachments enable row level security;
alter table public.consents enable row level security;
alter table public.audit_events enable row level security;
alter table public.baseline_versions enable row level security;
alter table public.analysis_definitions enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.analysis_input_observations enable row level security;
alter table public.forecast_points enable row level security;
alter table public.protocol_versions enable row level security;
alter table public.review_events enable row level security;

-- Helper: asignación vigente de equipo de cuidado
create or replace function public.has_active_care_assignment(
  p_subject uuid,
  p_professional uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.care_team_assignments a
    where a.subject_id = p_subject
      and a.professional_id = p_professional
      and a.valid_from <= now()
      and (a.valid_until is null or a.valid_until > now())
  );
$$;

-- profiles ------------------------------------------------------------------
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
-- Sin política de insert: el perfil se crea con el trigger handle_new_user.
-- Sin políticas de delete.

-- missions ------------------------------------------------------------------
create policy "missions_select_authenticated" on public.missions
  for select to authenticated using (true);

-- mission_memberships: ver tu propia pertenencia (contexto, no acceso clínico)
create policy "memberships_select_own" on public.mission_memberships
  for select using (user_id = auth.uid());

-- care_team_assignments -----------------------------------------------------
create policy "assignments_select_subject" on public.care_team_assignments
  for select using (subject_id = auth.uid());
create policy "assignments_select_professional" on public.care_team_assignments
  for select using (professional_id = auth.uid());
-- Insert/update/delete de asignaciones: solo por dashboard/service role (Inc 6).

-- metric_definitions: solo lectura para usuarios autenticados ----------------
create policy "metric_definitions_select" on public.metric_definitions
  for select to authenticated using (true);

-- measurement_sessions -------------------------------------------------------
create policy "sessions_select_own" on public.measurement_sessions
  for select using (subject_id = auth.uid());
create policy "sessions_select_care_team" on public.measurement_sessions
  for select using (public.has_active_care_assignment(subject_id, auth.uid()));
create policy "sessions_insert_own" on public.measurement_sessions
  for insert with check (subject_id = auth.uid());
create policy "sessions_update_own" on public.measurement_sessions
  for update using (subject_id = auth.uid()) with check (subject_id = auth.uid());
-- Sin delete para clientes: las correcciones usan superseded_by.

-- observations (acceso a través de la sesión) --------------------------------
create policy "observations_select_own" on public.observations
  for select using (
    exists (
      select 1 from public.measurement_sessions s
      where s.session_id = observations.session_id
        and s.subject_id = auth.uid()
    )
  );
create policy "observations_select_care_team" on public.observations
  for select using (
    exists (
      select 1 from public.measurement_sessions s
      where s.session_id = observations.session_id
        and public.has_active_care_assignment(s.subject_id, auth.uid())
    )
  );
create policy "observations_insert_own" on public.observations
  for insert with check (
    exists (
      select 1 from public.measurement_sessions s
      where s.session_id = observations.session_id
        and s.subject_id = auth.uid()
    )
  );
create policy "observations_update_own" on public.observations
  for update using (
    exists (
      select 1 from public.measurement_sessions s
      where s.session_id = observations.session_id
        and s.subject_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.measurement_sessions s
      where s.session_id = observations.session_id
        and s.subject_id = auth.uid()
    )
  );

-- lab_panels / attachments: propietario y equipo de cuidado ------------------
create policy "lab_panels_select_own" on public.lab_panels
  for select using (subject_id = auth.uid());
create policy "lab_panels_select_care_team" on public.lab_panels
  for select using (public.has_active_care_assignment(subject_id, auth.uid()));
create policy "lab_panels_insert_own" on public.lab_panels
  for insert with check (subject_id = auth.uid());

create policy "attachments_select_own" on public.attachments
  for select using (subject_id = auth.uid());
create policy "attachments_insert_own" on public.attachments
  for insert with check (subject_id = auth.uid());

-- consents: el dueño gestiona sus consentimientos ----------------------------
create policy "consents_select_own" on public.consents
  for select using (user_id = auth.uid());
create policy "consents_insert_own" on public.consents
  for insert with check (user_id = auth.uid());
create policy "consents_update_own" on public.consents
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit_events: SOLO servicio (sin políticas = denegado a clientes) ----------

-- Análisis (Inc 4–5): propietario y equipo de cuidado, escritura propia ------
create policy "baselines_select_own" on public.baseline_versions
  for select using (subject_id = auth.uid());
create policy "baselines_insert_own" on public.baseline_versions
  for insert with check (subject_id = auth.uid());

create policy "analysis_runs_select_own" on public.analysis_runs
  for select using (subject_id = auth.uid());
create policy "analysis_runs_select_care_team" on public.analysis_runs
  for select using (public.has_active_care_assignment(subject_id, auth.uid()));
create policy "analysis_runs_insert_own" on public.analysis_runs
  for insert with check (subject_id = auth.uid());

create policy "analysis_inputs_select_own" on public.analysis_input_observations
  for select using (
    exists (
      select 1 from public.analysis_runs r
      where r.analysis_run_id = analysis_input_observations.analysis_run_id
        and r.subject_id = auth.uid()
    )
  );
create policy "analysis_inputs_insert_own" on public.analysis_input_observations
  for insert with check (
    exists (
      select 1 from public.analysis_runs r
      where r.analysis_run_id = analysis_input_observations.analysis_run_id
        and r.subject_id = auth.uid()
    )
  );

create policy "forecast_points_select_own" on public.forecast_points
  for select using (
    exists (
      select 1 from public.analysis_runs r
      where r.analysis_run_id = forecast_points.analysis_run_id
        and r.subject_id = auth.uid()
    )
  );
create policy "forecast_points_insert_own" on public.forecast_points
  for insert with check (
    exists (
      select 1 from public.analysis_runs r
      where r.analysis_run_id = forecast_points.analysis_run_id
        and r.subject_id = auth.uid()
    )
  );

-- protocolos y definiciones: lectura autenticada (gestión por servicio) ------
create policy "protocol_versions_select" on public.protocol_versions
  for select to authenticated using (true);
create policy "analysis_definitions_select" on public.analysis_definitions
  for select to authenticated using (true);

-- review_events: propietario y revisor ---------------------------------------
create policy "review_events_select_own" on public.review_events
  for select using (subject_id = auth.uid());
create policy "review_events_select_reviewer" on public.review_events
  for select using (reviewer = auth.uid());

-- =====================================================================
-- FIN. Verifica en Table Editor: profiles, missions, measurement_sessions,
-- observations, metric_definitions, consents, audit_events, etc.
-- =====================================================================

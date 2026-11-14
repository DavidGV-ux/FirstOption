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

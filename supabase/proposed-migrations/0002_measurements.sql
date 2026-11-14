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
  observation_id uuid primary key,                   -- generado en cliente
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

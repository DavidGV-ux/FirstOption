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

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

# Aplicar las migraciones propuestas (requiere TU acción explícita)

**Estado:** las migraciones en esta carpeta son PROPUESTAS. Nada se ha
aplicado al proyecto Supabase remoto (`trlxutcmumcfeeigogwm`).

Verificación previa (solo lectura, con clave publicable): el proyecto
responde (GoTrue OK) pero no existe ninguna tabla del modelo en el
esquema público.

## Opción A — SQL Editor (más simple, sin tokens)

1. Abre https://supabase.com/dashboard → proyecto `trlxutcmumcfeeigogwm`.
2. SQL Editor → New query.
3. Pega y ejecuta **en orden**:
   1. `0001_identity_context_auditing.sql`
   2. `0002_measurements.sql`
   3. `0003_analysis_protocols.sql`
   4. `0004_catalog_seed_auth.sql`
   5. `0005_rls.sql`
4. Verifica en Table Editor que existan `profiles`, `missions`,
   `measurement_sessions`, `observations`, `metric_definitions`, `consents`,
   `audit_events` (y el resto).

Todas las migraciones son idempotentes (`IF NOT EXISTS`, `ON CONFLICT`)
y no destructivas: se pueden ejecutar dos veces sin daño.

## Opción B — CLI (requiere un token de acceso tuyo)

```bash
npm install -g supabase
export SUPABASE_ACCESS_TOKEN="<tu token personal>"  # nunca en el repo
supabase link --project-ref trlxutcmumcfeeigogwm
supabase db push
```

El token personal se genera en Dashboard → Account → Access Tokens.
No lo pegues en el chat: déjalo solo en tu variable de entorno.

## Supuestos documentados

1. **Identidad**: Supabase Auth; `profiles.id` referencia `auth.users`.
   Un trigger crea el perfil al registrarse (0004).
2. **IDs en cliente**: `measurement_sessions.session_id` es UUID del
   cliente; `observations.observation_id` es texto determinista
   (`sessionId:metricId`) para idempotencia exacta de reintentos.
3. **Correcciones**: sin borrados; `superseded_by` + `is_corrected`
   preservan el original (0002).
4. **Catálogo**: `metric_definitions` remota es de solo lectura para
   clientes; la semilla (0004) replica el catálogo local v1.
5. **Auditoría**: `audit_events` sin políticas para clientes; se
   alimenta por triggers del servidor (se ampliará en Inc 6).
6. **Storage privado** (Inc 3): bucket `private-attachments`, path por
   `subject_id/…`; aquí solo metadatos en `attachments`.
7. **Misiones**: pertenencia (`mission_memberships`) da contexto de
   fase; NO concede acceso clínico (solo el dueño o un
   `care_team_assignments` vigente puede leer datos).
8. **RLS activada en todas las tablas** del modelo; sin políticas =
   denegado (p. ej. `audit_events`).

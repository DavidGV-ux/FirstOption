# Offline y sincronización

## Estado actual (Incremento 2)

- **Todo es local primero.** La UI consulta repositorios locales;
  funciona sin conexión por diseño.
- El guardado se confirma en el momento (`savedOffline: true`) sin
  esperar red.
- **Outbox transaccional implementado:** guardar una medición escribe
  también su entrada en `sync_outbox` dentro de la **misma transacción**
  (migración local v2). Si falla el guardado, no queda una operación
  huérfana, y viceversa.
- **Push idempotente implementado** (`SyncNowUseCase`): upsert por
  identificadores generados en el cliente; las sesiones se empujan
  antes que sus observaciones (FK remota); los fallos quedan en el
  outbox con su error visible y se reintentan; nada se descarta.
- **Autenticación implementada:** email/contraseña con Supabase Auth;
  la sesión se persiste en SecureStore. Sin conexión, la app sigue
  funcionando y lo dice honestamente; no hay re-autenticación remota
  sin internet.
- **Migraciones remotas propuestas, no aplicadas** (pendiente de tu
  aprobación): ver `supabase/proposed-migrations/README.md`.
- **Migraciones propuestas, no aplicadas**: el esquema remoto no existe
  todavía; hasta que se aplique, la sincronización reporta
  `remote_error` honesto ("Tabla no disponible") y los datos quedan
  pendientes en el dispositivo.
- **Disparadores**: botón manual "Sincronizar ahora". Automático al
  recuperar conectividad/foreground: **pendiente** (Inc 2 continúa).
- **Pull remoto**: pendiente (Inc 2 continúa); el cursor de descarga ya
  tiene tabla local (`sync_cursors`) y se controlará con reloj del
  servidor.

## Política de identidad y RLS

- Con sesión iniciada, los registros se marcan con el `auth.uid()` del
  usuario: cumplen la FK remota (`subject_id → auth.users`) y las
  políticas RLS (`subject_id = auth.uid()`).
- Sin sesión, la identidad es local (UUID del dispositivo). Esos
  registros, si se intentaran sincronizar antes de iniciar sesión,
  fallan la FK remota y **quedan pendientes con el error visible**:
  nunca se descartan ni se reasignan silenciosamente.
- La pertenencia a una misión NO concede acceso clínico; el acceso
  profesional requiere `care_team_assignments` vigente (propuesta 0005).

## Conflicto y correcciones

- Sin last-write-wins silencioso sobre registros clínicos. El push solo
  sube filas nuevas del cliente (upsert por id propio); los conflictos
  remotos se retienen para revisión (Inc 6).
- Las correcciones preservan el original vía `superseded_by` /
  `is_corrected` (propuesta 0002) y marcarán los análisis relacionados
  como desactualizados (Inc 4+).

## Recuperación de interrupciones

- La escritura de sesión+observaciones+outbox es una única transacción:
  un fallo a mitad deja la base consistente (verificado en pruebas).
- El outbox se marca `done` solo tras confirmación del servidor; una
  interrupción deja la operación `pending`/`failed` y se reintenta.


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
  la sesión se persiste en SecureStore **en fragmentos** (manifiesto +
  trozos) para evitar el límite de tamaño de algunos dispositivos. Sin
  conexión, la app permite entrar con la cuenta local y avisa que el
  historial y los registros se sincronizarán al recuperar internet; no
  hay re-autenticación remota sin internet.
- **Descarga remota implementada** (`PullRemoteHistoryUseCase`):
  descarga sesiones y observaciones paginadas del usuario autenticado y
  las importa a SQLite de forma idempotente. Reutiliza el
  `client_request_id` remoto como id local, no duplica ni sobrescribe
  filas existentes y descarta —contándolas— las observaciones que no se
  pueden mapear con honestidad (sin valor real, métrica desconocida o
  sesión local ausente). El pull corre antes del push.
- **Migraciones remotas:** el modelo `000_supabase_model_v2.sql` debe
  estar aplicado; ver `supabase/proposed-migrations/README.md`. Si falta
  una tabla, la sincronización reporta `remote_error` honesto ("Tabla no
  disponible") y los datos quedan pendientes en el dispositivo.
- **Disparadores:** botón manual "Sincronizar ahora" (pull + push) y
  auto-sync al recuperar conectividad, al volver a foreground y cada 2
  minutos.
- **Cursor incremental de descarga**: pendiente (Inc 2 continúa); el
  pull actual pagina el historial completo y es idempotente, así que
  repetirlo no duplica datos.
- **Datasets externos de referencia (NASA OSDR OSD-575):**
  no son historial personal. Se guardan localmente con fuente
  `nasa_osdr_osd575`, **nunca se encolan** en `sync_outbox` y no cuentan
  como pendientes de sincronizar ni como registros personales (Inicio,
  Historial, "Estado general" y análisis los excluyen en pantalla).
  Las filas de versiones anteriores que hubieran quedado en la cola
  se retiran al sincronizar sin subirse al servidor.

## Política de identidad y RLS

- Con sesión iniciada, los registros se marcan con el `auth.uid()` del
  usuario: cumplen la FK remota (`subject_id → auth.users`) y las
  políticas RLS (`subject_id = auth.uid()`).
- Sin sesión remota, la identidad es local (UUID del dispositivo). Si la
  sesión de Supabase no puede leerse (sin internet o token expirado),
  la identidad cae al `remoteUserId` de la cuenta local **solo si hay
  una sesión de dispositivo activa para el mismo correo**: el historial
  remoto sigue visible sin conexión, pero cerrar sesión no deja datos
  abiertos ni mezcla cuentas.
- Los registros del dispositivo se adoptan de forma explícita. Al
  vincular automáticamente una cuenta local pendiente, la adopción es
  automática y se informa el número de registros asociados. Nunca se
  reasignan cuentas distintas en silencio.
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


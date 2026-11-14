# Offline y sincronización

## Estado actual (Incremento 1)

- **Todo es local.** La UI consulta repositorios locales; funciona sin
  conexión por diseño.
- El guardado se confirma en el momento (`savedOffline: true`) sin
  esperar red.
- El estado de sincronización visible es honesto: "Solo en el
  dispositivo" / "La sincronización con el servidor aún no está
  implementada".
- Sin operación silenciosa que elimine registros.

## Plan de sincronización (Incremento 2 — no implementado)

Diseño comprometido para cuando se integre Supabase:

1. **Outbox transaccional.** Guardar observación y entrada de
   `sync_outbox` en la misma transacción SQLite. Confirmar guardado sin
   esperar internet.
2. **UUID en cliente.** Los IDs se generan localmente; el servidor los
   acepta para idempotencia (upsert por id).
3. **Reintentos con backoff y jitter.** Los elementos fallidos pasan a
   `sync_failed` y se reintentan; nunca se descartan sin confirmación.
4. **Cursor controlado por servidor.** `sync_cursors` guarda la
   posición de descarga; no se confía en el reloj del dispositivo para
   ordenar operaciones remotas.
5. **Disparadores.** Sincronización manual + al recuperar conectividad
   + al volver a primer plano. Sin dependencia de ejecución continua en
   segundo plano; **Realtime no será el mecanismo único**.
6. **Conflictos.** Sin last-write-wins silencioso sobre registros
   clínicos: `sync_conflicts` retiene la divergencia para revisión.
7. **Separación por cuenta.** La base local se asocia a la identidad
   autenticada; el cambio de cuenta no mezcla cachés.

## Autenticación (Incremento 2)

- Supabase Auth con conectividad; **no se promete nueva autenticación
  remota sin internet**.
- Expiración de tokens documentada; la sesión local permite seguir
  registrando datos offline mientras exista identidad local.
- Política explícita de acceso local sin conexión visible en la UI.

## Recuperación de interrupciones

- La escritura de sesión+observaciones es una única transacción: un
  fallo a mitad deja la base consistente (verificado en pruebas de
  integración).
- El outbox (Inc 2) se marca solo tras confirmación del servidor; una
  interrupción deja la operación como pendiente y se reintenta.

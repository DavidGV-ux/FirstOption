# firstOption — Progreso y estado

## Lo que va avanzado

### Incrementos completados
- **Inc 1** — Registro manual diario, validación Zod, SQLite cifrado (SQLCipher), historial, reinicio sin pérdida.
- **Inc 2** — Supabase Auth (email/contraseña, sesión en SecureStore **fragmentada** para evitar límites de tamaño), **cuenta local sin conexión** (creación/verificación en almacén seguro y vinculación automática a Supabase al recuperar internet), **identidad con respaldo al `remoteUserId` local** para ver el historial remoto sin conexión, outbox transaccional (misma transacción que el guardado), push idempotente (`SyncNowUseCase`), **pull/descarga idempotente** del historial remoto (`PullRemoteHistoryUseCase`), **auto-sync** al recuperar conexión, al volver a primer plano y cada 2 minutos (pull antes de push), per-user scoping local, login obligatorio al abrir y pantallas de acceso/sincronización.
- **Inc 3** — Dominio de laboratorio (paneles, resultados, documentos privados, basales versionados), conversión de unidades verificada, `SqliteLabRepository`, migración v3, pantalla `/laboratorio`, linterna de inspección pupilar documentada.
- **Inc 4** — Análisis descriptivo puro, elegibilidad (datos insuficientes/no comparables/calidad/duplicados/método), tendencias por tiempo real, ejecuciones reproducibles (`analysis_runs` + inputs), basales versionadas, pantallas `/analisis` y `/basales`.

### En desarrollo (no cerrado)
- **Inspección asistida por cámara (v6)** — dominio/casos de uso/infraestructura para captura guiada, métricas de calidad, comparación y persistencia local (`camera_inspection_*`, `SqliteInspectionRepository`). La UI de `/linterna` ofrece **solo dos modos**: reflejo fotomotor pupilar (PLR) y pulso óptico (PPG). La **captura pupilar asistida se retiró** por baja fiabilidad; el PLR solo muestra valores si hay muestras reales de la pupila (si no, «sin medición» y no guarda nada) y no clasifica fatiga ni alerta. El PPG **solo estima frecuencia cardíaca** y calidad de señal; presión arterial y SpO₂ se muestran como «no medidas» y no se guardan. Selector de lente física en iOS cuando el sistema la expone (la principal queda por defecto para acercar el flash); en Android se declara la limitación. Todo marcado como experimental: **sin diagnóstico ni medición clínica validada**. Pendiente: captura real de fotogramas para PLR, validación en dispositivo, calibración/precisión, revisión de privacidad/consentimiento y cobertura de pruebas adicional.

### Funcionalidades clave
- Offline-first: UI consulta repositorios locales; guardado confirma sin esperar red.
- Identidad por cuenta: scoping local por `subject_id`; si la sesión de Supabase no puede leerse, se usa el `remoteUserId` de la cuenta local vinculada (solo con sesión de dispositivo activa). Adopción explícita de registros del dispositivo; al vincular una cuenta local pendiente, la adopción es automática y se informa el número.
- Sincronización idempotente vía `client_request_id` (local y remoto), en ambos sentidos: pull antes de push, sin last-write-wins ni sobrescritura local.
- Sistema de diseño responsivo (1 col móvil / 2 col tablet, ancho máx. 720).
- Seguridad: clave publicable en cliente, RLS, SQLCipher verificado, sin secretos en repo.

### Modelo de datos
- **Remoto (Supabase):** `supabase/proposed-migrations/000_supabase_model_v2.sql` (v2.0.0): perfiles, misiones, acceso clínico, identidad local vinculada, catálogo de métricas, conversiones, sesiones, observaciones (con `client_request_id`), adjuntos, laboratorio, basales, análisis, protocolos, revisión, sync_outbox, auditoría, RLS completa.
- **Local (SQLite):** migraciones v1–v8: esquema inicial + catálogo, outbox/cursores, laboratorio/basales, analysis_runs, identidad local/auth/auditoría, columnas `remote_user_id`/`client_request_id`, corrección de código legacy de náusea, **inspección asistida por cámara** (sesiones, capturas, métricas de calidad, estimaciones pupilares, comparaciones) y **catálogo metabólico OSD-575**.
- **OSD-575 (NASA OSDR):** el dataset de referencia SpaceX Inspiration4 (11 analitos séricos, 4 tripulantes × 7 momentos) se guarda **solo en este dispositivo** con fuente `nasa_osdr_osd575`. **Nunca** se encola en `sync_outbox` ni se sube a la cuenta remota: no son mediciones de la persona usuaria. Si ya quedaron filas pendientes de versiones anteriores, el push las retira sin subirlas. Inicio/Historial/"Estado general"/análisis/conteos de pendientes **excluyen** estas filas del resumen personal.

## Archivos relevantes

### Dominio
- `src/domain/observations/` — entidades, validación (daily-log, inspection).
- `src/domain/labs/lab-panel.ts` — panel, resultados, documentos, basales.
- `src/domain/units/unit-conversion.ts` — conversiones verificadas.
- `src/domain/analytics/descriptive.ts`, `eligibility.ts`, `trends.ts`.
- `src/domain/camera-inspection/` — entidades, políticas, puertos y estimación (pupila/pulso) experimental.
- `src/domain/repositories/` — puertos (observation, lab, analysis, sync-outbox, remote-history).

### Aplicación
- `src/application/use-cases/` — register-daily-log, document-pupil-inspection, register-lab-panel, run-trend-analysis, create-baseline, sync-now (push), pull-remote-history (descarga), manage-account, manage-auth, list-recent-activity, captura/análisis/comparación/guardado de inspección por cámara, estimación de pulso vital.

### Infraestructura
- `src/infrastructure/database/migrations/` — v1–v8.
- `src/infrastructure/repositories/` — sqlite-observation (incluye importación remota), sqlite-lab, sqlite-analysis, sqlite-inspection.
- `src/infrastructure/camera/` — captura/imagen/calidad/segmentación geométrica/PPG (experimental).
- `src/infrastructure/documents/expo-private-document-store.ts` — sandbox privado.
- `src/infrastructure/supabase/client.ts` — cliente con clave publicable y sesión persistida en fragmentos seguros.
- `src/infrastructure/security/` — clave SQLCipher, identidad local.

### Presentación
- `src/presentation/theme/tokens.ts` — design tokens.
- `src/presentation/components/` — screen, ui (Card, Field, ChoiceChips, etc.).
- `src/presentation/hooks/use-responsive.ts` — responsivo.
- `src/presentation/features/inspection/` — vistas y componentes de inspección asistida por cámara (calidad, estimación relativa, historial, pulso).

### Rutas (Expo Router)
- `src/app/index.tsx` (Inicio), `registrar.tsx`, `historial.tsx`, `analisis.tsx`, `basales.tsx`, `laboratorio.tsx`, `acceso.tsx`, `linterna.tsx` (inspección por cámara/linterna).

### Supabase
- `supabase/proposed-migrations/000_supabase_model_v2.sql` — modelo completo v2.0.0.
- `supabase/proposed-migrations/README.md` — instrucciones de aplicación.

### Pruebas
- `test/unit/` — 109 pruebas (dominio, aplicación, autenticación offline, sincronización push/pull, importación remota, identidad con respaldo offline, analítica, OSD-575, inspección por cámara, selección de lente y límites de PPG).
- `test/integration/sqlite.test.ts` — 10 pruebas sobre SQLite real (incluye migraciones v6, v7 y v8, e integridad de tablas de cámara).

### Documentación
- `docs/` — product, architecture, evidence, clinical-safety, data-dictionary, offline-sync, analytics-methods, validation-plan, model-cards.

## Lo que falta

### Incrementos pendientes
- **Inc 5** — `ForecastProvider` (pronóstico de referencia naive + método lineal con intervalo de predicción real), evaluación con cortes progresivos (MAE/RMSE), model card.
- **Inc 6** — Protocolos versionados, review events, exportación JSON, auditoría completa, accesibilidad final.
- **Inc 2 cont.** — Backoff+jitter en reintentos y cursores de descarga incrementales (el pull actual pagina el historial completo de forma idempotente).
- **Voz/pupila** — detrás de feature flags, estados honestos, sin diagnóstico.
- **Datos demo** — sintéticos con banner permanente, seed reproducible.
- **Docs** — analytics-methods, validation-plan, model cards, evidence actualizado.

### UI pendiente de rediseño/pulido con el nuevo sistema
- `registrar`, `historial` (falta TrendChart), `analisis` (polish), `acceso`, `laboratorio`, `basales`.
- `linterna`: pulir UX/modos de inspección asistida y validación en dispositivo real.

### Infraestructura pendiente
- `SqliteLabRepository` ya implementado; falta UI de captura de documentos privados.
- Validación completa de análisis (calidad, duplicados, comparabilidad, cambio de método) integrada en el flujo.
- Detalle de ejecución de análisis (inputs, método, versión, limitaciones).

### Verificación pendiente
- Pruebas en dispositivo iOS/Android (development build con EAS), especialmente flujo de cámara/linterna/PPG y permisos.
- Verificación de sincronización real con Supabase (requiere aplicar/verificar el SQL remoto y probar con una cuenta con historial).
- Validación de calidad, privacidad (imágenes en sandbox, sin subida por defecto) y exactitud de estimaciones experimentales (pupila/pulso).
- Pruebas E2E de flujos completos.

## Comandos verificados (última actualización local)
```
npx tsc --noEmit          # OK
npx jest                  # 109 pruebas unitarias: OK
npm run test:integration  # 10 pruebas de integración: OK
npx expo lint             # sin problemas
```

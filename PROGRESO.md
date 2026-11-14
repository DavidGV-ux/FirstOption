# Órbita Salud — Progreso y estado

## Lo que va avanzado

### Incrementos completados
- **Inc 1** — Registro manual diario, validación Zod, SQLite cifrado (SQLCipher), historial, reinicio sin pérdida.
- **Inc 2** — Supabase Auth (email/contraseña, sesión en SecureStore), outbox transaccional (misma transacción que el guardado), push idempotente (`SyncNowUseCase`), per-user scoping local con adopción explícita, pantallas de acceso y sincronización.
- **Inc 3** — Dominio de laboratorio (paneles, resultados, documentos privados, basales versionados), conversión de unidades verificada, `SqliteLabRepository`, migración v3, pantalla `/laboratorio`, linterna de inspección pupilar documentada.
- **Inc 4** — Análisis descriptivo puro, elegibilidad (datos insuficientes/no comparables/calidad/duplicados/método), tendencias por tiempo real, ejecuciones reproducibles (`analysis_runs` + inputs), basales versionadas, pantallas `/analisis` y `/basales`.

### En desarrollo (no cerrado)
- **Inspección asistida por cámara (v6)** — dominio/casos de uso/infraestructura/presentación para captura guiada, métricas de calidad, estimación pupilar relativa experimental, comparación y persistencia local (`camera_inspection_*`, `SqliteInspectionRepository`). Incluye modo experimental de pulso óptico (PPG) con linterna y estimaciones aproximadas de signos vitales con calidad/limitaciones. Todo marcado como experimental: **sin diagnóstico ni medición clínica validada**. Pendiente: validación en dispositivo, calibración/precisión, revisión de privacidad/consentimiento y cobertura de pruebas adicional.

### Funcionalidades clave
- Offline-first: UI consulta repositorios locales; guardado confirma sin esperar red.
- Identidad por cuenta: scoping local por `subject_id`; adopción explícita de registros del dispositivo a la cuenta.
- Sincronización idempotente vía `client_request_id` (local y remoto).
- Sistema de diseño responsivo (1 col móvil / 2 col tablet, ancho máx. 720).
- Seguridad: clave publicable en cliente, RLS, SQLCipher verificado, sin secretos en repo.

### Modelo de datos
- **Remoto (Supabase):** `supabase/proposed-migrations/000_supabase_model_v2.sql` (v2.0.0): perfiles, misiones, acceso clínico, identidad local vinculada, catálogo de métricas, conversiones, sesiones, observaciones (con `client_request_id`), adjuntos, laboratorio, basales, análisis, protocolos, revisión, sync_outbox, auditoría, RLS completa.
- **Local (SQLite):** migraciones v1–v6: esquema inicial + catálogo, outbox/cursores, laboratorio/basales, analysis_runs, identidad local/auth/auditoría, columnas `remote_user_id`/`client_request_id`, e **inspección asistida por cámara** (sesiones, capturas, métricas de calidad, estimaciones pupilares, comparaciones).

## Archivos relevantes

### Dominio
- `src/domain/observations/` — entidades, validación (daily-log, inspection).
- `src/domain/labs/lab-panel.ts` — panel, resultados, documentos, basales.
- `src/domain/units/unit-conversion.ts` — conversiones verificadas.
- `src/domain/analytics/descriptive.ts`, `eligibility.ts`, `trends.ts`.
- `src/domain/camera-inspection/` — entidades, políticas, puertos y estimación (pupila/pulso) experimental.
- `src/domain/repositories/` — puertos (observation, lab, analysis, sync-outbox).

### Aplicación
- `src/application/use-cases/` — register-daily-log, document-pupil-inspection, register-lab-panel, run-trend-analysis, create-baseline, sync-now, manage-account, list-recent-activity, captura/análisis/comparación/guardado de inspección por cámara, estimación de pulso vital.

### Infraestructura
- `src/infrastructure/database/migrations/` — v1–v6.
- `src/infrastructure/repositories/` — sqlite-observation, sqlite-lab, sqlite-analysis, sqlite-inspection.
- `src/infrastructure/camera/` — captura/imagen/calidad/segmentación geométrica/PPG (experimental).
- `src/infrastructure/documents/expo-private-document-store.ts` — sandbox privado.
- `src/infrastructure/supabase/client.ts` — cliente con clave publicable.
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
- `test/unit/` — 64 pruebas (dominio, aplicación, sincronización, analítica, inspección por cámara).
- `test/integration/sqlite.test.ts` — 8 pruebas sobre SQLite real (incluye migración v6 e integridad de tablas de cámara).

### Documentación
- `docs/` — product, architecture, evidence, clinical-safety, data-dictionary, offline-sync, analytics-methods, validation-plan, model-cards.

## Lo que falta

### Incrementos pendientes
- **Inc 5** — `ForecastProvider` (pronóstico de referencia naive + método lineal con intervalo de predicción real), evaluación con cortes progresivos (MAE/RMSE), model card.
- **Inc 6** — Protocolos versionados, review events, exportación JSON, auditoría completa, accesibilidad final.
- **Inc 2 cont.** — Auto-sync por conectividad/foreground con backoff+jitter, pull remoto con cursor de servidor.
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
- Verificación de sincronización real con Supabase (requiere aplicar el SQL remoto).
- Validación de calidad, privacidad (imágenes en sandbox, sin subida por defecto) y exactitud de estimaciones experimentales (pupila/pulso).
- Pruebas E2E de flujos completos.

## Comandos verificados (última actualización local)
```
npx tsc --noEmit          # OK
npx jest                  # 64 pruebas unitarias: OK
npm run test:integration  # 8 pruebas de integración: OK
npx expo lint             # sin problemas
```

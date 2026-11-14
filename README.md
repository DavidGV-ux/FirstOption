# Órbita Salud

Prototipo móvil de seguimiento longitudinal de salud para astronautas o
participantes en entornos análogos (misión análoga, confinamiento, etc.).

> **Aviso importante.** Órbita Salud **no es un sistema certificado para
> vuelo ni un dispositivo médico validado**. No diagnostica, no prescribe
> y no infiere mediciones. Registra, describe y —en incrementos
> posteriores— proyecta con métodos explícitos y reproducibles.

## Estado actual (Incrementos 1–4 en el código)

| Capacidad | Estado |
|---|---|
| Registro manual diario (ánimo, estrés, fatiga, sueño, síntomas, FC, PA, SpO₂, nota) | ✅ Implementado, con pruebas unitarias |
| Validación de entrada con reglas puras (Zod + reglas de dominio) | ✅ Implementado |
| SQLite cifrado (SQLCipher) con migraciones versionadas (v1–v5) | ✅ Implementado, 7 pruebas de integración sobre SQLite real |
| Historial y último registro con antigüedad | ✅ Implementado |
| Persistencia tras reinicio | ✅ Verificado con SQLite real en pruebas |
| Modo Expo Go (SQLite plano explícito, base separada, banner permanente) | ✅ Implementado; pendiente de verificación en dispositivo |
| Autenticación Supabase (email + contraseña, sesión en SecureStore) | ✅ Implementado |
| Alcance por cuenta: los datos locales de una cuenta no se mezclan con los de otra | ✅ Implementado (scoping por `subject_id` + adopción explícita de registros del dispositivo) |
| Sincronización Supabase (outbox transaccional + push idempotente) | ✅ Implementado; **requiere aplicar el modelo remoto** (`supabase/proposed-migrations/`) |
| Auto-sync por conectividad/foreground y pull remoto con cursor de servidor | ⏳ Pendiente (continuación del Incremento 2) |
| Hematología: panel de laboratorio, unidades originales y convertidas, fecha de toma/reporte, laboratorio, muestra, método, intervalo de referencia, estado de verificación | ✅ Implementado (`/laboratorio`) |
| Documentos privados del laboratorio (metadatos + copia en sandbox privado con SHA-256) | ✅ Infraestructura implementada; falta la captura en UI |
| Líneas basales versionadas (periodo, método, observaciones de origen, estado) | ✅ Implementado (`/basales`) |
| Elegibilidad analítica (datos insuficientes, no comparable, calidad, duplicados, cambio de método) | ✅ Implementado |
| Descripción estadística y tendencias por tiempo real (método versionado, n visible, unidades) | ✅ Implementado (`/analisis`) |
| Ejecuciones de análisis reproducibles (`analysis_runs` + observaciones de entrada) | ✅ Implementado |
| Línea de linterna para documentar inspección pupilar (sin derivar mediciones) | ✅ Implementado (`/linterna`); pendiente de verificación en dispositivo |
| Pronóstico de referencia y proyección experimental con intervalo de predicción real | ⏳ Pendiente (Incremento 5) |
| Protocolos versionados, eventos de revisión y exportación | ⏳ Pendiente (Incremento 6) |
| Voz y pupila automatizadas | ⏳ Fuera de alcance por ahora: sin feature flags ni modelos validados; la app no simula mediciones |
| Datos demo sintéticos con banner permanente | ⏳ Pendiente |
| Ejecución verificada en dispositivo iOS/Android | ⏳ Pendiente: requiere development build con SQLCipher |

Detalle del avance en [`PROGRESO.md`](PROGRESO.md).

## Stack

- React Native 0.88 + Expo SDK 58, TypeScript strict, Expo Router,
  arquitectura hexagonal ligera (dominio / aplicación / infraestructura /
  presentación).
- `expo-sqlite`: SQLCipher (`useSQLCipher: true`) en development build;
  en Expo Go, SQLite plano en una base separada con aviso permanente.
  La clave va en Keychain/Keystore (`expo-secure-store`).
- Supabase con clave publicable (RLS, sin secret keys en el cliente),
  sesión persistida en SecureStore, outbox local transaccional y push
  idempotente (`SyncNowUseCase`).
- `expo-file-system` para los documentos privados del laboratorio
  (copia al sandbox de la app + digest SHA-256 real de los bytes).
- React Hook Form + Zod.
- Sistema de diseño responsivo (1 columna en móvil, 2 en tablet) con
  tokens de color verificados y foco en accesibilidad.
- Pruebas: Jest (52 unitarias: dominio, aplicación, sincronización,
  analítica) + SQLite real con `node:sqlite` (7 de integración:
  migraciones, persistencia, integridad, outbox).

## Requisitos

- Node 22+, npm 10+.
- Cuenta de Expo (para EAS Build; el proyecto está preparado con `eas.json`).

## Ejecutar en Expo Go (SQLite plano explícito)

Expo Go **no incluye SQLCipher** (limitación verificada en la
documentación de expo-sqlite). Para correr en Expo Go, `.env` define
`EXPO_PUBLIC_ALLOW_UNENCRYPTED_DB=1`:

```bash
npm install
npx expo start          # escanear el QR con Expo Go
```

En este modo la app corre sobre una base SQLite **sin cifrar y
separada** (`orbita_salud_local.db`) y muestra un **banner permanente**:
"Modo Expo Go: datos guardados sin cifrado en este dispositivo". Nunca
es silencioso: sin ese permiso explícito, la app se bloquea con un
mensaje claro en lugar de degradar. La sincronización con Supabase
funciona igual en ambos modos cuando hay internet.

## Development build (cifrado con SQLCipher — configuración recomendada)

```bash
npx eas-cli login                 # cuenta de Expo
npm run build:dev                 # eas build --profile development --platform android
# o, con Xcode/Android Studio locales:
npx expo run:android              # / run:ios
```

El build de desarrollo sí incluye SQLCipher: la app verifica
`PRAGMA cipher_version` antes de aplicar la clave; si no hay cifrado,
se bloquea con un mensaje explícito.

## Cuentas y datos por usuario

- Inicio → "Iniciar sesión para sincronizar" → crear cuenta o iniciar
  sesión con email y contraseña (Supabase Auth).
- Mientras hay sesión, cada registro se guarda con `subject_id = auth.uid()`:
  cumple la FK remota y las políticas RLS (`subject_id = auth.uid()`), y
  el push idempotente lo replica en Supabase.
- Sin sesión, la app usa un **alcance local del dispositivo**: los datos
  se guardan igual (offline-first) pero **no** se atribuyen a ninguna
  cuenta remota.
- Al iniciar sesión, los registros del dispositivo **no** se reasignan
  solos: la app muestra cuántos hay y ofrece una acción explícita para
  asociarlos a la cuenta.
- Dos cuentas que usan el mismo dispositivo no ven los datos de la otra:
  todas las lecturas locales filtran por el alcance activo.
- Sin conexión no hay autenticación remota: la app sigue funcionando
  localmente y lo dice; no promete re-autenticarse sin internet.

## Sincronización con Supabase (cuando hay internet)

1. En Inicio → "Iniciar sesión para sincronizar" → crear/iniciar sesión.
2. Registra tu seguimiento (funciona igual sin conexión).
3. "Sincronizar ahora": push idempotente vía outbox (sesiones antes que
   observaciones). Los fallos quedan visibles y se reintentan; nada se
   descarta sin confirmación del servidor.

**Pendiente de tu acción:** el esquema remoto aún no está aplicado; hasta
que se ejecute `supabase/proposed-migrations/000_supabase_model_v2.sql`
(o los archivos `0001…0005`), el push reporta "Tabla no disponible"
(honesto) y los datos siguen guardados en el dispositivo. Instrucciones
en [`supabase/proposed-migrations/README.md`](supabase/proposed-migrations/README.md).
El auto-sync al recuperar conexión y el pull remoto llegan en la
continuación del Incremento 2.

## Comandos (verificados en este repositorio)

```bash
npm install
npx tsc --noEmit          # verificación de tipos: OK
npx jest                  # 52 pruebas unitarias: OK
npm run test:integration  # 7 pruebas de integración con SQLite real: OK
npx expo lint             # sin problemas
npx expo-doctor           # 20/20 comprobaciones OK
npx expo export --platform ios --platform android   # bundles iOS y Android: OK

# Ejecutar en dispositivo (requiere build nativo con SQLCipher):
npx expo run:android      # o: npx expo run:ios
```

## Rutas (Expo Router)

| Ruta | Función |
|---|---|
| `/` | Inicio: último registro, pendientes, estado de sincronización, cuenta activa |
| `/registrar` | Registro diario manual |
| `/historial` | Historial de registros |
| `/laboratorio` | Panel de hematología con unidades y conversiones verificadas |
| `/basales` | Líneas basales versionadas |
| `/analisis` | Elegibilidad, descripción y tendencias |
| `/acceso` | Acceso con email y contraseña (Supabase Auth) |
| `/linterna` | Documentar inspección pupilar con linterna (sin derivar mediciones) |

## Documentación

- [`PROGRESO.md`](PROGRESO.md) — avance por incremento y pendientes.
- [`docs/product.md`](docs/product.md) — producto, alcance y límites.
- [`docs/architecture.md`](docs/architecture.md) — hexagonal, puertos y flujos.
- [`docs/evidence.md`](docs/evidence.md) — evidencia por afirmación.
- [`docs/clinical-safety.md`](docs/clinical-safety.md) — restricciones clínicas.
- [`docs/data-dictionary.md`](docs/data-dictionary.md) — tablas y campos.
- [`docs/offline-sync.md`](docs/offline-sync.md) — estado offline y sincronización.
- [`docs/analytics-methods.md`](docs/analytics-methods.md) — métodos y versiones.
- [`docs/validation-plan.md`](docs/validation-plan.md) — plan de validación.
- [`docs/model-cards/`](docs/model-cards/) — fichas de modelo (cuando existan).

## Referencia científica principal

Trudel G. et al. "Hemolysis contributes to anemia during long-duration
space flight". *Nature Medicine* 28, 59–62 (2022).
DOI: [10.1038/s41591-021-01637-7](https://doi.org/10.1038/s41591-021-01637-7).

Interpretación documentada en `docs/evidence.md`: estudio con 14
astronautas; ~54 % de aumento promedio de hemólisis respecto a
pre-vuelo; **no** implica perder el 54 % de los glóbulos rojos ni
permite pronósticos individuales. Este prototipo no convierte ese
resultado grupal en reglas de alerta.

# Órbita Salud

Prototipo móvil de seguimiento longitudinal de salud para astronautas o
participantes en entornos análogos (misión análoga, confinamiento, etc.).

> **Aviso importante.** Órbita Salud **no es un sistema certificado para
> vuelo ni un dispositivo médico validado**. No diagnostica, no prescribe
> y no infiere mediciones. Registra, describe y —en incrementos
> posteriores— proyecta con métodos explícitos y reproducibles.

## Estado actual (Incremento 2 completado)

| Capacidad | Estado |
|---|---|
| Registro manual diario (ánimo, estrés, fatiga, sueño, síntomas, FC, PA, SpO₂, nota) | ✅ Implementado, pruebas unitarias |
| Validación de entrada con reglas puras (Zod + reglas de dominio) | ✅ Implementado, 32 pruebas unitarias |
| SQLite cifrado (SQLCipher) con migraciones versionadas | ✅ Implementado, 7 pruebas de integración sobre SQLite real |
| Historial y último registro con antigüedad | ✅ Implementado |
| Modo Expo Go (SQLite plano explícito, base separada, banner permanente) | ✅ Implementado; pendiente de verificación en dispositivo |
| Persistencia tras reinicio | ✅ Verificado con SQLite real en pruebas |
| Linterna de inspección pupilar (LED iOS/Android, Expo Go incluido) | ✅ Implementado; documentación de lo observado, sin derivar mediciones; pendiente de verificación en dispositivo |
| Autenticación Supabase (email/contraseña, sesión en SecureStore) | ✅ Implementado, incluido en 36 pruebas unitarias |
| Sincronización Supabase (outbox transaccional + push idempotente) | ✅ Implementado; **requiere aplicar las migraciones remotas** (`supabase/proposed-migrations/`) |
| Auto-sync por conectividad/foreground y pull remoto | ⏳ Incremento 2 (continúa) — no implementado |
| Hematología con documentos privados y líneas basales | ⏳ Incremento 3 — catálogo sembrado, UI pendiente |
| Elegibilidad, descripción, tendencias | ⏳ Incremento 4 — no implementado |
| Pronóstico de referencia y proyección experimental | ⏳ Incremento 5 — no implementado |
| Protocolos, revisión, exportación | ⏳ Incremento 6 — no implementado |
| Voz y pupila | ⏳ Después del núcleo, tras feature flags |
| Ejecución verificada en dispositivo iOS/Android | ⏳ Pendiente: requiere development build |

## Stack

- React Native 0.88 + Expo SDK 58, TypeScript strict, Expo Router,
  arquitectura hexagonal ligera.
- `expo-sqlite`: SQLCipher (`useSQLCipher: true`) en development build;
  en Expo Go, SQLite plano en una base separada con aviso permanente.
  La clave va en Keychain/Keystore (`expo-secure-store`).
- Supabase con clave publicable (RLS, sin secret keys en el cliente),
  sesión persistida en SecureStore, outbox local transaccional y push
  idempotente (`SyncNowUseCase`).
- React Hook Form + Zod.
- Pruebas: Jest (36 unitarias: dominio, aplicación, sincronización) +
  SQLite real con `node:sqlite` (7 de integración: migraciones,
  persistencia, outbox).

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

## Sincronización con Supabase (cuando hay internet)

1. En Inicio → "Iniciar sesión para sincronizar" → crear/iniciar sesión.
2. Registra tu seguimiento (funciona igual sin conexión).
3. "Sincronizar ahora": push idempotente vía outbox (sesiones antes que
   observaciones). Los fallos quedan visibles y se reintentan; nada se
   descarta sin confirmación del servidor.

**Pendiente de tu acción:** el esquema remoto aún no existe; hasta que
se apliquen `supabase/proposed-migrations/0001…0005`, el push reporta
"Tabla no disponible" (honesto) y los datos siguen guardados en el
dispositivo. Instrucciones en
[`supabase/proposed-migrations/README.md`](supabase/proposed-migrations/README.md).
El auto-sync al recuperar conexión y el pull remoto llegan en la
continuación del Incremento 2.

## Comandos (verificados en este repositorio)

```bash
npm install
npx tsc --noEmit          # verificación de tipos: OK
npx jest                  # 36 pruebas unitarias: OK
npm run test:integration  # 7 pruebas de integración con SQLite real: OK
npx expo lint             # sin problemas
npx expo-doctor           # 20/20 comprobaciones OK

# Ejecutar en dispositivo (requiere build nativo con SQLCipher):
npx expo run:android      # o: npx expo run:ios
```

## Documentación

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

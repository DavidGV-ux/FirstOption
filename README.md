# Órbita Salud

Prototipo móvil de seguimiento longitudinal de salud para astronautas o
participantes en entornos análogos (misión análoga, confinamiento, etc.).

> **Aviso importante.** Órbita Salud **no es un sistema certificado para
> vuelo ni un dispositivo médico validado**. No diagnostica, no prescribe
> y no infiere mediciones. Registra, describe y —en incrementos
> posteriores— proyecta con métodos explícitos y reproducibles.

## Estado actual (Incremento 1 completado)

| Capacidad | Estado |
|---|---|
| Registro manual diario (ánimo, estrés, fatiga, sueño, síntomas, FC, PA, SpO₂, nota) | ✅ Implementado, pruebas unitarias |
| Validación de entrada con reglas puras (Zod + reglas de dominio) | ✅ Implementado, 32 pruebas unitarias |
| SQLite cifrado (SQLCipher) con migraciones versionadas | ✅ Implementado, 7 pruebas de integración sobre SQLite real |
| Historial y último registro con antigüedad | ✅ Implementado |
| Modo Expo Go (demo explícito, sin cifrado, con banner permanente) | ✅ Implementado (código); pendiente de prueba en dispositivo |
| Persistencia tras reinicio | ✅ Verificado con SQLite real en pruebas |
| Sincronización Supabase (outbox, RLS) | ⏳ Incremento 2 — **no implementado** |
| Hematología con documentos privados y líneas basales | ⏳ Incremento 3 — catálogo sembrado, UI pendiente |
| Elegibilidad, descripción, tendencias | ⏳ Incremento 4 — no implementado |
| Pronóstico de referencia y proyección experimental | ⏳ Incremento 5 — no implementado |
| Protocolos, revisión, exportación | ⏳ Incremento 6 — no implementado |
| Voz y pupila | ⏳ Después del núcleo, tras feature flags |
| Ejecución verificada en dispositivo iOS/Android | ⏳ Pendiente: requiere development build |

## Stack

- React Native 0.88 + Expo SDK 58 (development build; **no Expo Go**:
  SQLCipher no está disponible en Expo Go y la app se niega a degradar).
- TypeScript strict, Expo Router, arquitectura hexagonal ligera.
- `expo-sqlite` con SQLCipher (`useSQLCipher: true`), clave aleatoria por
  instalación en Keychain/Keystore (`expo-secure-store`).
- React Hook Form + Zod.
- Pruebas: Jest (dominio/aplicación) + SQLite real con `node:sqlite`
  (migraciones, persistencia, integridad).

## Requisitos

- Node 22+, npm 10+.
- Cuenta de Expo (para EAS Build; el proyecto está preparado con `eas.json`).

## Ejecutar en Expo Go (modo demo, sin cifrado)

Expo Go **no incluye SQLCipher** (limitación verificada en la
documentación de expo-sqlite). Para probar la interfaz en Expo Go:

```bash
# En .env (no se sube al repositorio):
# EXPO_PUBLIC_DATA_MODE=demo
# EXPO_PUBLIC_ALLOW_UNENCRYPTED_DB=1
npm install
npx expo start          # escanear el QR con Expo Go
```

En este modo la app corre sobre una base SQLite **sin cifrar y
separada** (`orbita_salud_demo.db`) y muestra un **banner permanente**:
"Sin cifrado (Expo Go) — almacenamiento de prueba, no para datos
reales". Nunca es silencioso: sin ese permiso explícito, la app se
bloquea con un mensaje claro en lugar de degradar.

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

## Comandos (verificados en este repositorio)

```bash
npm install
npx tsc --noEmit          # verificación de tipos: OK
npx jest                  # 32 pruebas unitarias: OK
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
- [`docs/offline-sync.md`](docs/offline-sync.md) — política offline y plan de sync.
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

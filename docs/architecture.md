# Arquitectura

Arquitectura hexagonal ligera. El dominio es puro (TypeScript sin
React, Expo ni Supabase) y las dependencias apuntan hacia adentro.

```
src/
├── domain/                  # PURO: entidades, reglas, puertos
│   ├── metrics/             # Catálogo de métricas + esquema de coherencia
│   ├── observations/        # Entidades + esquema de registro diario
│   ├── repositories/        # PUERTOS (interfaces) de persistencia
│   ├── shared/              # Reloj, ids, antigüedad relativa
│   └── analytics/           # (Inc 4–5) eligibility, baselines,
│                            #  descriptive, trends, forecasting,
│                            #  threshold-scenarios
├── application/             # Casos de uso y DTO
│   └── use-cases/
├── infrastructure/          # Adaptadores concretos
│   ├── clock/               # Reloj del sistema
│   ├── database/            # Driver, migraciones, apertura con SQLCipher
│   ├── ids/                 # UUID en cliente (expo-crypto)
│   ├── repositories/        # Implementación SQLite del puerto
│   └── security/            # Clave SQLCipher, identidad local
├── presentation/            # Tokens, componentes, configuración de UI
└── app/                     # Expo Router: pantallas y proveedores
```

## Reglas estructurales (verificables)

1. **El dominio no importa React, Expo ni Supabase.** Verificado por
   revisión: `src/domain/**` solo importa TypeScript y `zod`.
2. **La presentación no consulta tablas.** Las pantallas usan casos de
   uso expuestos por `AppServicesProvider` (`src/app/providers.tsx`).
3. **El motor analítico recibirá datos y devolverá resultados
   tipados** (puerto en `domain/analytics`). Un fallo analítico no
   impide guardar una medición: el guardado es transacción única de
   repositorio y el análisis se ejecuta después.
4. **SQL siempre parametrizado** (verificado con prueba de integración
   de inyección con comillas).

## Flujo de guardado (Incremento 1)

```
UI (Registrar) → Zod (pantalla) → RegisterDailyLogUseCase
  → validación de dominio + regla de fecha futura
  → ObservationRepository.saveSessionWithObservations (1 transacción)
  → confirmación inmediata: savedOffline = true
```

- La sesión y sus observaciones se escriben en **una transacción**:
  si algo falla, no quedan datos a medias (prueba de integración n.º 6).
- Los IDs de sesión y observación se generan en el cliente
  (`expo-crypto.randomUUID`); el ID de observación es determinista
  (`sessionId:metricId`) para que un reintento local no duplique filas.

## Apertura de base de datos (cifrado verificable)

`openAppDatabase()` (`infrastructure/database/open-database.ts`):

1. Abre la BD con `expo-sqlite`.
2. Consulta `PRAGMA cipher_version`.
3. Si no hay SQLCipher en el binario → **error explícito y pantalla de
   bloqueo**; nunca degrada a una base sin cifrar (documentación de
   expo-sqlite: `PRAGMA key` no falla si el binario no incluye
   SQLCipher, por lo que la verificación previa es obligatoria).
4. Aplica `PRAGMA key` con la clave hexadecimal aleatoria por
   instalación generada por `SecureStoreKeyProvider` (Keychain iOS /
   Keystore Android, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`).
5. Ejecuta `migrateIfNeeded()` con migraciones versionadas por
   `PRAGMA user_version` (aplicación dentro de transacción).

## Migraciones

- Cada versión es una entrada del registro `MIGRATIONS` con su
  número; las versiones aplicadas no se editan.
- Semilla del catálogo: la fuente de verdad es el catálogo del dominio
  (`domain/metrics/catalog-v1.ts`); la migración v1 lo inserta con
  `ON CONFLICT DO NOTHING`.

## Pantallas

| Ruta | Función |
|---|---|
| `src/app/index.tsx` | Inicio: último registro con antigüedad, estado de sincronización, pendiente de hoy, CTA |
| `src/app/registrar.tsx` | Registro diario (RHF + Zod, fecha de toma con picker nativo) |
| `src/app/historial.tsx` | Historial local con estados honestos |

## Decisiones pendientes de dispositivo

La verificación en binario nativo (PRAGMA cipher_version en un build
con SQLCipher, flujos iOS/Android, permisos) queda **pendiente** hasta
poder ejecutar un development build; el estado se reporta de forma
honesta en cada entrega.

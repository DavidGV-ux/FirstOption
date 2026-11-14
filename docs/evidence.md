# Evidencia

Cada afirmación relevante se clasifica en una de estas categorías:

- **Evidencia publicada**: resultado de literatura revisada.
- **Decisión de ingeniería**: elección técnica con razonamiento.
- **Hipótesis**: suposición a verificar.
- **Función experimental**: visible como tal en la UI.
- **Limitación**: algo que el prototipo deliberadamente no hace.
- **Pendiente de verificación**: afirmación aún no comprobada.

## Evidencia publicada

- Trudel G. et al. "Hemolysis contributes to anemia during long-duration
  space flight". *Nature Medicine* 28, 59–62 (2022),
  DOI 10.1038/s41591-021-01637-7.
  - Estudió **14 astronautas**; la hemólisis aumentó en promedio
    **≈ 54 %** respecto a pre-vuelo durante vuelos de larga duración;
    se observaron efectos eritrocitarios hasta un año tras el
    aterrizaje.
  - **Interpretación en este proyecto**: no implica perder el 54 % de
    los glóbulos rojos; persistencia al año no significa permanencia;
    resultados grupales no se convierten en pronósticos individuales;
    no se deriva hemólisis ni hemoglobina de pulso, voz o pupila; no se
    atribuye causalidad a asociaciones temporales.
- TRIPOD+AI: referencia de **transparencia** para documentar modelos
  futuros. No es certificación ni prueba de validez.

## Decisiones de ingeniería

- **SQLCipher en vez de SQLite plano**: los registros son clínicos y el
  almacenamiento local debe cifrarse. Verificado que `expo-sqlite` SDK
  58 soporta `useSQLCipher` vía config plugin y que `PRAGMA
  cipher_version` debe consultarse antes de `PRAGMA key` (si no, la
  clave se aplica silenciosamente a una BD sin cifrar).
- **ID de observación determinista (`sessionId:metricId`)**: evita
  duplicados por reintento local sin recurrir a last-write-wins.
- **node:sqlite para pruebas de integración**: permite probar el SQL de
  migraciones real sin dispositivo; mismo SQL que la app.
- **Una sesión = una captura por métrica**: el formulario diario captura
  una toma por métrica; el catálogo admite sesiones futuras con más
  granularidad (hematología, Incremento 3).

## Hipótesis

- La clave SQLCipher en Keychain/Keystore con
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY` es suficiente para el prototipo. A
  revisar con el equipo de seguridad antes de cualquier uso real.

## Función experimental

- Ninguna por ahora. Las proyecciones y escenarios de umbral (Inc 5)
  quedarán marcadas como experimentales con supuestos visibles.

## Limitaciones (deliberadas)

- No diagnostica, no prescribe, no muestra riesgo clínico.
- No convierte el aumento grupal de hemólisis del estudio en reglas de
  alerta.
- No presenta ausencia de datos como normalidad.
- No infiere valores faltantes ni descarta extremos automáticamente.
- Las escalas 1–5 no son instrumentos validados y se etiquetan como
  propias del prototipo.

## Pendiente de verificación

- **PRAGMA cipher_version en binario nativo** (development build con
  `useSQLCipher=true`): la verificación está implementada pero no
  ejecutada en dispositivo.
- **Modo Expo Go sin cifrado** (demo explícito con banner): código
  implementado; prueba en dispositivo pendiente. Este modo usa una base
  separada (`orbita_salud_demo.db`) y solo está permitido con
  `EXPO_PUBLIC_ALLOW_UNENCRYPTED_DB=1` y `EXPO_PUBLIC_DATA_MODE=demo`.
- **Flujos completos en iOS y Android** (persistencia tras reinicio
  real, permisos, teclados).
- **Contraste de colores** calculado contra WCAG AA con las parejas de
  tokens (pendiente de verificación con herramienta sobre la build;
  los valores se eligieron para contraste alto, ver abajo).
- **Sincronización Supabase** (Inc 2): diseño documentado, no
  implementado.

## Contraste de tokens (pendiente de cálculo formal)

Parejas usadas en UI: texto principal #172B3A sobre fondo #F5F7F8 y
superficie #FFFFFF; acento #356D78 como fondo de botón con texto blanco
#FFFFFF. Los valores se eligieron con contraste alto en mente, pero la
verificación formal con calculadora WCAG queda **pendiente** y se
registrarán los resultados aquí.

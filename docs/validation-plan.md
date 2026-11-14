# Plan de validación

Separación permanente entre **validación de software** (¿el programa
hace lo que dice?) y **validación clínica** (¿el uso previsto es seguro
y beneficioso?). El prototipo solo afirma lo primero.

## 1. Validación de software

### Cobertura por requisito de la especificación

| # | Requisito | Estado | Cómo se verifica |
|---|---|---|---|
| 1 | Persistencia tras reinicio | ✅ Probado (SQLite real) | `test/integration/sqlite.test.ts` n.º 2: guardar, cerrar, reabrir, leer |
| 2 | Modo avión tras aprovisionamiento | ⏳ Pendiente (dispositivo) | Flujo E2E sin red |
| 3 | Sincronización idempotente | ⏳ Inc 2 | Upsert por id + outbox |
| 4 | Autorización por sujeto y asignación | ⏳ Inc 2 | Pruebas RLS permitido/denegado |
| 5 | Separación de caché entre usuarios | ⏳ Inc 2 | Cambio de cuenta + inspect |
| 6 | Conversiones de unidades | ⏳ Inc 3 | Registro de conversiones verificadas |
| 7 | Fechas irregulares | ✅ Probado | `relative-age` con fechas irregulares; esquema ISO |
| 8 | Ausencia de datos | ✅ Probado | Caso de uso no afirma normalidad |
| 9 | Duplicados | ✅ Probado | PK determinista rechaza duplicado (integración n.º 3) |
| 10 | Mala calidad | ⏳ Inc 4 | `quality_state` + elegibilidad |
| 11 | Cambios de método | ⏳ Inc 4 | Comparabilidad por método |
| 12 | Línea basal versionada | ⏳ Inc 4 | Versionado + conservación por análisis |
| 13 | Sin datos futuros en históricos | ⏳ Inc 4 | Corte temporal en implementación |
| 14 | Proyección desactivada con datos insuficientes | ⏳ Inc 5 | Estado no concluyente |
| 15 | Intervalos no invertidos y unidades coherentes | ⏳ Inc 5 | Validación de PI |
| 16 | Sin diagnósticos sin protocolo | ✅ Por diseño (Inc 1) | Sin motor de diagnóstico; revisión en Inc 6 |
| 17 | Correcciones invalidan análisis previos | ⏳ Inc 4+ | Procedencia + marcado |
| 18 | Fallo de análisis no impide guardar | ✅ Por diseño | Guardado transaccional independiente (probado) |
| 19 | Denegación de permisos | ⏳ Permisos llegan con sensores/voz/pupila | Flujos sin permiso |
| 20 | Cifrado en binario nativo | ⏳ Pendiente (build) | PRAGMA cipher_version en build real |
| 21 | Sin secretos en logs | ✅ Por diseño | Logger sin datos clínicos; revisión de código |
| 22 | Flujos iOS y Android | ⏳ Pendiente (dispositivos) | E2E en ambas plataformas |

### Comandos de verificación ejecutados (Incremento 1)

```
npx tsc --noEmit           → OK (cero errores)
npx jest                   → 32/32 OK
npm run test:integration   → 7/7 OK (SQLite real)
npx expo lint              → 0 problemas
npx expo-doctor            → 20/20 OK
```

## 2. Validación analítica (Inc 5)

- Comparar método proyectado contra "último valor" como referencia.
- Definir horizontes **antes** de evaluar; cortes temporales
  progresivos; preprocesamiento ajustado solo con datos disponibles en
  cada corte.
- Métricas: MAE, RMSE cuando corresponda; cobertura y amplitud de
  intervalos. R² nunca como única evidencia.
- Reportar por sujeto y contexto; no afirmar capacidad clínica a partir
  de datos sintéticos.

## 3. Validación clínica (futuro, puerta cerrada)

Para activar cualquier predicción clínica se requerirán: desenlace
definido, horizonte definido, población objetivo, datos y etiquetas
adecuados, separación sujeto/tiempo según diseño, discriminación y
calibración, incertidumbre, utilidad por grupos, validación externa
documentada y aprobación explícita para uso previsto. Mientras no se
cumplan, el nivel 5 permanece desactivado.

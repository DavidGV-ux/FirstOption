# Métodos analíticos

Este documento declara, para cada método analítico, su versión, qué
calcula y qué NO interpreta. Ningún método está implementado todavía
en el Incremento 1: lo que sigue es el contrato que se verificará al
implementarlos.

## Principios

- Cada método tiene **nombre, versión y parámetros explícitos**; cada
  `analysis_run` almacenará método, versión, parámetros, fecha de
  corte, línea basal usada y limitaciones, junto con los identificadores
  de las observaciones de entrada (`analysis_input_observations`).
- Los requisitos mínimos (número de observaciones, separación temporal,
  cobertura) son **configurables por métrica y método**; ningún número
  arbitrario de puntos se presenta como garantía de validez.
- No se interpola datos faltantes por defecto; no se descartan valores
  extremos automáticamente.
- La unidad de tiempo es real (fechas), nunca el índice de fila.

## Estados de elegibilidad (Inc 4)

`ok` · `insufficient_data` · `inconclusive` · `not_comparable` ·
`unsupported`. Antes de calcular: unidad, tipo de valor, calidad,
duplicados, comparabilidad (dispositivo/laboratorio/método), cobertura
temporal, separación, fase de misión.

## Descripción (Inc 4)

- Cambio absoluto; cambio relativo solo cuando la métrica lo admite
  (nunca en escalas ordinales).
- Resúmenes por ventana con dispersión.
- Pendiente por tiempo real (unidad/mes o unidad/día según ventana).
- Comparación con línea basal versionada (periodo, método, condiciones
  y estado explícitos; sin datos futuros en análisis retrospectivos).

## Tendencias (Inc 4)

Método versionado con ventana configurable, número de observaciones
visible y criterio de estabilidad explícito. La ausencia de
significación **no** se interpretará como estabilidad demostrada. Los
outliers se conservan y se muestra su tratamiento.

## Proyecciones (Inc 5)

- Puerto `ForecastProvider`; primera etapa: pronóstico ingenuo de
  referencia + un método sencillo interpretable, con evaluación
  (MAE/RMSE, cobertura y amplitud de intervalos, cortes temporales
  progresivos, sin fuga de información).
- Toda proyección registrará métrica, fecha de corte, horizonte, datos
  usados, método/versión, configuración, estimación, intervalo de
  predicción **solo si está realmente calculado** (nunca el IC de la
  media como PI), nivel nominal, supuestos, limitaciones y estado.
- Horizontes limitados; sin extrapolación entre fases de misión sin
  justificación; datos insuficientes → estado no concluyente.

## Escenarios de cruce de umbral (Inc 5)

Desactivados por defecto. El umbral indicará origen y versión
(referencia de laboratorio ≠ protocolo clínico ≠ demo técnica). Un
cruce proyectado **no** es diagnóstico ni porcentaje de riesgo. Texto
permitido: "La proyección experimental alcanza el umbral configurado
dentro del horizonte analizado. Requiere revisión."

## Predicción clínica (nivel 5)

Desactivada hasta contar con: desenlace definido, horizonte definido,
población objetivo, datos y etiquetas adecuados, modelo documentado
(TRIPOD+AI como guía de transparencia), evaluación independiente y
aprobación para uso previsto.

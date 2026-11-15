# Seguridad clínica

## Separación de niveles

La app implementa (o implementará) cada nivel del principio
fundamental de forma separada y verificable. Ninguna pantalla muestra
actualmente un nivel 2 o superior: solo medición y estado de registro.

## Seguridad del almacenamiento

- **Development build (configuración recomendada):** base cifrada con
  SQLCipher; `PRAGMA cipher_version` se verifica antes de aplicar la
  clave; sin cifrado, la app se bloquea con mensaje explícito.
- **Expo Go (solo demo):** Expo Go no incluye SQLCipher (limitación
  verificada). Existe un modo de prueba **explícito y no silencioso**:
  requiere `EXPO_PUBLIC_ALLOW_UNENCRYPTED_DB=1` y
  `EXPO_PUBLIC_DATA_MODE=demo`, usa una base separada sin cifrar
  (`orbita_salud_demo.db`) y muestra un **banner permanente** en toda
  la app. Está prohibido mezclarlo con datos reales.
- **Clave SQLCipher:** aleatoria por instalación (32 bytes de
  `expo-crypto`), guardada en Keychain/Keystore con
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; nunca en logs ni en el repositorio.

## Reglas activas en el Incremento 1

1. **No diagnosticar.** Ningún texto de la UI diagnostica anemia,
   hemólisis, depresión, SANS ni ninguna condición. La pantalla de
   registro declara: "Prototipo de seguimiento: no diagnostica ni
   reemplaza evaluación clínica."
2. **No prescribir.** No hay recomendaciones de hierro, medicamentos ni
   cambios de tratamiento.
3. **No inferir mediciones.** Los campos vacíos se guardan vacíos; no
   se infieren valores faltantes. Los signos vitales son opcionales y
   el formulario lo indica.
4. **No presentar normalidad con ausencia de datos.** El historial
   vacío dice "Sin registros todavía"; el inicio distingue "no hay
   registros" de "el último registro no es de hoy".
5. **No aceptar fechas futuras.** Una toma no puede ocurrir después de
   "ahora" (regla de dominio, probada).
6. **Integridad de presión arterial.** Se requiere ambas componentes y
   PAD < PAS (regla de dominio, probada).
7. **Sin puntuación global de salud.** Prohibido por diseño del
   producto.
8. **Sin números de relleno.** Los estados vacíos no inventan datos.

## Reglas para incrementos futuros (compromisos de diseño)

- Las tendencias (Inc 4) mostrarán número de observaciones, unidad de
  pendiente y método versionado; no interpretarán ausencia de
  significación como estabilidad demostrada.
- Las proyecciones (Inc 5) mostrarán horizonte limitado, supuestos,
  intervalos solo si están realmente calculados, y texto de cruce de
  umbral permitido por la especificación; desactivadas con datos
  insuficientes.
- Los protocolos (Inc 6) separarán recordatorios, eventos descriptivos
  y alertas clínicas; sin protocolo aprobado no se emiten diagnósticos;
  una proyección nunca anula un evento actual.
- La pertenencia a una misión no concederá acceso clínico; el acceso
  profesional requerirá asignación explícita.
- Un intervalo de referencia de laboratorio no se tratará como umbral
  operativo de misión.

## Regla del PPG con linterna

El modo de pulso usa la cámara trasera y el LED para detectar la onda
de pulso (PPG) y estimar **solo la frecuencia cardíaca** (BPM) y su
calidad de señal (SQI).

- La **presión arterial** y la **SpO₂ no se miden** con cámara y
  linterna. No se estiman, no se rellenan con valores normales y no se
  guardan como observaciones.
- La frecuencia cardíaca se marca siempre como aproximación
  experimental; no sustituye un electrocardiograma, un pulsioxímetro ni
  un esfigmomanómetro.
- Si la señal es insuficiente, no se inventa un valor: se informa la
  falta de señal y se ofrecen recomendaciones de colocación del dedo.
- La app no diagnostica arritmias, hipertensión ni hipoxia.

## Regla de la linterna (PLR y PPG)

La pantalla de linterna ofrece **solo dos modos**: pulso óptico (PPG) y
reflejo fotomotor pupilar (PLR). La captura pupilar asistida se retiró
porque la estimación automática del tamaño pupilar no era fiable.

- **PLR:** aplica un pulso de luz y solo calcula latencia, velocidades y
  amplitud si se obtuvieron muestras reales de la pupila. Si no hay
  muestras suficientes, se muestra «sin medición» y no se guarda nada.
  **Nunca se usa una secuencia sintética para producir valores.**
- Los resultados PLR son descriptivos y experimentales: no se clasifican
  como «normal/retardado» ni se interpretan como fatiga, somnolencia o
  alerta. No sustituyen una exploración pupilar profesional.
- **PPG:** solo estima frecuencia cardíaca y calidad de señal. La presión
  arterial y la SpO₂ no se miden, no se rellenan con valores normales y
  no se guardan.
- La app no diagnostica arritmias, hipertensión, hipoxia ni alteraciones
  neurológicas.
- El LED se apaga al salir de la pantalla y la cámara se desmonta al
  perder el foco.
- Las pruebas automatizadas **no activan el flash ni la cámara**; solo
  verifican validación, cálculo y guardado con datos de prueba.

## Escalas propias

Las escalas 1–5 (ánimo, estrés, fatiga, calidad de sueño) son del
prototipo, con anclas definidas en
`src/presentation/features/register/scale-config.ts`. No son
instrumentos clínicos validados; se declara en la pantalla. No se
calculan porcentajes de cambio en escalas ordinales.

## Referencia científica y sus límites

El estudio de Trudel et al. (2022) es la referencia principal del
proyecto. Sus límites interpretativos (14 participantes, resultado
grupal, persistencia al año sin afirmar permanencia) están
documentados en `docs/evidence.md` y **no se traducen en reglas de
alerta ni en expectativas individuales**.

## Cadena de responsabilidad

- El prototipo no sustituye juicio clínico.
- Los datos quedan a disposición del equipo de salud de la misión
  cuando la sincronización esté implementada (Inc 2) y la persona haya
  consentido; el consentimiento se modela en la migración `consents`.

# Producto

## Objetivo

Órbita Salud es un prototipo de seguimiento longitudinal de salud para
astronautas o participantes en misiones análogas. Registra mediciones,
las describe estadísticamente y —en fases posteriores— ofrece
proyecciones experimentales explicables con trazabilidad completa.

## Principio fundamental: niveles separados

| Nivel | Qué es | Estado en el prototipo |
|---|---|---|
| 1. Medición | Registro de un valor real con procedencia | ✅ Incremento 1 |
| 2. Descripción estadística | Cambio absoluto, dispersión, resúmenes | ⏳ Incremento 4 |
| 3. Detección de patrón | Tendencias con método versionado | ⏳ Incremento 4 |
| 4. Proyección de medición | Pronóstico experimental explícito | ⏳ Incremento 5 |
| 5. Predicción de desenlace clínico | Requiere modelo evaluado | 🚫 Desactivado hasta validación |
| 6. Decisión clínica | Persona profesional autorizada | 🚫 Fuera de la app |

Cada nivel se implementa de forma verificable antes de construir el
siguiente. La app nunca muestra puntuaciones globales de salud ni
porcentajes de riesgo.

## Alcance del Incremento 1

- Registro diario manual: ánimo, estrés, fatiga, calidad y duración del
  sueño, síntomas (presencia/ausencia), frecuencia cardíaca, presión
  arterial, SpO₂ y nota opcional.
- Almacenamiento local cifrado (SQLCipher) con esquema versionado.
- Historial con antigüedad y estado de sincronización honesto.
- Validación de entrada con reglas puras y mensajes en español.

## Escalas propias

Las escalas 1–5 de autorreporte (ánimo, estrés, fatiga, calidad de
sueño) **son escalas del prototipo, no instrumentos clínicos
validados**. Se indica en la pantalla de registro. No se calculan
porcentajes de cambio sobre ellas.

## Lo que la app NO hace

- No diagnostica anemia, hemólisis, depresión, SANS ni ninguna condición.
- No recomienda hierro, medicamentos ni cambios de tratamiento.
- No convierte intervalos de referencia de laboratorio en umbrales de
  misión.
- No presenta la ausencia de datos como normalidad.
- No inventa mediciones ni infiere valores faltantes.

## Usuarios

1. **Participante** (astronauta o análogo): registra y consulta sus
   datos; acceso total a sus propios registros.
2. **Equipo profesional**: acceso solo mediante asignación explícita
   (Incremento 2+; la pertenencia a una misión no concede acceso
   clínico).
3. **Administrador técnico**: sin acceso clínico por defecto.

## Métrica de éxito del prototipo

- Un participante puede registrar su seguimiento sin conexión y
  recuperar los datos tras reiniciar la app.
- Cada dato guardado conserva valor original, unidad, fecha de toma y
  procedencia.
- Ninguna interfaz sugiere validez clínica que no existe.

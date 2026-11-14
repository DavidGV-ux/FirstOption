/**
 * Etiquetas y anclas de las escalas propias del prototipo.
 * Son escalas de autorreporte de este prototipo; NO son instrumentos
 * clínicos validados. Esto se comunica en la pantalla de registro.
 */
export interface ScaleConfig {
  metricId: string;
  label: string;
  helper: string;
  anchors: Record<number, string>;
}

export const REGISTER_SCALES: readonly ScaleConfig[] = [
  {
    metricId: 'mood_self_report',
    label: 'Ánimo autorreportado',
    helper: '¿Cómo estuvo tu ánimo en general?',
    anchors: { 1: 'Muy bajo', 2: 'Bajo', 3: 'Neutro', 4: 'Bueno', 5: 'Muy bueno' },
  },
  {
    metricId: 'stress_self_report',
    label: 'Estrés percibido',
    helper: '¿Cuánto estrés percibiste?',
    anchors: { 1: 'Nada', 2: 'Poco', 3: 'Moderado', 4: 'Alto', 5: 'Extremo' },
  },
  {
    metricId: 'fatigue_self_report',
    label: 'Fatiga autorreportada',
    helper: '¿Cuánta fatiga sentiste?',
    anchors: { 1: 'Nada', 2: 'Poca', 3: 'Moderada', 4: 'Alta', 5: 'Extrema' },
  },
  {
    metricId: 'sleep_quality_self_report',
    label: 'Calidad del sueño',
    helper: '¿Cómo fue la calidad de tu último sueño?',
    anchors: { 1: 'Muy mala', 2: 'Mala', 3: 'Regular', 4: 'Buena', 5: 'Muy buena' },
  },
];

export const REGISTER_SYMPTOMS: readonly { metricId: string; label: string }[] = [
  { metricId: 'symptom_headache', label: 'Cefalea' },
  { metricId: 'symptom_nausea', label: 'Náuseas' },
  { metricId: 'symptom_dizziness', label: 'Mareo' },
  { metricId: 'symptom_msk_pain', label: 'Dolor musculoesquelético' },
  { metricId: 'symptom_visual_disturbance', label: 'Alteración visual' },
  { metricId: 'symptom_nasal_congestion', label: 'Congestión nasal' },
];

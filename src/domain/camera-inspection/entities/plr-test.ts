import type { EyeSide } from './camera-capture';

/**
 * Muestra temporal individual durante el protocolo de reflejo fotomotor pupilar (PLR).
 */
export interface PlrTimePoint {
  /** Milisegundos transcurridos desde el inicio del protocolo. */
  timestampMs: number;
  /** Ratio relativo de diámetro o área (pupila / iris o escala normalizada). */
  pupilRatio: number;
  /** Estado del estímulo luminoso en ese instante. */
  flashActive: boolean;
}

/**
 * Interpretación funcional del reflejo fotomotor pupilar.
 * No es un diagnóstico médico de lesión o patología, sino una clasificación
 * funcional objetiva de la cinética pupilar.
 */
export type PlrInterpretation =
  | 'prompt' // Reflejo normal, ágil y reactivo (latencia y velocidad en rango esperado)
  | 'delayed' // Latencia prolongada: inicio de contracción tardío (asociado a fatiga central o somnolencia)
  | 'sluggish' // Reflejo perezoso: velocidad de constricción o amplitud reducida
  | 'inconclusive'; // Datos insuficientes, parpadeo o señal de calidad inadecuada

/**
 * Nivel estimado de fatiga neurológica central derivado de la cinética PLR.
 */
export type NeurologicalFatigueAssessment =
  | 'low_fatigue' // Alta alerta cognitiva, respuesta pupilar óptima
  | 'moderate_fatigue' // Fatiga moderada o estrés leve, latencia ligeramente incrementada
  | 'high_fatigue' // Alerta reducida, latencia notablemente prolongada o reflejo lento
  | 'unclassified'; // No evaluable con certeza estadística

/**
 * Resultado estructurado del análisis de Reflejo Fotomotor Pupilar (PLR).
 */
export interface PlrResult {
  /** Identificador único del test. */
  testId: string;
  /** Ojo evaluado. */
  eyeSide: EyeSide;
  /** Ratio pupilar medio antes del estímulo de luz. */
  baselineRatio: number;
  /** Ratio mínimo alcanzado durante la contracción (nadir). */
  minRatio: number;
  /** Amplitud porcentual de constricción respecto a la línea base: ((baseline - min) / baseline) * 100. */
  constrictionAmplitudePercent: number;
  /** Latencia de contracción en milisegundos (tiempo desde inicio del flash hasta inicio de la caída). */
  latencyMs: number | null;
  /** Velocidad de constricción pupilar en % de ratio basal por segundo (%/s). */
  constrictionVelocityPercentPerSec: number | null;
  /** Velocidad de redilatación pupilar hacia el estado basal en % de ratio basal por segundo (%/s). */
  redilationVelocityPercentPerSec: number | null;
  /** Tiempo en milisegundos desde el flash hasta alcanzar la contracción máxima. */
  timeToMinConstrictionMs: number | null;
  /** Porcentaje de recuperación alcanzado durante la fase de redilatación. */
  recoveryPercent: number;
  /** Nivel de confianza matemática de la señal (0.0 a 1.0). */
  confidence: number;
  /** Clasificación funcional del reflejo. */
  interpretation: PlrInterpretation;
  /** Evaluación descriptiva de fatiga neurológica / alerta. */
  neurologicalFatigueAssessment: NeurologicalFatigueAssessment;
  /** Limitaciones y consideraciones metodológicas explícitas. */
  limitations: readonly string[];
  /** Serie temporal de muestras procesadas (para visualización gráfica). */
  samples: readonly PlrTimePoint[];
  /** Fecha de creación en formato ISO. */
  createdAt: string;
}

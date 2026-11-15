import type { EyeSide } from '../entities/camera-capture';
import type {
  PlrInterpretation,
  NeurologicalFatigueAssessment,
  PlrResult,
  PlrTimePoint,
} from '../entities/plr-test';

export interface CalculatePlrOptions {
  testId?: string;
  eyeSide?: EyeSide;
  flashStartTimeMs: number;
  flashDurationMs?: number;
  nowIso?: string;
}

/**
 * Rangos y umbrales fisiológicos de referencia para la cinética pupilar (PLR).
 * Basados en literatura estándar de pupilometría óptica y medicina aeroespacial.
 */
export const PLR_PHYSIOLOGICAL_THRESHOLDS = {
  /** Latencia mínima biológicamente verosímil (ms); valores menores suelen ser parpadeo previo o ruido. */
  MIN_PLAUSIBLE_LATENCY_MS: 150,
  /** Latencia fisiológica normal máxima (ms); por encima sugiere fatiga del SNC o somnolencia. */
  NORMAL_LATENCY_MAX_MS: 350,
  /** Latencia umbral para fatiga central severa o retardo patológico (ms). */
  HIGH_FATIGUE_LATENCY_MS: 420,
  /** Caída mínima relativa para considerar que ocurrió miosis inducida por luz (5%). */
  MIN_CONSTRICTION_AMPLITUDE_PCT: 5.0,
  /** Amplitud óptima esperada en condiciones de penumbra (>= 15%). */
  NORMAL_CONSTRICTION_AMPLITUDE_PCT: 15.0,
  /** Velocidad de constricción ágil mínima (% de ratio basal por segundo). */
  NORMAL_CONSTRICTION_VELOCITY_PCT_PER_S: 25.0,
  /** Velocidad de redilatación normal mínima (% de ratio basal por segundo). */
  NORMAL_REDILATION_VELOCITY_PCT_PER_S: 8.0,
} as const;

/**
 * Calcula de forma pura las métricas cuantitativas del Reflejo Fotomotor Pupilar (PLR).
 */
export function calculatePlrMetrics(
  samples: readonly PlrTimePoint[],
  options: CalculatePlrOptions,
): PlrResult {
  const {
    testId = `plr-${Date.now()}`,
    eyeSide = 'left',
    flashStartTimeMs,
    nowIso = new Date().toISOString(),
  } = options;

  const limitations: string[] = [];

  // 1. Verificación básica de datos mínimos
  if (!samples || samples.length < 8) {
    limitations.push('Muestras temporales insuficientes para calcular la cinética pupilar.');
    return buildInconclusiveResult(testId, eyeSide, samples, limitations, nowIso);
  }

  // Ordenar cronológicamente
  const sorted = [...samples].sort((a, b) => a.timestampMs - b.timestampMs);

  // 2. Muestras basales (antes del estímulo luminoso)
  const baselineSamples = sorted.filter((s) => s.timestampMs < flashStartTimeMs && !s.flashActive);
  if (baselineSamples.length < 3) {
    limitations.push('Período de adaptación basal pre-estímulo insuficiente (< 3 muestras).');
    return buildInconclusiveResult(testId, eyeSide, sorted, limitations, nowIso);
  }

  // Calcular mediana o media basal
  const baselineRatios = baselineSamples.map((s) => s.pupilRatio);
  const baselineRatio =
    baselineRatios.reduce((acc, v) => acc + v, 0) / baselineRatios.length;

  if (baselineRatio <= 0.05) {
    limitations.push('Ratio pupilar basal inverosímil o pupila no detectada adecuadamente.');
    return buildInconclusiveResult(testId, eyeSide, sorted, limitations, nowIso);
  }

  // 3. Muestras post-estímulo
  const postFlashSamples = sorted.filter(
    (s) => s.timestampMs >= flashStartTimeMs + PLR_PHYSIOLOGICAL_THRESHOLDS.MIN_PLAUSIBLE_LATENCY_MS,
  );

  if (postFlashSamples.length < 3) {
    limitations.push('Tiempo de observación post-estímulo insuficiente.');
    return buildInconclusiveResult(testId, eyeSide, sorted, limitations, nowIso);
  }

  // 4. Encontrar el punto de nadir (mínimo ratio alcanzado durante la constricción)
  let minRatio = baselineRatio;
  let minIndex = -1;

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (s.timestampMs >= flashStartTimeMs) {
      if (s.pupilRatio < minRatio) {
        minRatio = s.pupilRatio;
        minIndex = i;
      }
    }
  }

  const constrictionAmplitudePercent = Math.max(
    0,
    ((baselineRatio - minRatio) / baselineRatio) * 100,
  );

  // Si la amplitud es menor al 5%, no hay respuesta pupilar medible o fue imperceptible
  if (constrictionAmplitudePercent < PLR_PHYSIOLOGICAL_THRESHOLDS.MIN_CONSTRICTION_AMPLITUDE_PCT) {
    limitations.push(
      'No se detectó constricción pupilar apreciable tras el estímulo luminoso (amplitud < 5%).',
    );
    return {
      testId,
      eyeSide,
      baselineRatio: round3(baselineRatio),
      minRatio: round3(minRatio),
      constrictionAmplitudePercent: round1(constrictionAmplitudePercent),
      latencyMs: null,
      constrictionVelocityPercentPerSec: null,
      redilationVelocityPercentPerSec: null,
      timeToMinConstrictionMs: null,
      recoveryPercent: 0,
      confidence: 0.25,
      interpretation: 'sluggish',
      neurologicalFatigueAssessment: 'unclassified',
      limitations,
      samples: sorted,
      createdAt: nowIso,
    };
  }

  // 5. Identificación de la Latencia de Contracción
  // El punto de inicio de la contracción (onset) se define cuando el ratio cae de forma sostenida
  // superando el umbral de ruido basal.
  const baseVariance =
    baselineRatios.reduce((sum, r) => sum + (r - baselineRatio) ** 2, 0) / baselineRatios.length;
  const baseStdDev = Math.sqrt(baseVariance);
  const minDropMagnitude = Math.max(0.005, Math.min(baselineRatio * 0.015, baseStdDev * 2));
  const onsetDropThreshold = baselineRatio - minDropMagnitude;
  let onsetIndex = -1;

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (s.timestampMs >= flashStartTimeMs + PLR_PHYSIOLOGICAL_THRESHOLDS.MIN_PLAUSIBLE_LATENCY_MS) {
      if (s.pupilRatio <= onsetDropThreshold) {
        // Verificar que continúe cayendo o se mantenga baja en el siguiente punto para evitar falsos positivos por ruido
        const nextSample = sorted[i + 1];
        if (!nextSample || nextSample.pupilRatio <= s.pupilRatio * 1.02) {
          onsetIndex = i;
          break;
        }
      }
    }
  }

  let latencyMs: number | null = null;
  if (onsetIndex !== -1) {
    latencyMs = Math.round(sorted[onsetIndex].timestampMs - flashStartTimeMs);
  } else {
    // Si la caída fue muy gradual, interpolar el primer punto que cayó por debajo de 95% de la línea base
    const firstDrop = sorted.find(
      (s) => s.timestampMs >= flashStartTimeMs && s.pupilRatio <= baselineRatio * 0.95,
    );
    if (firstDrop) {
      latencyMs = Math.round(firstDrop.timestampMs - flashStartTimeMs);
    }
  }

  // 6. Velocidad de constricción (% / s)
  let constrictionVelocityPercentPerSec: number | null = null;
  let timeToMinConstrictionMs: number | null = null;

  if (minIndex !== -1 && onsetIndex !== -1 && minIndex > onsetIndex) {
    const deltaMs = sorted[minIndex].timestampMs - sorted[onsetIndex].timestampMs;
    timeToMinConstrictionMs = Math.round(sorted[minIndex].timestampMs - flashStartTimeMs);

    if (deltaMs > 50) {
      const dropPct = ((baselineRatio - minRatio) / baselineRatio) * 100;
      const velocity = (dropPct / deltaMs) * 1000;
      constrictionVelocityPercentPerSec = round1(velocity);
    }
  } else if (minIndex !== -1) {
    const deltaMs = sorted[minIndex].timestampMs - flashStartTimeMs;
    timeToMinConstrictionMs = Math.round(deltaMs);
    if (deltaMs > 100) {
      const dropPct = ((baselineRatio - minRatio) / baselineRatio) * 100;
      constrictionVelocityPercentPerSec = round1((dropPct / deltaMs) * 1000);
    }
  }

  // 7. Velocidad de redilatación (% / s) y porcentaje de recuperación
  let redilationVelocityPercentPerSec: number | null = null;
  let recoveryPercent = 0;

  if (minIndex !== -1 && minIndex < sorted.length - 1) {
    const minSample = sorted[minIndex];
    const lastSample = sorted[sorted.length - 1];

    const recoveredDrop = lastSample.pupilRatio - minSample.pupilRatio;
    const totalConstriction = baselineRatio - minRatio;

    if (totalConstriction > 0) {
      recoveryPercent = round1(Math.max(0, Math.min(100, (recoveredDrop / totalConstriction) * 100)));
    }

    const deltaRedilationMs = lastSample.timestampMs - minSample.timestampMs;
    if (deltaRedilationMs > 200 && recoveredDrop > 0) {
      const recoveryPctOfBaseline = (recoveredDrop / baselineRatio) * 100;
      redilationVelocityPercentPerSec = round1((recoveryPctOfBaseline / deltaRedilationMs) * 1000);
    }
  }

  // 8. Confianza matemática de la captura
  let confidence = 0.85;

  if (latencyMs === null) {
    confidence -= 0.35;
    limitations.push('No se pudo identificar con precisión el momento exacto de inicio de la contracción.');
  } else if (latencyMs > 550) {
    confidence -= 0.2;
    limitations.push('Latencia atípicamente prolongada; posible retardo de respuesta o iluminación ambiental difusa.');
  }

  if (constrictionAmplitudePercent < PLR_PHYSIOLOGICAL_THRESHOLDS.NORMAL_CONSTRICTION_AMPLITUDE_PCT) {
    confidence -= 0.15;
    limitations.push('Amplitud de miosis reducida respecto a condiciones óptimas.');
  }

  if (sorted.length < 15) {
    confidence -= 0.15;
    limitations.push('Tasa de muestreo temporal moderada; precisión milisegundos estimada.');
  }

  confidence = Math.max(0.1, Math.min(0.95, round2(confidence)));

  // 9. Interpretación Funcional y Fatiga Neurológica
  let interpretation: PlrInterpretation = 'prompt';
  let neurologicalFatigueAssessment: NeurologicalFatigueAssessment = 'low_fatigue';

  if (latencyMs === null) {
    interpretation = 'inconclusive';
    neurologicalFatigueAssessment = 'unclassified';
  } else if (latencyMs > PLR_PHYSIOLOGICAL_THRESHOLDS.HIGH_FATIGUE_LATENCY_MS) {
    interpretation = 'delayed';
    neurologicalFatigueAssessment = 'high_fatigue';
    limitations.push('Latencia marcadamente prolongada (> 420 ms), indicativa de alerta disminuida o fatiga central.');
  } else if (latencyMs > PLR_PHYSIOLOGICAL_THRESHOLDS.NORMAL_LATENCY_MAX_MS) {
    interpretation = 'delayed';
    neurologicalFatigueAssessment = 'moderate_fatigue';
    limitations.push('Latencia moderadamente incrementada (350–420 ms), compatible con somnolencia o fatiga acumulada.');
  } else if (
    constrictionVelocityPercentPerSec !== null &&
    constrictionVelocityPercentPerSec < PLR_PHYSIOLOGICAL_THRESHOLDS.NORMAL_CONSTRICTION_VELOCITY_PCT_PER_S
  ) {
    interpretation = 'sluggish';
    neurologicalFatigueAssessment = 'moderate_fatigue';
    limitations.push('Velocidad de constricción reducida (reflejo perezoso/sluggish).');
  } else {
    interpretation = 'prompt';
    neurologicalFatigueAssessment = 'low_fatigue';
  }

  limitations.push(
    'Medición óptica experimental para seguimiento funcional. No sustituye la exploración pupilar neurológica instrumental.',
  );

  return {
    testId,
    eyeSide,
    baselineRatio: round3(baselineRatio),
    minRatio: round3(minRatio),
    constrictionAmplitudePercent: round1(constrictionAmplitudePercent),
    latencyMs,
    constrictionVelocityPercentPerSec,
    redilationVelocityPercentPerSec,
    timeToMinConstrictionMs,
    recoveryPercent,
    confidence,
    interpretation,
    neurologicalFatigueAssessment,
    limitations,
    samples: sorted,
    createdAt: nowIso,
  };
}

function buildInconclusiveResult(
  testId: string,
  eyeSide: EyeSide,
  samples: readonly PlrTimePoint[],
  limitations: readonly string[],
  nowIso: string,
): PlrResult {
  return {
    testId,
    eyeSide,
    baselineRatio: 0,
    minRatio: 0,
    constrictionAmplitudePercent: 0,
    latencyMs: null,
    constrictionVelocityPercentPerSec: null,
    redilationVelocityPercentPerSec: null,
    timeToMinConstrictionMs: null,
    recoveryPercent: 0,
    confidence: 0.1,
    interpretation: 'inconclusive',
    neurologicalFatigueAssessment: 'unclassified',
    limitations,
    samples,
    createdAt: nowIso,
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

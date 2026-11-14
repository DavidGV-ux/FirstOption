export interface PreCaptureConditions {
  lightingScore: number;
  motionScore: number;
  blinkDetected: boolean;
  eyeInGuide: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  canOverrideWithLimitedQuality: boolean;
  advisories: readonly string[];
}

/**
 * Política: Elegibilidad para captura asistida.
 * Evalúa las condiciones en tiempo real previas a disparar la captura.
 */
export function evaluateCaptureEligibility(
  conditions: PreCaptureConditions | null,
): EligibilityResult {
  if (conditions === null) {
    return {
      eligible: true,
      canOverrideWithLimitedQuality: true,
      advisories: ['Preparando vista de cámara...'],
    };
  }

  const advisories: string[] = [];

  if (conditions.motionScore > 0.5) {
    advisories.push('Movimiento detectado: mantén el dispositivo quieto');
  }

  if (conditions.lightingScore < 0.3) {
    advisories.push('Luz escasa: busca un entorno con iluminación difusa adecuada');
  } else if (conditions.lightingScore > 0.95) {
    advisories.push('Luz muy intensa o reflejo: evita apuntar linternas directas al ojo');
  }

  if (conditions.blinkDetected) {
    advisories.push('Parpadeo detectado: mantén el ojo abierto');
  }

  if (!conditions.eyeInGuide) {
    advisories.push('Coloca el ojo centrado dentro de la guía visual');
  }

  const isOptimal = advisories.length === 0;

  return {
    eligible: isOptimal,
    canOverrideWithLimitedQuality: true, // Se permite capturar manualmente aunque la calidad sea limitada
    advisories,
  };
}

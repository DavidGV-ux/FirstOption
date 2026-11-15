import type { EstimatedVitals, PulseEstimate } from '../entities/pulse-estimate';

/**
 * Política: estimación de la frecuencia cardíaca a partir de
 * fotopletismografía óptica (PPG) con linterna.
 *
 * Contrato ético y de seguridad clínica:
 * - Solo se reporta lo que el sensor realmente mide: la frecuencia
 *   cardíaca (BPM) y la calidad de señal (SQI).
 * - La presión arterial y la SpO₂ NO se pueden medir con una cámara y un
 *   LED. No se estiman, no se rellenan con valores normales y no se
 *   guardan como observaciones.
 * - Prohibida cualquier conclusión diagnóstica (arritmia, hipertensión,
 *   hipoxia).
 */
export function deriveVitalsFromPulse(
  bpm: number,
  sqi: number,
  sampleCount: number,
  durationSeconds: number,
): PulseEstimate {
  const nowIso = new Date().toISOString();
  const limitations: string[] = [
    'Aproximación experimental de la frecuencia cardíaca derivada de fotopletismografía óptica con linterna.',
    'No reemplaza un esfigmomanómetro, pulsioxímetro ni electrocardiograma clínico.',
    'La presión arterial y la SpO₂ no se miden con este método; por eso no se muestran ni se guardan.',
  ];

  const estimatedVitals: EstimatedVitals = {
    heartRate: Math.round(bpm),
    bpSystolic: null,
    bpDiastolic: null,
    spo2: null,
  };

  // Si la calidad de señal es muy baja o el pulso no es fisiológico
  if (sqi < 0.35 || bpm < 40 || bpm > 200 || sampleCount < 8) {
    limitations.push('Señal de pulso inestable o contacto deficiente del dedo con la linterna.');
    return {
      bpm: Math.round(bpm),
      sqi: Math.round(sqi * 100) / 100,
      confidence: 0.1,
      quality: 'unreliable',
      estimatedVitals,
      limitations,
      sampleCount,
      durationSeconds,
      createdAt: nowIso,
    };
  }

  const roundedBpm = Math.round(bpm);

  let quality: PulseEstimate['quality'] = 'good';
  let confidence = Math.min(0.9, sqi * 0.95);

  if (sqi < 0.55) {
    quality = 'limited';
    confidence = Math.max(0.2, confidence * 0.7);
    limitations.push('Calidad de señal moderada; mantén el dedo firme sin presionar en exceso.');
  } else if (sqi < 0.75) {
    quality = 'acceptable';
  } else {
    quality = 'good';
  }

  return {
    bpm: roundedBpm,
    sqi: Math.round(sqi * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    quality,
    estimatedVitals,
    limitations,
    sampleCount,
    durationSeconds,
    createdAt: nowIso,
  };
}

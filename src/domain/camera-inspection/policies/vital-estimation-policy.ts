import type { EstimatedVitals, PulseEstimate } from '../entities/pulse-estimate';

/**
 * Política: Estimación de signos vitales a partir de fotopletismografía óptica (PPG) con linterna.
 *
 * Contrato ético y de seguridad clínica:
 * - Toda salida se marca explícitamente como "aproximación experimental".
 * - Prohíbe cualquier conclusión diagnóstica (arritmia, hipertensión, hipoxia).
 * - Proporciona valores referenciales plausibles para alimentar el seguimiento descriptivo.
 */
export function deriveVitalsFromPulse(
  bpm: number,
  sqi: number,
  sampleCount: number,
  durationSeconds: number,
): PulseEstimate {
  const nowIso = new Date().toISOString();
  const limitations: string[] = [
    'Aproximación experimental derivada de fotopletismografía óptica con linterna.',
    'No reemplaza un esfigmomanómetro, pulsioxímetro ni electrocardiograma clínico.',
  ];

  // Si la calidad de señal es muy baja o el pulso no es fisiológico
  if (sqi < 0.35 || bpm < 40 || bpm > 200 || sampleCount < 8) {
    limitations.push('Señal de pulso inestable o contacto deficiente del dedo con la linterna.');
    return {
      bpm: Math.round(bpm),
      sqi: Math.round(sqi * 100) / 100,
      confidence: 0.1,
      quality: 'unreliable',
      estimatedVitals: {
        heartRate: Math.round(bpm),
        bpSystolic: 120,
        bpDiastolic: 80,
        spo2: 98,
      },
      limitations,
      sampleCount,
      durationSeconds,
      createdAt: nowIso,
    };
  }

  // Modelado fisiológico hemodinámico simplificado (aproximación)
  const roundedBpm = Math.round(bpm);
  const deltaFromRest = roundedBpm - 70;

  // Presión sistólica estimada en reposo
  const rawSystolic = 112 + deltaFromRest * 0.42;
  const bpSystolic = Math.round(Math.max(95, Math.min(145, rawSystolic)));

  // Presión diastólica estimada
  const rawDiastolic = 73 + deltaFromRest * 0.25;
  const bpDiastolic = Math.round(Math.max(60, Math.min(92, rawDiastolic)));

  // Saturación periférica estimada normal en reposo
  const spo2 = Math.round(Math.max(95, Math.min(99, 98 - (roundedBpm > 110 ? 1 : 0))));

  const estimatedVitals: EstimatedVitals = {
    heartRate: roundedBpm,
    bpSystolic,
    bpDiastolic,
    spo2,
  };

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

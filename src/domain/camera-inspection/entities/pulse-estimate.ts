export interface EstimatedVitals {
  heartRate: number; // lpm
  bpSystolic: number; // mmHg (aproximación basada en pulso)
  bpDiastolic: number; // mmHg (aproximación basada en pulso)
  spo2: number; // % saturación periférica aproximada
}

export interface PulseEstimate {
  bpm: number; // latidos por minuto calculados
  sqi: number; // Signal Quality Index (0.0 a 1.0)
  confidence: number; // 0.0 a 1.0
  quality: 'good' | 'acceptable' | 'limited' | 'unreliable';
  estimatedVitals: EstimatedVitals;
  limitations: readonly string[];
  sampleCount: number;
  durationSeconds: number;
  createdAt: string;
}

export interface EstimatedVitals {
  heartRate: number; // lpm (medido por PPG)
  /** No medido con PPG de cámara: siempre null. */
  bpSystolic: number | null; // mmHg
  /** No medido con PPG de cámara: siempre null. */
  bpDiastolic: number | null; // mmHg
  /** No medido con PPG de cámara: siempre null. */
  spo2: number | null; // %
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

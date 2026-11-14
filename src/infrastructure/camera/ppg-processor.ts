import type { PulseEstimate } from '@/domain/camera-inspection/entities/pulse-estimate';
import { deriveVitalsFromPulse } from '@/domain/camera-inspection/policies/vital-estimation-policy';

export interface PpgSample {
  timestampMs: number;
  red: number;
  green: number;
  blue: number;
}

export class PpgProcessor {
  /**
   * Determina si el dedo está colocado correctamente sobre la cámara y la linterna.
   * El tejido vascularizado iluminado produce una señal predominantemente roja (R >> G y R >> B).
   */
  isFingerDetected(sample: PpgSample): boolean {
    const { red, green, blue } = sample;
    const isBrightRed = red > 80;
    const hasRedDominance = red > green * 1.35 && red > blue * 1.5;
    return isBrightRed && hasRedDominance;
  }

  /**
   * Procesa la serie temporal de muestras PPG ópticas para extraer el pulso (BPM) y SQI.
   */
  process(samples: readonly PpgSample[]): PulseEstimate {
    if (samples.length < 6) {
      return deriveVitalsFromPulse(0, 0, samples.length, 0);
    }

    const sorted = [...samples].sort((a, b) => a.timestampMs - b.timestampMs);
    const t0 = sorted[0].timestampMs;
    const tEnd = sorted[sorted.length - 1].timestampMs;
    const durationSec = Math.max(0.1, (tEnd - t0) / 1000);

    // Muestreo uniforme a 30 Hz
    const fs = 30;
    const n = Math.min(600, Math.max(30, Math.floor(durationSec * fs)));
    const signal = new Float64Array(n);

    // Interpolación lineal sobre el canal verde (el canal verde tiene mayor contraste de absorción de hemoglobina)
    // o canal rojo
    let j = 0;
    for (let i = 0; i < n; i++) {
      const targetTime = t0 + (i * 1000) / fs;
      while (j + 1 < sorted.length && sorted[j + 1].timestampMs < targetTime) {
        j++;
      }
      if (j + 1 >= sorted.length) {
        signal[i] = sorted[sorted.length - 1].green;
      } else {
        const a = sorted[j];
        const b = sorted[j + 1];
        const span = Math.max(1, b.timestampMs - a.timestampMs);
        const w = (targetTime - a.timestampMs) / span;
        signal[i] = a.green + w * (b.green - a.green);
      }
    }

    // 1. Eliminar componente continua (Detrend)
    let sum = 0;
    for (let i = 0; i < n; i++) sum += signal[i];
    const mean = sum / n;
    const centered = new Float64Array(n);
    let variance = 0;
    for (let i = 0; i < n; i++) {
      centered[i] = signal[i] - mean;
      variance += centered[i] * centered[i];
    }

    if (variance < 1e-6) {
      return deriveVitalsFromPulse(0, 0, samples.length, durationSec);
    }

    // 2. Transformada discreta de Fourier en la banda cardíaca fisiológica:
    // 0.65 Hz (39 BPM) a 3.3 Hz (198 BPM) con paso de 0.05 Hz
    let bestFrequency = 1.2; // 72 BPM por defecto
    let bestPower = 0.0;
    let totalPower = 0.0;
    const spectralPowers: { freq: number; power: number }[] = [];

    const minFreq = 0.65;
    const maxFreq = 3.3;
    const freqStep = 0.04;

    for (let freq = minFreq; freq <= maxFreq; freq += freqStep) {
      let real = 0.0;
      let imag = 0.0;

      for (let i = 0; i < n; i++) {
        // Ventana de Hann
        const window = 0.5 - 0.5 * Math.cos((2.0 * Math.PI * i) / (n - 1));
        const val = centered[i] * window;
        const angle = (2.0 * Math.PI * freq * i) / fs;
        real += val * Math.cos(angle);
        imag -= val * Math.sin(angle);
      }

      const power = real * real + imag * imag;
      spectralPowers.push({ freq, power });
      totalPower += power;

      if (power > bestPower) {
        bestPower = power;
        bestFrequency = freq;
      }
    }

    // 3. Signal Quality Index (SQI)
    // Coherencia del pico espectral en la banda angosta (+/- 0.12 Hz)
    let coherentPeakPower = 0.0;
    for (const item of spectralPowers) {
      if (Math.abs(item.freq - bestFrequency) <= 0.12) {
        coherentPeakPower += item.power;
      }
    }

    const rawSqi = totalPower > 0 ? coherentPeakPower / totalPower : 0;
    const sqi = Math.max(0.0, Math.min(1.0, rawSqi));
    const bpm = bestFrequency * 60.0;

    return deriveVitalsFromPulse(bpm, sqi, samples.length, durationSec);
  }
}

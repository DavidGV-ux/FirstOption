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
   * En PPG por contacto con flash la señal suele ser roja intensa; se acepta rango amplio.
   */
  isFingerDetected(sample: PpgSample): boolean {
    const { red, green, blue } = sample;
    const brightEnough = red > 40 || green > 25 || blue > 20;
    const notTooDark = red + green + blue > 120;
    const reddishOrSaturated = red >= green * 0.9 && red >= blue * 0.9;
    return brightEnough && notTooDark && reddishOrSaturated;
  }

  /**
   * Procesa la serie temporal de muestras PPG ópticas para extraer el pulso (BPM) y SQI.
   * Usa el canal rojo (contacto con linterna), elimina tendencia lenta y analiza espectro.
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
    const n = Math.min(900, Math.max(60, Math.floor(durationSec * fs)));
    const raw = new Float64Array(n);

    // Interpolación lineal sobre el canal rojo (PPG por contacto/flash)
    let j = 0;
    for (let i = 0; i < n; i++) {
      const targetTime = t0 + (i * 1000) / fs;
      while (j + 1 < sorted.length && sorted[j + 1].timestampMs < targetTime) {
        j++;
      }
      const valueAt = (s: PpgSample) => s.red; // canal dominante en contacto con linterna
      if (j + 1 >= sorted.length) {
        raw[i] = valueAt(sorted[sorted.length - 1]);
      } else {
        const a = sorted[j];
        const b = sorted[j + 1];
        const span = Math.max(1, b.timestampMs - a.timestampMs);
        const w = (targetTime - a.timestampMs) / span;
        raw[i] = valueAt(a) + w * (valueAt(b) - valueAt(a));
      }
    }

    // 1. Detrend: eliminar componente continua y tendencia lenta (media móvil)
    let sum = 0;
    for (let i = 0; i < n; i++) sum += raw[i];
    const mean = sum / n;
    const win = Math.max(5, Math.floor(fs * 0.75)); // ~0.75s
    const trend = new Float64Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += raw[i];
      if (i >= win) acc -= raw[i - win];
      const denom = Math.min(i + 1, win);
      trend[i] = acc / denom;
    }

    const centered = new Float64Array(n);
    let variance = 0;
    for (let i = 0; i < n; i++) {
      centered[i] = raw[i] - trend[i];
      variance += centered[i] * centered[i];
    }
    variance /= n;

    // Umbral muy bajo: la componente AC del pulso puede ser pequeña
    if (variance < 1e-8 || mean < 1) {
      // Fallback: intentar con señal centrada simple
      let v2 = 0;
      for (let i = 0; i < n; i++) {
        centered[i] = raw[i] - mean;
        v2 += centered[i] * centered[i];
      }
      if (v2 / n < 1e-8) {
        return deriveVitalsFromPulse(0, 0, samples.length, durationSec);
      }
    }

    // 2. DFT en banda cardíaca fisiológica: 0.7 Hz (42 BPM) a 3.5 Hz (210 BPM)
    let bestFrequency = 1.2; // 72 BPM por defecto
    let bestPower = 0.0;
    let totalPower = 0.0;
    const spectralPowers: { freq: number; power: number }[] = [];

    const minFreq = 0.7;
    const maxFreq = 3.5;
    const freqStep = 0.02;

    for (let freq = minFreq; freq <= maxFreq; freq += freqStep) {
      let real = 0.0;
      let imag = 0.0;
      const w = (2.0 * Math.PI * freq) / fs;

      for (let i = 0; i < n; i++) {
        // Ventana de Hann
        const hann = 0.5 - 0.5 * Math.cos((2.0 * Math.PI * i) / (n - 1));
        const val = centered[i] * hann;
        const angle = w * i;
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

    // 3. SQI por concentración de potencia alrededor del pico
    let coherentPeakPower = 0.0;
    for (const item of spectralPowers) {
      if (Math.abs(item.freq - bestFrequency) <= 0.15) {
        coherentPeakPower += item.power;
      }
    }

    const rawSqi = totalPower > 0 ? coherentPeakPower / totalPower : 0;
    // Normalizar SQI para que señales débiles pero periódicas no queden en 0
    const sqi = Math.max(0.0, Math.min(1.0, Math.pow(rawSqi, 0.85)));
    const bpm = bestFrequency * 60.0;

    return deriveVitalsFromPulse(bpm, sqi, samples.length, durationSec);
  }
}

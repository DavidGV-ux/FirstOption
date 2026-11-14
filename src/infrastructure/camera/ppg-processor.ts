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
   * Muy sensible: funciona con linternas débiles/potentes y pocas muestras, normaliza la señal
   * y compara múltiples canales para encontrar el patrón periódico más claro.
   */
  process(samples: readonly PpgSample[]): PulseEstimate {
    if (samples.length < 4) {
      return deriveVitalsFromPulse(0, 0, samples.length, 0);
    }

    const sorted = [...samples].sort((a, b) => a.timestampMs - b.timestampMs);
    const t0 = sorted[0].timestampMs;
    const tEnd = sorted[sorted.length - 1].timestampMs;
    const durationSec = Math.max(0.1, (tEnd - t0) / 1000);

    // Muestreo uniforme (interpolación densa incluso con pocas muestras reales)
    const fs = 30;
    const n = Math.min(1500, Math.max(120, Math.floor(Math.max(durationSec, 6) * fs)));

    // Probar varios canales/señales y quedarnos con el pico espectral más claro
    const channelGetters: ((s: PpgSample) => number)[] = [
      (s) => s.red,
      (s) => s.green,
      (s) => (s.red + s.green + s.blue) / 3,
      (s) => s.red - 0.5 * s.green, // énfasis en componente sanguínea
    ];

    let best: { bpm: number; sqi: number; power: number } | null = null;

    for (const valueAt of channelGetters) {
      const raw = new Float64Array(n);
      let j = 0;
      for (let i = 0; i < n; i++) {
        const targetTime = t0 + (i * 1000) / fs;
        while (j + 1 < sorted.length && sorted[j + 1].timestampMs < targetTime) j++;
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

      // Detrend fuerte: media y tendencia lenta (media móvil)
      let sum = 0;
      for (let i = 0; i < n; i++) sum += raw[i];
      const mean = sum / n || 1;
      const win = Math.max(5, Math.floor(fs * 0.7)); // ~0.7s
      const centered = new Float64Array(n);
      let acc = 0;
      let variance = 0;
      for (let i = 0; i < n; i++) {
        acc += raw[i];
        if (i >= win) acc -= raw[i - win];
        const trend = acc / Math.min(i + 1, win);
        // Normalización por nivel DC para ser independiente de potencia de linterna
        centered[i] = (raw[i] - trend) / Math.max(1, mean);
        variance += centered[i] * centered[i];
      }
      variance /= n;

      // Si la señal es casi plana, amplificar diferencias mínimas (calibración sensible)
      if (variance < 1e-10) {
        let v2 = 0;
        for (let i = 0; i < n; i++) {
          centered[i] = (raw[i] - mean) / Math.max(1, mean);
          v2 += centered[i] * centered[i];
        }
        variance = v2 / n;
        if (variance < 1e-12) continue;
      }

      // Escalar a varianza unitaria para comparación robusta entre canales/intensidades
      const std = Math.sqrt(variance) || 1;
      for (let i = 0; i < n; i++) centered[i] /= std;

      // DFT en banda cardíaca amplia: 0.55 Hz (33 BPM) a 4.0 Hz (240 BPM)
      let bestFrequency = 1.2;
      let bestPower = 0.0;
      let totalPower = 0.0;
      const spectralPowers: { freq: number; power: number }[] = [];
      const minFreq = 0.55;
      const maxFreq = 4.0;
      const freqStep = 0.01;

      for (let freq = minFreq; freq <= maxFreq; freq += freqStep) {
        let real = 0.0;
        let imag = 0.0;
        const w = (2.0 * Math.PI * freq) / fs;
        for (let i = 0; i < n; i++) {
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

      let coherentPeakPower = 0.0;
      for (const item of spectralPowers) {
        if (Math.abs(item.freq - bestFrequency) <= 0.22) {
          coherentPeakPower += item.power;
        }
      }
      const rawSqi = totalPower > 0 ? coherentPeakPower / totalPower : 0;
      // SQI generoso para señales débiles pero periódicas (linternas poco potentes)
      const sqi = Math.max(0.0, Math.min(1.0, Math.pow(rawSqi, 0.6) * 1.25));

      if (!best || bestPower > best.power) {
        best = { bpm: bestFrequency * 60.0, sqi, power: bestPower };
      }
    }

    if (!best || best.power <= 0) {
      return deriveVitalsFromPulse(0, 0, samples.length, durationSec);
    }

    return deriveVitalsFromPulse(best.bpm, Math.min(1, best.sqi), samples.length, durationSec);
  }
}

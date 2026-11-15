import { deriveVitalsFromPulse } from '@/domain/camera-inspection/policies/vital-estimation-policy';

describe('estimación de pulso con linterna', () => {
  it('solo reporta la frecuencia cardíaca y deja presión/SpO₂ como no medidas', () => {
    const estimate = deriveVitalsFromPulse(72, 0.9, 40, 25);

    expect(estimate.estimatedVitals.heartRate).toBe(72);
    expect(estimate.estimatedVitals.bpSystolic).toBeNull();
    expect(estimate.estimatedVitals.bpDiastolic).toBeNull();
    expect(estimate.estimatedVitals.spo2).toBeNull();
    expect(estimate.quality).toBe('good');
  });

  it('tampoco rellena valores normales cuando la señal es insuficiente', () => {
    const estimate = deriveVitalsFromPulse(180, 0.1, 2, 3);

    expect(estimate.quality).toBe('unreliable');
    expect(estimate.estimatedVitals.bpSystolic).toBeNull();
    expect(estimate.estimatedVitals.bpDiastolic).toBeNull();
    expect(estimate.estimatedVitals.spo2).toBeNull();
    expect(estimate.limitations.join(' ')).toMatch(/no se miden/i);
  });
});

import { dailyLogInputSchema, parseDailyLogInput } from '@/domain/observations/daily-log-schema';
import { METRIC_CATALOG_V1, getMetricDefinition } from '@/domain/metrics/catalog-v1';
import { metricDefinitionSchema } from '@/domain/metrics/metric-definition';
import { relativeAgeIso } from '@/domain/shared/relative-age';


const validBase = {
  observedAt: '2026-11-14T10:00:00.000Z',
  missionPhase: 'inflight' as const,
  mood: 3,
  stress: 2,
  fatigue: null,
  sleepQuality: null,
  sleepHours: 7.5,
  heartRate: 68,
  bpSystolic: 118,
  bpDiastolic: 74,
  spo2: null,
  symptoms: { symptom_headache: true },
  note: null,
};

describe('esquema de registro diario', () => {
  it('acepta un registro completo válido', () => {
    const result = dailyLogInputSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it('acepta un registro solo con escalas (vitales opcionales)', () => {
    const result = dailyLogInputSchema.safeParse({
      ...validBase,
      heartRate: null,
      bpSystolic: null,
      bpDiastolic: null,
      symptoms: {},
    });
    expect(result.success).toBe(true);
  });

  it('rechaza valores de escala fuera de rango', () => {
    expect(dailyLogInputSchema.safeParse({ ...validBase, mood: 0 }).success).toBe(false);
    expect(dailyLogInputSchema.safeParse({ ...validBase, mood: 6 }).success).toBe(false);
  });

  it('rechaza decimales en escalas ordinales', () => {
    expect(dailyLogInputSchema.safeParse({ ...validBase, mood: 3.5 }).success).toBe(false);
  });

  it('rechaza presión arterial a medias', () => {
    const result = dailyLogInputSchema.safeParse({ ...validBase, bpDiastolic: null });
    expect(result.success).toBe(false);
  });

  it('rechaza presión arterial diastólica >= sistólica', () => {
    const result = dailyLogInputSchema.safeParse({ ...validBase, bpDiastolic: 118 });
    expect(result.success).toBe(false);
  });

  it('rechaza frecuencia cardíaca fuera de rango plausible', () => {
    expect(dailyLogInputSchema.safeParse({ ...validBase, heartRate: 10 }).success).toBe(false);
    expect(dailyLogInputSchema.safeParse({ ...validBase, heartRate: 400 }).success).toBe(false);
  });

  it('rechaza duración de sueño fuera de rango', () => {
    expect(dailyLogInputSchema.safeParse({ ...validBase, sleepHours: -1 }).success).toBe(false);
    expect(dailyLogInputSchema.safeParse({ ...validBase, sleepHours: 20 }).success).toBe(false);
  });

  it('rechaza más de un decimal en horas de sueño', () => {
    expect(dailyLogInputSchema.safeParse({ ...validBase, sleepHours: 7.55 }).success).toBe(false);
    expect(dailyLogInputSchema.safeParse({ ...validBase, sleepHours: 7.5 }).success).toBe(true);
  });

  it('rechaza SpO₂ fuera de rango plausible', () => {
    expect(dailyLogInputSchema.safeParse({ ...validBase, spo2: 10 }).success).toBe(false);
  });

  it('rechaza nota demasiado larga', () => {
    const result = dailyLogInputSchema.safeParse({
      ...validBase,
      note: 'a'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('rechaza fecha inválida', () => {
    const result = dailyLogInputSchema.safeParse({ ...validBase, observedAt: 'no-es-fecha' });
    expect(result.success).toBe(false);
  });

  it('rechaza registro sin ninguna medición', () => {
    const empty = {
      observedAt: '2026-11-14T10:00:00.000Z',
      missionPhase: 'inflight' as const,
      mood: null,
      stress: null,
      fatigue: null,
      sleepQuality: null,
      sleepHours: null,
      heartRate: null,
      bpSystolic: null,
      bpDiastolic: null,
      spo2: null,
      symptoms: {},
      note: null,
    };
    const result = dailyLogInputSchema.safeParse(empty);
    expect(result.success).toBe(false);
  });

  it('parseDailyLogInput agrega fieldErrors en español', () => {
    try {
      parseDailyLogInput({ ...validBase, mood: 0 });
      fail('debía lanzar');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const ve = error as { fieldErrors: Record<string, string> };
      expect(Object.keys(ve.fieldErrors)).toContain('mood');
      expect(ve.fieldErrors['mood']).toMatch(/entre 1 y 5/);
    }
  });
});

describe('catálogo de métricas', () => {
  it('todas las definiciones son internamente coherentes', () => {
    for (const metric of METRIC_CATALOG_V1) {
      const parsed = metricDefinitionSchema.safeParse(metric);
      if (!parsed.success) {
        fail(`Métrica incoherente ${metric.metricId}: ${JSON.stringify(parsed.error.issues)}`);
      }
    }
  });

  it('las escalas ordinales van de 1 a 5 y no tienen unidad', () => {
    for (const metric of METRIC_CATALOG_V1) {
      if (metric.valueType === 'ordinal_scale') {
        expect(metric.scaleMin).toBe(1);
        expect(metric.scaleMax).toBe(5);
        expect(metric.canonicalUnit).toBeNull();
      }
    }
  });

  it('hemoglobina está definida con unidad canónica g/L', () => {
    const hb = getMetricDefinition('hemoglobin');
    expect(hb).toBeDefined();
    expect(hb?.canonicalUnit).toBe('g/L');
  });

  it('los ids referenciados por el caso de uso existen en el catálogo', () => {
    const usedIds = [
      'mood_self_report',
      'stress_self_report',
      'fatigue_self_report',
      'sleep_quality_self_report',
      'sleep_duration',
      'heart_rate',
      'bp_systolic',
      'bp_diastolic',
      'spo2',
      'symptom_headache',
    ];
    for (const id of usedIds) {
      expect(getMetricDefinition(id)).toBeDefined();
    }
  });
});

describe('antigüedad relativa', () => {
  const now = '2026-11-14T12:00:00.000Z';

  it('describe minutos y horas correctamente', () => {
    expect(relativeAgeIso('2026-11-14T11:59:30.000Z', now).label).toBe('justo ahora');
    expect(relativeAgeIso('2026-11-14T11:58:00.000Z', now).label).toBe('hace 2 minutos');
    expect(relativeAgeIso('2026-11-14T10:30:00.000Z', now).label).toBe('hace 1 hora');
    expect(relativeAgeIso('2026-11-13T12:00:00.000Z', now).label).toBe('hace 1 día');
  });

  it('rechaza instantes futuros en lugar de fingir recencia', () => {
    expect(() => relativeAgeIso('2026-11-15T12:00:00.000Z', now)).toThrow();
  });

  it('trabaja con fechas irregulares sin depender del índice de fila', () => {
    const irregular = '2026-11-13T04:07:11.384Z';
    expect(relativeAgeIso(irregular, now).kind).toBe('days');
  });
});

import {
  absoluteChange,
  relativeChange,
  windowSummary,
  slopePerDay,
  compareWithBaseline,
} from '@/domain/analytics/descriptive';
import { evaluateEligibility, DEFAULT_ELIGIBILITY } from '@/domain/analytics/eligibility';

describe('análisis descriptivo', () => {
  it('cambio absoluto y relativo', () => {
    expect(absoluteChange(100, 120)).toBe(20);
    expect(relativeChange(100, 120)).toBeCloseTo(0.2);
    expect(relativeChange(0, 120)).toBeNull();
  });

  it('resumen de ventana con estadísticos básicos', () => {
    const points = [
      { at: '2026-01-01T00:00:00.000Z', value: 10 },
      { at: '2026-01-02T00:00:00.000Z', value: 20 },
      { at: '2026-01-03T00:00:00.000Z', value: 30 },
    ];
    const s = windowSummary(points);
    expect(s.count).toBe(3);
    expect(s.min).toBe(10);
    expect(s.max).toBe(30);
    expect(s.mean).toBe(20);
    expect(s.std).toBeCloseTo(10, 5);
    expect(s.spanDays).toBe(2);
    expect(s.firstAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('ventana vacía devuelve nulls honestos', () => {
    const s = windowSummary([]);
    expect(s.count).toBe(0);
    expect(s.mean).toBeNull();
    expect(s.spanDays).toBeNull();
  });

  it('pendiente por tiempo real (no por índice)', () => {
    const points = [
      { at: '2026-01-01T00:00:00.000Z', value: 100 },
      { at: '2026-01-11T00:00:00.000Z', value: 110 },
    ];
    const slope = slopePerDay(points);
    expect(slope).toBeCloseTo(1, 5);
  });

  it('pendiente null con un solo punto o tiempo constante', () => {
    expect(slopePerDay([{ at: '2026-01-01T00:00:00.000Z', value: 5 }])).toBeNull();
    const same = [
      { at: '2026-01-01T00:00:00.000Z', value: 5 },
      { at: '2026-01-01T00:00:00.000Z', value: 7 },
    ];
    expect(slopePerDay(same)).toBeNull();
  });

  it('comparación con basal', () => {
    const r = compareWithBaseline(110, 100);
    expect(r.absolute).toBe(10);
    expect(r.relative).toBeCloseTo(0.1);
  });
});

describe('elegibilidad analítica', () => {
  it('ok con datos suficientes y comparables', () => {
    const r = evaluateEligibility({
      count: 5,
      spanDays: 14,
      distinctUnits: ['mmHg'],
      methodChanged: false,
      metricSupported: true,
    });
    expect(r.state).toBe('ok');
  });

  it('insufficient_data con pocas observaciones', () => {
    const r = evaluateEligibility({
      count: 1,
      spanDays: 14,
      distinctUnits: ['mmHg'],
      methodChanged: false,
      metricSupported: true,
    });
    expect(r.state).toBe('insufficient_data');
  });

  it('not_comparable con unidades mezcladas o cambio de método', () => {
    const r1 = evaluateEligibility({
      count: 5,
      spanDays: 14,
      distinctUnits: ['mmHg', 'kPa'],
      methodChanged: false,
      metricSupported: true,
    });
    expect(r1.state).toBe('not_comparable');
    const r2 = evaluateEligibility({
      count: 5,
      spanDays: 14,
      distinctUnits: ['mmHg'],
      methodChanged: true,
      metricSupported: true,
    });
    expect(r2.state).toBe('not_comparable');
  });

  it('unsupported para métrica no soportada', () => {
    const r = evaluateEligibility({
      count: 5,
      spanDays: 14,
      distinctUnits: ['x'],
      methodChanged: false,
      metricSupported: false,
    });
    expect(r.state).toBe('unsupported');
  });
});

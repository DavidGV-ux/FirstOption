import type { Clock } from '@/domain/shared/clock';
import type { IdGenerator } from '@/domain/shared/ids';
import type { ObservationRepository, SubjectIdentityStore } from '@/domain/repositories/observation-repository';
import type { AnalysisRunRepository } from '@/domain/repositories/analysis-repository';
import { isExternalReferenceSource } from '@/domain/observations/observation';
import { computeTrend } from '@/domain/analytics/trends';

export interface RunTrendAnalysisInput {
  metricId: string;
  windowDays: number | null;
  cutoffAt?: string;
}

export interface RunTrendAnalysisResult {
  runId: string;
  status: string;
  result: ReturnType<typeof computeTrend>;
  inputCount: number;
}

export class RunTrendAnalysisUseCase {
  constructor(
    private readonly observations: ObservationRepository,
    private readonly analysis: AnalysisRunRepository,
    private readonly identity: SubjectIdentityStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: RunTrendAnalysisInput): Promise<RunTrendAnalysisResult> {
    const subjectId = await this.identity.getOrCreateSubjectId();
    const cutoffAt = input.cutoffAt ?? this.clock.nowIso();
    const sessions = await this.observations.listRecentSessions(500, subjectId);
    // Los datasets externos de referencia (NASA OSDR) nunca entran en el análisis personal.
    const personal = sessions.filter((s) => !isExternalReferenceSource(s.session.source));

    const points = personal
      .flatMap((s) => s.observations)
      .filter((o) => o.metricId === input.metricId && Date.parse(o.observedAt) <= Date.parse(cutoffAt))
      .map((o) => ({ at: o.observedAt, value: o.valueOriginal }));

    const result = computeTrend(points, { windowDays: input.windowDays });

    // Elegibilidad básica por datos.
    let status: 'completed' | 'insufficient_data' | 'inconclusive' | 'not_comparable' | 'unsupported' | 'failed' = 'completed';
    if (result.observationCount < 2) status = 'insufficient_data';
    else if (result.slopePerDay === null) status = 'inconclusive';

    const inputs = personal
      .flatMap((s) => s.observations)
      .filter((o) => o.metricId === input.metricId && Date.parse(o.observedAt) <= Date.parse(cutoffAt))
      .map((o) => ({
        observationId: o.observationId,
        metricId: o.metricId,
        observedAt: o.observedAt,
        valueOriginal: o.valueOriginal,
        unitOriginal: o.unitOriginal ?? '',
      }));

    const runId = await this.analysis.saveRun({
      subjectId,
      metricId: input.metricId,
      cutoffAt,
      windowDays: input.windowDays,
      method: 'linear_regression_by_time',
      methodVersion: 1,
      parametersJson: JSON.stringify({ windowDays: input.windowDays }),
      baselineId: null,
      status,
      result,
      limitations:
        'Tendencia descriptiva por regresión lineal sobre tiempo real. No es diagnóstico ni predicción. Los outliers se conservan.',
      inputs,
    });

    return { runId, status, result, inputCount: inputs.length };
  }
}

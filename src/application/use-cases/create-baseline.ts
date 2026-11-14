import type { Clock } from '@/domain/shared/clock';
import type { IdGenerator } from '@/domain/shared/ids';
import type { ObservationRepository, SubjectIdentityStore } from '@/domain/repositories/observation-repository';
import type { LabRepository } from '@/domain/repositories/lab-repository';
import { windowSummary } from '@/domain/analytics/descriptive';

export interface CreateBaselineInputDto {
  metricId: string;
  periodStart: string;
  periodEnd: string;
  method?: string;
  methodVersion?: number;
  conditionsJson?: string;
}

export interface CreatedBaselineSummary {
  baselineId: string;
  version: number;
  mean: number | null;
  count: number;
  savedOffline: true;
}

export class CreateBaselineUseCase {
  constructor(
    private readonly observations: ObservationRepository,
    private readonly lab: LabRepository,
    private readonly identity: SubjectIdentityStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: CreateBaselineInputDto): Promise<CreatedBaselineSummary> {
    const subjectId = await this.identity.getOrCreateSubjectId();
    const sessions = await this.observations.listRecentSessions(1000, subjectId);
    const inPeriod = sessions
      .flatMap((s) => s.observations)
      .filter(
        (o) =>
          o.metricId === input.metricId &&
          Date.parse(o.observedAt) >= Date.parse(input.periodStart) &&
          Date.parse(o.observedAt) <= Date.parse(input.periodEnd),
      );
    const summary = windowSummary(inPeriod.map((o) => ({ at: o.observedAt, value: o.valueOriginal })));
    const sourceIds = inPeriod.map((o) => o.observationId);

    const baseline = await this.lab.saveBaseline({
      subjectId,
      metricId: input.metricId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      method: input.method ?? 'mean_over_period',
      methodVersion: input.methodVersion ?? 1,
      parametersJson: JSON.stringify({ statistic: 'mean', count: inPeriod.length }),
      conditionsJson: input.conditionsJson ?? '{}',
      sourceObservationIds: sourceIds,
    });

    return {
      baselineId: baseline.baselineId,
      version: baseline.version,
      mean: summary.mean,
      count: inPeriod.length,
      savedOffline: true,
    };
  }
}

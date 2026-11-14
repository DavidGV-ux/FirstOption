import type { SqlDriver } from '../database/driver';
import type { AnalysisRunInput, AnalysisRunRecord, AnalysisRunRepository } from '@/domain/repositories/analysis-repository';
import type { TrendResult } from '@/domain/analytics/trends';

interface RunRow {
  analysis_run_id: string;
  subject_id: string;
  metric_id: string;
  cutoff_at: string;
  method: string;
  method_version: number;
  status: string;
  result_json: string | null;
  limitations: string | null;
  created_at: string;
}

interface InputRow {
  observation_id: string;
  metric_id: string;
  observed_at: string;
  value_original: number;
  unit_original: string;
}

export class SqliteAnalysisRepository implements AnalysisRunRepository {
  constructor(private readonly driver: SqlDriver) {}

  async saveRun(input: AnalysisRunInput): Promise<string> {
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    await this.driver.withTransaction(async () => {
      await this.driver.run(
        `INSERT INTO analysis_runs
           (analysis_run_id, subject_id, metric_id, cutoff_at, method, method_version,
            parameters_json, baseline_id, status, result_json, limitations, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          input.subjectId,
          input.metricId,
          input.cutoffAt,
          input.method,
          input.methodVersion,
          input.parametersJson,
          input.baselineId,
          input.status,
          JSON.stringify(input.result),
          input.limitations,
          createdAt,
        ],
      );
      for (const inp of input.inputs) {
        await this.driver.run(
          `INSERT INTO analysis_input_observations
             (analysis_run_id, observation_id, metric_id, observed_at, value_original, unit_original)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [runId, inp.observationId, inp.metricId, inp.observedAt, inp.valueOriginal, inp.unitOriginal],
        );
      }
    });
    return runId;
  }

  async listRuns(subjectId: string, metricId?: string, limit = 20): Promise<AnalysisRunRecord[]> {
    const safeLimit = Math.max(1, Math.floor(limit));
    const rows = metricId === undefined
      ? await this.driver.getAll<RunRow>(
          `SELECT * FROM analysis_runs WHERE subject_id = ? ORDER BY created_at DESC LIMIT ?`,
          [subjectId, safeLimit],
        )
      : await this.driver.getAll<RunRow>(
          `SELECT * FROM analysis_runs WHERE subject_id = ? AND metric_id = ? ORDER BY created_at DESC LIMIT ?`,
          [subjectId, metricId, safeLimit],
        );
    const out: AnalysisRunRecord[] = [];
    for (const r of rows) {
      const inputRows = await this.driver.getAll<InputRow>(
        `SELECT observation_id, metric_id, observed_at, value_original, unit_original
         FROM analysis_input_observations WHERE analysis_run_id = ?`,
        [r.analysis_run_id],
      );
      let result: TrendResult;
      try {
        result = JSON.parse(r.result_json ?? '{}') as TrendResult;
      } catch {
        result = {
          windowDays: null, observationCount: 0, slopePerDay: null,
          absoluteChange: null, relativeChange: null, min: null, max: null,
          stabilityCriterion: '', stability: 'inconclusive', method: r.method, methodVersion: r.method_version,
        };
      }
      out.push({
        runId: r.analysis_run_id,
        subjectId: r.subject_id,
        metricId: r.metric_id,
        cutoffAt: r.cutoff_at,
        method: r.method,
        methodVersion: r.method_version,
        status: r.status,
        result,
        limitations: r.limitations ?? '',
        createdAt: r.created_at,
        inputs: inputRows.map((i) => ({
          observationId: i.observation_id,
          metricId: i.metric_id,
          observedAt: i.observed_at,
          valueOriginal: i.value_original,
          unitOriginal: i.unit_original,
        })),
      });
    }
    return out;
  }

  async getRun(runId: string): Promise<AnalysisRunRecord | null> {
    const r = await this.driver.getFirst<RunRow>(
      `SELECT * FROM analysis_runs WHERE analysis_run_id = ?`,
      [runId],
    );
    if (r === null || r === undefined) return null;
    const inputRows = await this.driver.getAll<InputRow>(
      `SELECT observation_id, metric_id, observed_at, value_original, unit_original
       FROM analysis_input_observations WHERE analysis_run_id = ?`,
      [runId],
    );
    let result: TrendResult;
    try {
      result = JSON.parse(r.result_json ?? '{}') as TrendResult;
    } catch {
      result = {
        windowDays: null, observationCount: 0, slopePerDay: null,
        absoluteChange: null, relativeChange: null, min: null, max: null,
        stabilityCriterion: '', stability: 'inconclusive', method: r.method, methodVersion: r.method_version,
      };
    }
    return {
      runId: r.analysis_run_id,
      subjectId: r.subject_id,
      metricId: r.metric_id,
      cutoffAt: r.cutoff_at,
      method: r.method,
      methodVersion: r.method_version,
      status: r.status,
      result,
      limitations: r.limitations ?? '',
      createdAt: r.created_at,
      inputs: inputRows.map((i) => ({
        observationId: i.observation_id,
        metricId: i.metric_id,
        observedAt: i.observed_at,
        valueOriginal: i.value_original,
        unitOriginal: i.unit_original,
      })),
    };
  }
}

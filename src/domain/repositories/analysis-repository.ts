import type { TrendResult } from '@/domain/analytics/trends';

export interface AnalysisRunInput {
  subjectId: string;
  metricId: string;
  cutoffAt: string;
  windowDays: number | null;
  method: string;
  methodVersion: number;
  parametersJson: string;
  baselineId: string | null;
  status: 'completed' | 'insufficient_data' | 'inconclusive' | 'not_comparable' | 'unsupported' | 'failed';
  result: TrendResult;
  limitations: string;
  inputs: Array<{ observationId: string; metricId: string; observedAt: string; valueOriginal: number; unitOriginal: string }>;
}

export interface AnalysisRunRecord {
  runId: string;
  subjectId: string;
  metricId: string;
  cutoffAt: string;
  method: string;
  methodVersion: number;
  status: string;
  result: TrendResult;
  limitations: string;
  createdAt: string;
  inputs: AnalysisRunInput['inputs'];
}

export interface AnalysisRunRepository {
  saveRun(input: AnalysisRunInput): Promise<string>;
  listRuns(subjectId: string, metricId?: string, limit?: number): Promise<AnalysisRunRecord[]>;
  getRun(runId: string): Promise<AnalysisRunRecord | null>;
}

import type { SqlDriver } from '../database/driver';
import type {
  BaselineVersion,
  CreateBaselineInput,
  LabPanel,
  LabPanelWithResults,
  LabResultRecord,
  PrivateDocument,
} from '@/domain/labs/lab-panel';
import type { LabRepository, SaveLabPanelInput, SaveLabPanelResult } from '@/domain/repositories/lab-repository';

interface LabPanelRow {
  panel_id: string;
  session_id: string;
  subject_id: string;
  mission_phase: string;
  collected_at: string;
  reported_at: string | null;
  laboratory: string | null;
  sample_id: string | null;
  method: string | null;
  reference_interval_original: number | null;
  verification_state: string;
  note: string | null;
  created_at: string;
}

interface LabResultRow {
  result_id: string;
  panel_id: string;
  metric_id: string;
  value_original: number;
  unit_original: string;
  value_normalized: number | null;
  unit_normalized: string | null;
  conversion_id: string | null;
  conversion_version: number | null;
  quality_state: string;
  created_at: string;
}

interface LabDocumentRow {
  document_id: string;
  panel_id: string | null;
  subject_id: string;
  kind: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  storage_path: string;
  retention_policy: string;
  created_at: string;
}

interface BaselineRow {
  baseline_id: string;
  subject_id: string;
  metric_id: string;
  version: number;
  period_start: string;
  period_end: string;
  method: string;
  method_version: number;
  parameters_json: string;
  conditions_json: string;
  state: string;
  source_observation_ids: string;
  computed_at: string;
  computed_by: string;
}

function mapPanel(row: LabPanelRow): LabPanel {
  return {
    panelId: row.panel_id,
    subjectId: row.subject_id,
    sessionId: row.session_id,
    missionPhase: row.mission_phase as LabPanel['missionPhase'],
    collectedAt: row.collected_at,
    reportedAt: row.reported_at,
    laboratory: row.laboratory,
    sampleId: row.sample_id,
    method: row.method,
    referenceIntervalOriginal: row.reference_interval_original,
    verificationState: row.verification_state as LabPanel['verificationState'],
    note: row.note,
    createdAt: row.created_at,
  };
}

function mapResult(row: LabResultRow): LabResultRecord {
  return {
    resultId: row.result_id,
    panelId: row.panel_id,
    metricId: row.metric_id,
    valueOriginal: row.value_original,
    unitOriginal: row.unit_original,
    valueNormalized: row.value_normalized,
    unitNormalized: row.unit_normalized,
    conversionId: row.conversion_id,
    conversionVersion: row.conversion_version,
    qualityState: row.quality_state,
    createdAt: row.created_at,
  };
}

function mapDocument(row: LabDocumentRow): PrivateDocument {
  return {
    documentId: row.document_id,
    panelId: row.panel_id,
    subjectId: row.subject_id,
    kind: row.kind as PrivateDocument['kind'],
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    storagePath: row.storage_path,
    retentionPolicy: row.retention_policy,
    createdAt: row.created_at,
  };
}

function mapBaseline(row: BaselineRow): BaselineVersion {
  let sourceIds: string[] = [];
  try {
    sourceIds = JSON.parse(row.source_observation_ids) as string[];
  } catch {
    sourceIds = [];
  }
  return {
    baselineId: row.baseline_id,
    subjectId: row.subject_id,
    metricId: row.metric_id,
    version: row.version,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    method: row.method,
    methodVersion: row.method_version,
    parametersJson: row.parameters_json,
    conditionsJson: row.conditions_json,
    state: row.state as BaselineVersion['state'],
    sourceObservationIds: sourceIds,
    computedAt: row.computed_at,
    computedBy: row.computed_by,
  };
}

export class SqliteLabRepository implements LabRepository {
  constructor(private readonly driver: SqlDriver) {}

  async saveLabPanel(input: SaveLabPanelInput): Promise<SaveLabPanelResult> {
    const results: LabResultRecord[] = [];
    await this.driver.withTransaction(async () => {
      await this.driver.run(
        `INSERT INTO lab_panels
           (panel_id, session_id, subject_id, mission_phase, collected_at, reported_at,
            laboratory, sample_id, method, reference_interval_original,
            verification_state, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.panel.panelId,
          input.panel.sessionId,
          input.panel.subjectId,
          input.panel.missionPhase,
          input.panel.collectedAt,
          input.panel.reportedAt,
          input.panel.laboratory,
          input.panel.sampleId,
          input.panel.method,
          input.panel.referenceIntervalOriginal,
          input.panel.verificationState,
          input.panel.note,
          input.panel.createdAt,
        ],
      );
      for (const r of input.results) {
        const resultId = `res-${input.panel.panelId}-${r.metricId}`;
        await this.driver.run(
          `INSERT INTO lab_results
             (result_id, panel_id, metric_id, value_original, unit_original,
              value_normalized, unit_normalized, conversion_id, conversion_version,
              quality_state, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            resultId,
            input.panel.panelId,
            r.metricId,
            r.valueOriginal,
            r.unitOriginal,
            r.valueNormalized,
            r.unitNormalized,
            r.conversionId,
            r.conversionVersion,
            r.qualityState,
            input.panel.createdAt,
          ],
        );
        results.push({
          resultId,
          panelId: input.panel.panelId,
          metricId: r.metricId,
          valueOriginal: r.valueOriginal,
          unitOriginal: r.unitOriginal,
          valueNormalized: r.valueNormalized,
          unitNormalized: r.unitNormalized,
          conversionId: r.conversionId,
          conversionVersion: r.conversionVersion,
          qualityState: r.qualityState,
          createdAt: input.panel.createdAt,
        });
      }
      for (const d of input.documents) {
        await this.driver.run(
          `INSERT INTO lab_documents
             (document_id, panel_id, subject_id, kind, file_name, mime_type,
              byte_size, sha256, storage_path, retention_policy, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            d.documentId,
            input.panel.panelId,
            d.subjectId,
            d.kind,
            d.fileName,
            d.mimeType,
            d.byteSize,
            d.sha256,
            d.storagePath,
            d.retentionPolicy,
            d.createdAt,
          ],
        );
      }
    });
    return { sessionId: input.panel.sessionId, results };
  }

  async listLabPanels(limit: number): Promise<LabPanelWithResults[]> {
    const safeLimit = Math.max(1, Math.floor(limit));
    const panelRows = await this.driver.getAll<LabPanelRow>(
      `SELECT * FROM lab_panels ORDER BY collected_at DESC LIMIT ?`,
      [safeLimit],
    );
    const out: LabPanelWithResults[] = [];
    for (const pr of panelRows) {
      const resultRows = await this.driver.getAll<LabResultRow>(
        `SELECT * FROM lab_results WHERE panel_id = ? ORDER BY metric_id`,
        [pr.panel_id],
      );
      const docRows = await this.driver.getAll<LabDocumentRow>(
        `SELECT * FROM lab_documents WHERE panel_id = ?`,
        [pr.panel_id],
      );
      out.push({
        panel: mapPanel(pr),
        results: resultRows.map(mapResult),
        documents: docRows.map(mapDocument),
      });
    }
    return out;
  }

  async getLabPanel(panelId: string): Promise<LabPanelWithResults | null> {
    const row = await this.driver.getFirst<LabPanelRow>(
      `SELECT * FROM lab_panels WHERE panel_id = ?`,
      [panelId],
    );
    if (row === null || row === undefined) return null;
    const resultRows = await this.driver.getAll<LabResultRow>(
      `SELECT * FROM lab_results WHERE panel_id = ? ORDER BY metric_id`,
      [panelId],
    );
    const docRows = await this.driver.getAll<LabDocumentRow>(
      `SELECT * FROM lab_documents WHERE panel_id = ?`,
      [panelId],
    );
    return {
      panel: mapPanel(row),
      results: resultRows.map(mapResult),
      documents: docRows.map(mapDocument),
    };
  }

  async saveBaseline(input: CreateBaselineInput): Promise<BaselineVersion> {
    // Determinar la siguiente versión para este sujeto/métrica.
    const row = await this.driver.getFirst<{ v: number | null }>(
      `SELECT MAX(version) AS v FROM baseline_versions WHERE subject_id = ? AND metric_id = ?`,
      [input.subjectId, input.metricId],
    );
    const nextVersion = (row?.v ?? 0) + 1;
    const baselineId = `base-${input.subjectId}-${input.metricId}-v${nextVersion}`;
    const computedAt = new Date().toISOString();
    await this.driver.run(
      `INSERT INTO baseline_versions
         (baseline_id, subject_id, metric_id, version, period_start, period_end,
          method, method_version, parameters_json, conditions_json, state,
          source_observation_ids, computed_at, computed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'provisional', ?, ?, 'client')`,
      [
        baselineId,
        input.subjectId,
        input.metricId,
        nextVersion,
        input.periodStart,
        input.periodEnd,
        input.method,
        input.methodVersion,
        input.parametersJson,
        input.conditionsJson,
        JSON.stringify(input.sourceObservationIds),
        computedAt,
      ],
    );
    return {
      baselineId,
      subjectId: input.subjectId,
      metricId: input.metricId,
      version: nextVersion,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      method: input.method,
      methodVersion: input.methodVersion,
      parametersJson: input.parametersJson,
      conditionsJson: input.conditionsJson,
      state: 'provisional',
      sourceObservationIds: input.sourceObservationIds,
      computedAt,
      computedBy: 'client',
    };
  }

  async listBaselines(subjectId: string, metricId?: string): Promise<BaselineVersion[]> {
    const rows = metricId === undefined
      ? await this.driver.getAll<BaselineRow>(
          `SELECT * FROM baseline_versions WHERE subject_id = ? ORDER BY metric_id, version DESC`,
          [subjectId],
        )
      : await this.driver.getAll<BaselineRow>(
          `SELECT * FROM baseline_versions WHERE subject_id = ? AND metric_id = ? ORDER BY version DESC`,
          [subjectId, metricId],
        );
    return rows.map(mapBaseline);
  }
}

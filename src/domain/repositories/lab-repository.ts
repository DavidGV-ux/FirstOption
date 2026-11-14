/**
 * Puerto del laboratorio local: paneles, documentos privados y
 * líneas basales versionadas. La aplicación depende de esta interfaz;
 * la infraestructura SQLite la implementa junto al repositorio de
 * observaciones.
 */
import type { BaselineVersion, CreateBaselineInput, LabPanel, LabPanelWithResults, LabResultRecord, PrivateDocument } from '@/domain/labs/lab-panel';

export interface SaveLabPanelResult {
  sessionId: string;
  results: LabResultRecord[];
}

export interface SaveLabPanelInput {
  panel: LabPanel;
  results: {
    metricId: string;
    valueOriginal: number;
    unitOriginal: string;
    valueNormalized: number | null;
    unitNormalized: string | null;
    conversionId: string | null;
    conversionVersion: number | null;
    qualityState: string;
  }[];
  documents: PrivateDocument[];
}

export interface LabRepository {
  /** Guarda panel + resultados + documento(s) en una sola transacción. */
  saveLabPanel(input: SaveLabPanelInput): Promise<SaveLabPanelResult>;

  /** Paneles locales con sus resultados y documentos. */
  listLabPanels(limit: number): Promise<LabPanelWithResults[]>;

  /** Un panel por identificador. */
  getLabPanel(panelId: string): Promise<LabPanelWithResults | null>;

  /** Registra (o incrementa) una línea basal versionada. */
  saveBaseline(input: CreateBaselineInput): Promise<BaselineVersion>;

  /** Líneas basales de un sujeto (opcionalmente por métrica). */
  listBaselines(subjectId: string, metricId?: string): Promise<BaselineVersion[]>;
}

export type { BaselineVersion, CreateBaselineInput, LabPanel, LabPanelWithResults, LabResultRecord, PrivateDocument };

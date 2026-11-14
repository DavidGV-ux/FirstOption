import type {
  MeasurementSession,
  MissionPhase,
  Observation,
  SyncState,
} from '@/domain/observations/observation';
import type { ObservationRepository } from '@/domain/repositories/observation-repository';
import type { MetricDefinition } from '@/domain/metrics/metric-definition';
import type { RelativeAge } from '@/domain/shared/relative-age';
import { relativeAgeIso } from '@/domain/shared/relative-age';
import type { Clock } from '@/domain/shared/clock';

/** Fila de resumen para la pantalla de inicio. */
export interface RecentLogEntry {
  sessionId: string;
  recordedAt: string;
  age: RelativeAge;
  missionPhase: MissionPhase;
  syncState: SyncState;
  note: string | null;
  observationCount: number;
  /** Resumen legible: p. ej. "Ánimo 3/5, Fatiga 2/5, FC 68 lpm". */
  summaryParts: string[];
}

/** Estado del último registro para el CTA de inicio. */
export interface LatestLogStatus {
  entry: RecentLogEntry | null;
  /** true si el último registro es de hoy (fecha local). */
  isToday: boolean;
}

export class ListRecentActivityUseCase {
  constructor(
    private readonly repository: ObservationRepository,
    private readonly clock: Clock,
  ) {}

  async latestLogStatus(): Promise<LatestLogStatus> {
    const [sessions, definitions] = await Promise.all([
      this.repository.listRecentSessions(1),
      this.repository.listMetricDefinitions(),
    ]);
    if (sessions.length === 0) {
      // Ausencia de datos NO se presenta como normalidad.
      return { entry: null, isToday: false };
    }
    const entry = toEntry(sessions[0], this.clock.nowIso(), definitions);
    const today = localDateToday(this.clock.nowIso());
    return { entry, isToday: sessions[0].session.recordedLocalDate === today };
  }

  async listRecent(limit: number): Promise<RecentLogEntry[]> {
    const [sessions, definitions] = await Promise.all([
      this.repository.listRecentSessions(limit),
      this.repository.listMetricDefinitions(),
    ]);
    return sessions.map((s) => toEntry(s, this.clock.nowIso(), definitions));
  }

  /** Operaciones aún no sincronizadas; se muestran en la UI, nunca se ocultan. */
  async countPendingSync(): Promise<{ sessions: number; observations: number }> {
    return this.repository.countPendingSync();
  }
}

export function localDateToday(nowIso: string): string {
  const d = new Date(nowIso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const SUMMARY_METRIC_ORDER = [
  'mood_self_report',
  'stress_self_report',
  'fatigue_self_report',
  'sleep_quality_self_report',
  'sleep_duration',
  'heart_rate',
  'bp_systolic',
  'bp_diastolic',
  'spo2',
];

function formatValue(
  observation: Observation,
  definitionsById: Map<string, MetricDefinition>,
): string | null {
  const def = definitionsById.get(observation.metricId);
  if (!def) return null;
  switch (def.valueType) {
    case 'ordinal_scale':
      return `${def.nameEs} ${observation.valueOriginal}/5`;
    case 'boolean':
      return `${def.nameEs}: presente`;
    case 'integer':
    case 'decimal':
      return `${def.nameEs} ${formatNumber(observation.valueOriginal)} ${observation.unitOriginal ?? ''}`.trim();
  }
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function toEntry(
  data: { session: MeasurementSession; observations: Observation[] },
  nowIso: string,
  definitions: MetricDefinition[],
): RecentLogEntry {
  const definitionsById = new Map(definitions.map((d) => [d.metricId, d]));
  const ordered = [...data.observations].sort((a, b) => {
    const ia = SUMMARY_METRIC_ORDER.indexOf(a.metricId);
    const ib = SUMMARY_METRIC_ORDER.indexOf(b.metricId);
    if (ia === -1 && ib === -1) return a.metricId.localeCompare(b.metricId);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  const summaryParts = ordered
    .map((o) => formatValue(o, definitionsById))
    .filter((s): s is string => s !== null);
  // La antigüedad describe la fecha de toma más reciente registrada en
  // la sesión (no el momento de guardado).
  const latestObservedAt =
    ordered.length > 0 ? ordered[ordered.length - 1].observedAt : null;
  const measuredAt = latestObservedAt ?? data.session.recordedAt;
  return {
    sessionId: data.session.sessionId,
    recordedAt: data.session.recordedAt,
    age: relativeAgeIso(measuredAt, nowIso),
    missionPhase: data.session.missionPhase,
    syncState: data.session.syncState,
    note: data.session.note,
    observationCount: data.observations.length,
    summaryParts,
  };
}

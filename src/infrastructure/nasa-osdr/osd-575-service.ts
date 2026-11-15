/**
 * Servicio de integración para el estudio NASA OSDR OSD-575:
 * SpaceX Inspiration4 Blood Serum Metabolic Panel & Cytokine Arrays.
 *
 * Provee ingestión en el repositorio local (SQLite) y consulta
 * tanto de los datos empaquetados como descarga en vivo desde NASA OSDR.
 */

import type { ObservationRepository, NewObservationInput } from '@/domain/repositories/observation-repository';
import type { MeasurementSession } from '@/domain/observations/observation';
import { getMetricDefinition } from '@/domain/metrics/catalog-v1';
import {
  OSD_575_RECORDS,
  OSD_575_STUDY_INFO,
  type Inspiration4CrewId,
  type Osd575Record,
} from './osd-575-data';

export interface SeedOsd575Result {
  crewId: Inspiration4CrewId;
  subjectId: string;
  sessionsCreated: number;
  observationsCreated: number;
}

export class Osd575Service {
  /**
   * Obtiene la información del estudio y metadatos de los tripulantes.
   */
  static getStudyInfo() {
    return OSD_575_STUDY_INFO;
  }

  /**
   * Registros empaquetados en la aplicación para disponibilidad offline inmediata.
   */
  static getLocalRecords(crewId?: Inspiration4CrewId): readonly Osd575Record[] {
    if (!crewId) return OSD_575_RECORDS;
    return OSD_575_RECORDS.filter((r) => r.crewId === crewId);
  }

  /**
   * Siembra las sesiones y observaciones de un astronauta específico de Inspiration4
   * en el repositorio de observaciones del usuario activo.
   *
   * Utiliza identificadores de sesión deterministas para garantizar idempotencia.
   */
  static async seedCrewToRepository(
    repo: ObservationRepository,
    crewId: Inspiration4CrewId,
    targetSubjectId: string,
  ): Promise<SeedOsd575Result> {
    const crewRecords = OSD_575_RECORDS.filter((r) => r.crewId === crewId);
    let sessionsCount = 0;
    let observationsCount = 0;

    for (const record of crewRecords) {
      const tpClean = record.timepoint.replace('+', 'plus').replace('-', 'minus');
      const sessionId = `osd575-${crewId.toLowerCase()}-${tpClean}`;

      const session: MeasurementSession = {
        sessionId,
        subjectId: targetSubjectId,
        missionPhase: record.missionPhase,
        recordedAt: record.observedAt,
        recordedLocalDate: record.localDate,
        source: 'nasa_osdr_osd575',
        note: `NASA OSDR OSD-575 (Inspiration4 ${crewId} ${record.timepoint})`,
        syncState: 'local_only',
        createdAt: record.observedAt,
      };

      const entries = Object.entries(record.values) as [string, number][];
      const observations: NewObservationInput[] = entries.map(([metricId, value]) => {
        const def = getMetricDefinition(metricId);
        return {
          metricId,
          valueOriginal: value,
          unitOriginal: def?.canonicalUnit ?? null,
          observedAt: record.observedAt,
          localDate: record.localDate,
          qualityState: 'ok',
        };
      });

      try {
        // `syncable: false`: el dataset NASA es material de referencia
        // externo. Se guarda localmente para exploración, pero no se
        // encola ni se sube como historial personal de la cuenta.
        await repo.saveSessionWithObservations(session, observations, { syncable: false });
        sessionsCount++;
        observationsCount += observations.length;
      } catch (err: unknown) {
        // Si ya existe (violación de clave primaria/idempotencia), omitir sin error.
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('UNIQUE constraint failed') || msg.includes('constraint')) {
          continue;
        }
        throw err;
      }
    }

    return {
      crewId,
      subjectId: targetSubjectId,
      sessionsCreated: sessionsCount,
      observationsCreated: observationsCount,
    };
  }

  /**
   * Intenta descargar la última versión de los datos directamente desde la API de NASA OSDR.
   * Si hay fallo de conexión, regresa null para permitir fallback a los datos empaquetados.
   */
  static async fetchLiveFromNasa(): Promise<{ cmpRows: number; eveRows: number } | null> {
    try {
      const cmpUrl =
        'https://osdr.nasa.gov/geode-py/ws/studies/OSD-575/download?source=datamanager&file=LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv';
      const eveUrl =
        'https://osdr.nasa.gov/geode-py/ws/studies/OSD-575/download?source=datamanager&file=LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv';

      const [cmpRes, eveRes] = await Promise.all([
        fetch(cmpUrl, { signal: AbortSignal.timeout(10000) }),
        fetch(eveUrl, { signal: AbortSignal.timeout(10000) }),
      ]);

      if (!cmpRes.ok || !eveRes.ok) return null;

      const cmpText = await cmpRes.text();
      const eveText = await eveRes.text();

      const cmpRows = cmpText.trim().split(/\r?\n/).length - 1;
      const eveRows = eveText.trim().split(/\r?\n/).length - 1;

      return { cmpRows, eveRows };
    } catch {
      return null;
    }
  }
}

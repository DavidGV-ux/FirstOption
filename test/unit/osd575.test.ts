import {
  OSD_575_RECORDS,
  OSD_575_STUDY_INFO,
} from '@/infrastructure/nasa-osdr/osd-575-data';
import { Osd575Service } from '@/infrastructure/nasa-osdr/osd-575-service';
import { evaluateMetricRange } from '@/domain/analytics/health-ranges';
import type { ObservationRepository } from '@/domain/repositories/observation-repository';
import type { MeasurementSession } from '@/domain/observations/observation';

describe('NASA OSDR OSD-575 Dataset and Service', () => {
  it('contiene los 28 registros oficiales de SpaceX Inspiration4 (4 astronautas x 7 momentos)', () => {
    expect(OSD_575_RECORDS).toHaveLength(28);

    const crewIds = new Set(OSD_575_RECORDS.map((r) => r.crewId));
    expect(crewIds).toEqual(new Set(['C001', 'C002', 'C003', 'C004']));

    const timepoints = new Set(OSD_575_RECORDS.map((r) => r.timepoint));
    expect(timepoints).toEqual(
      new Set(['L-92', 'L-44', 'L-3', 'R+1', 'R+45', 'R+82', 'R+194']),
    );

    for (const rec of OSD_575_RECORDS) {
      expect(rec.values.glucose).toBeGreaterThan(0);
      expect(rec.values.creatinine).toBeGreaterThan(0);
      expect(rec.values.urea_nitrogen_bun).toBeGreaterThan(0);
      expect(rec.values.sodium).toBeGreaterThan(100);
      expect(rec.values.potassium).toBeGreaterThan(2);
      expect(rec.values.chloride).toBeGreaterThan(80);
      expect(rec.values.calcium).toBeGreaterThan(5);
      expect(rec.values.alt).toBeGreaterThan(0);
      expect(rec.values.ast).toBeGreaterThan(0);
      expect(rec.values.albumin).toBeGreaterThan(0);
      expect(rec.values.crp).toBeGreaterThanOrEqual(0);
      expect(['preflight', 'postflight']).toContain(rec.missionPhase);
    }
  });

  it('filtra registros por tripulante correctamente', () => {
    const c001 = Osd575Service.getLocalRecords('C001');
    expect(c001).toHaveLength(7);
    expect(c001.every((r) => r.crewId === 'C001')).toBe(true);

    const c004 = Osd575Service.getLocalRecords('C004');
    expect(c004).toHaveLength(7);
    expect(c004.every((r) => r.crewId === 'C004')).toBe(true);
  });

  it('obtiene metadatos del estudio', () => {
    const info = Osd575Service.getStudyInfo();
    expect(info).toEqual(OSD_575_STUDY_INFO);
    expect(info.studyId).toBe('OSD-575');
    expect(info.missionName).toBe('SpaceX Inspiration4');
    expect(info.crewMembers).toHaveLength(4);
  });

  it('siembra sesiones y observaciones en el repositorio con IDs deterministas e idempotencia', async () => {
    const savedSessions: MeasurementSession[] = [];
    const savedObs: unknown[][] = [];

    const mockRepo: ObservationRepository = {
      async saveSessionWithObservations(session, observations) {
        savedSessions.push(session);
        savedObs.push([...observations]);
      },
      async listRecentSessions() {
        return [];
      },
      async countPendingSync() {
        return { sessions: 0, observations: 0 };
      },
      async listMetricDefinitions() {
        return [];
      },
      async adoptSubjectScope() {
        return 0;
      },
      async countRecordsBySubject() {
        return 0;
      },
    };

    const res = await Osd575Service.seedCrewToRepository(mockRepo, 'C002', 'test-subject-42');
    expect(res.crewId).toBe('C002');
    expect(res.subjectId).toBe('test-subject-42');
    expect(res.sessionsCreated).toBe(7);
    expect(res.observationsCreated).toBe(7 * 11); // 11 métricas por momento

    expect(savedSessions).toHaveLength(7);
    expect(savedSessions[0].subjectId).toBe('test-subject-42');
    expect(savedSessions[0].source).toBe('nasa_osdr_osd575');
    expect(savedSessions[0].sessionId).toMatch(/^osd575-c002-/);

    expect(savedObs[0]).toHaveLength(11);
  });

  it('evalúa rangos clínicos e informativos para las nuevas métricas metabólicas', () => {
    // Glucosa
    expect(evaluateMetricRange('glucose', 85).status).toBe('aceptable');
    expect(evaluateMetricRange('glucose', 115).status).toBe('atencion');
    expect(evaluateMetricRange('glucose', 250).status).toBe('negativo');

    // Creatinina
    expect(evaluateMetricRange('creatinine', 0.9).status).toBe('aceptable');
    expect(evaluateMetricRange('creatinine', 1.45).status).toBe('atencion');

    // Potasio
    expect(evaluateMetricRange('potassium', 4.2).status).toBe('aceptable');
    expect(evaluateMetricRange('potassium', 5.4).status).toBe('atencion');

    // PCR
    expect(evaluateMetricRange('crp', 1.2).status).toBe('aceptable');
    expect(evaluateMetricRange('crp', 5.5).status).toBe('atencion');
    expect(evaluateMetricRange('crp', 15.0).status).toBe('negativo');
  });
});

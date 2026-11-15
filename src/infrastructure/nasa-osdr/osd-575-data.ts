/**
 * NASA OSDR OSD-575: SpaceX Inspiration4 Blood Serum Metabolic Panel & Cytokine Arrays.
 * Datos oficiales de LSDS-8 (Comprehensive Metabolic Panel) y EvePanel (Multiplex Serum).
 * 4 miembros de tripulación (C001, C002, C003, C004) x 7 momentos de misión.
 *
 * Fuente: NASA Open Science Data Repository (OSDR)
 * https://osdr.nasa.gov/bio/repo/data/studies/OSD-575
 */

import type { MissionPhase } from '@/domain/observations/observation';

export type Inspiration4CrewId = 'C001' | 'C002' | 'C003' | 'C004';
export type Inspiration4Timepoint = 'L-92' | 'L-44' | 'L-3' | 'R+1' | 'R+45' | 'R+82' | 'R+194';

export interface Osd575Record {
  sampleId: string;
  crewId: Inspiration4CrewId;
  timepoint: Inspiration4Timepoint;
  observedAt: string;
  localDate: string;
  missionPhase: MissionPhase;
  values: {
    glucose: number;
    creatinine: number;
    urea_nitrogen_bun: number;
    sodium: number;
    potassium: number;
    chloride: number;
    calcium: number;
    alt: number;
    ast: number;
    albumin: number;
    crp: number;
  };
}

export const OSD_575_STUDY_INFO = {
  studyId: 'OSD-575',
  title: 'SpaceX Inspiration4 Blood Serum Metabolic Panel and Immune/Cardiac Cytokine Arrays',
  missionName: 'SpaceX Inspiration4',
  launchDate: '2021-09-16T00:02:56.000Z',
  landingDate: '2021-09-18T23:06:49.000Z',
  crewMembers: [
    { id: 'C001', label: 'Tripulante C001 (Inspiration4)' },
    { id: 'C002', label: 'Tripulante C002 (Inspiration4)' },
    { id: 'C003', label: 'Tripulante C003 (Inspiration4)' },
    { id: 'C004', label: 'Tripulante C004 (Inspiration4)' },
  ],
  timepointDescriptions: {
    'L-92': 'Preflight (L-92 d): Línea basal inicial (~3 meses antes)',
    'L-44': 'Preflight (L-44 d): Seguimiento intermedio pre-lanzamiento',
    'L-3': 'Preflight (L-3 d): Inmediato previo al lanzamiento',
    'R+1': 'Postflight (R+1 d): Retorno inmediato post-amerizaje',
    'R+45': 'Postflight (R+45 d): Recuperación fisiológica temprana',
    'R+82': 'Postflight (R+82 d): Recuperación a mediano plazo',
    'R+194': 'Postflight (R+194 d): Recuperación a largo plazo (~6 meses)',
  },
} as const;

export const OSD_575_RECORDS: readonly Osd575Record[] = [
  {
    "sampleId": "C001_serum_L-92",
    "crewId": "C001",
    "timepoint": "L-92",
    "observedAt": "2021-06-16T12:00:00.000Z",
    "localDate": "2021-06-16",
    "missionPhase": "preflight",
    "values": {
      "glucose": 83,
      "creatinine": 1.24,
      "urea_nitrogen_bun": 25,
      "sodium": 141,
      "potassium": 4.6,
      "chloride": 104,
      "calcium": 9.7,
      "alt": 15,
      "ast": 15,
      "albumin": 5,
      "crp": 18.39
    }
  },
  {
    "sampleId": "C001_serum_L-44",
    "crewId": "C001",
    "timepoint": "L-44",
    "observedAt": "2021-08-03T12:00:00.000Z",
    "localDate": "2021-08-03",
    "missionPhase": "preflight",
    "values": {
      "glucose": 80,
      "creatinine": 1.1,
      "urea_nitrogen_bun": 19,
      "sodium": 139,
      "potassium": 4.2,
      "chloride": 101,
      "calcium": 10,
      "alt": 16,
      "ast": 18,
      "albumin": 5,
      "crp": 2.19
    }
  },
  {
    "sampleId": "C001_serum_L-3",
    "crewId": "C001",
    "timepoint": "L-3",
    "observedAt": "2021-09-13T12:00:00.000Z",
    "localDate": "2021-09-13",
    "missionPhase": "preflight",
    "values": {
      "glucose": 69,
      "creatinine": 1.37,
      "urea_nitrogen_bun": 20,
      "sodium": 142,
      "potassium": 3.9,
      "chloride": 102,
      "calcium": 9.6,
      "alt": 13,
      "ast": 15,
      "albumin": 4.9,
      "crp": 5.13
    }
  },
  {
    "sampleId": "C001_serum_R+1",
    "crewId": "C001",
    "timepoint": "R+1",
    "observedAt": "2021-09-19T14:00:00.000Z",
    "localDate": "2021-09-19",
    "missionPhase": "postflight",
    "values": {
      "glucose": 90,
      "creatinine": 1.12,
      "urea_nitrogen_bun": 18,
      "sodium": 138,
      "potassium": 4.4,
      "chloride": 102,
      "calcium": 9.7,
      "alt": 9,
      "ast": 16,
      "albumin": 4.9,
      "crp": 10.64
    }
  },
  {
    "sampleId": "C001_serum_R+45",
    "crewId": "C001",
    "timepoint": "R+45",
    "observedAt": "2021-11-02T12:00:00.000Z",
    "localDate": "2021-11-02",
    "missionPhase": "postflight",
    "values": {
      "glucose": 84,
      "creatinine": 1.11,
      "urea_nitrogen_bun": 15,
      "sodium": 138,
      "potassium": 4,
      "chloride": 100,
      "calcium": 9.6,
      "alt": 11,
      "ast": 13,
      "albumin": 4.9,
      "crp": 6.71
    }
  },
  {
    "sampleId": "C001_serum_R+82",
    "crewId": "C001",
    "timepoint": "R+82",
    "observedAt": "2021-12-09T12:00:00.000Z",
    "localDate": "2021-12-09",
    "missionPhase": "postflight",
    "values": {
      "glucose": 91,
      "creatinine": 1.25,
      "urea_nitrogen_bun": 22,
      "sodium": 140,
      "potassium": 4.3,
      "chloride": 101,
      "calcium": 10.1,
      "alt": 15,
      "ast": 16,
      "albumin": 5.1,
      "crp": 25.03
    }
  },
  {
    "sampleId": "C001_serum_R+194",
    "crewId": "C001",
    "timepoint": "R+194",
    "observedAt": "2022-03-31T12:00:00.000Z",
    "localDate": "2022-03-31",
    "missionPhase": "postflight",
    "values": {
      "glucose": 87,
      "creatinine": 1.29,
      "urea_nitrogen_bun": 28,
      "sodium": 137,
      "potassium": 4.3,
      "chloride": 102,
      "calcium": 9.4,
      "alt": 15,
      "ast": 12,
      "albumin": 4.6,
      "crp": 15.41
    }
  },
  {
    "sampleId": "C002_serum_L-92",
    "crewId": "C002",
    "timepoint": "L-92",
    "observedAt": "2021-06-16T12:00:00.000Z",
    "localDate": "2021-06-16",
    "missionPhase": "preflight",
    "values": {
      "glucose": 69,
      "creatinine": 0.83,
      "urea_nitrogen_bun": 14,
      "sodium": 142,
      "potassium": 3.9,
      "chloride": 103,
      "calcium": 10.2,
      "alt": 16,
      "ast": 19,
      "albumin": 4.9,
      "crp": 8.93
    }
  },
  {
    "sampleId": "C002_serum_L-44",
    "crewId": "C002",
    "timepoint": "L-44",
    "observedAt": "2021-08-03T12:00:00.000Z",
    "localDate": "2021-08-03",
    "missionPhase": "preflight",
    "values": {
      "glucose": 72,
      "creatinine": 0.88,
      "urea_nitrogen_bun": 16,
      "sodium": 141,
      "potassium": 4,
      "chloride": 103,
      "calcium": 9.7,
      "alt": 24,
      "ast": 31,
      "albumin": 4.6,
      "crp": 1.57
    }
  },
  {
    "sampleId": "C002_serum_L-3",
    "crewId": "C002",
    "timepoint": "L-3",
    "observedAt": "2021-09-13T12:00:00.000Z",
    "localDate": "2021-09-13",
    "missionPhase": "preflight",
    "values": {
      "glucose": 78,
      "creatinine": 0.96,
      "urea_nitrogen_bun": 17,
      "sodium": 143,
      "potassium": 3.8,
      "chloride": 106,
      "calcium": 9.3,
      "alt": 19,
      "ast": 40,
      "albumin": 4.3,
      "crp": 11.97
    }
  },
  {
    "sampleId": "C002_serum_R+1",
    "crewId": "C002",
    "timepoint": "R+1",
    "observedAt": "2021-09-19T14:00:00.000Z",
    "localDate": "2021-09-19",
    "missionPhase": "postflight",
    "values": {
      "glucose": 83,
      "creatinine": 0.95,
      "urea_nitrogen_bun": 20,
      "sodium": 137,
      "potassium": 3.5,
      "chloride": 103,
      "calcium": 9.2,
      "alt": 16,
      "ast": 23,
      "albumin": 4.4,
      "crp": 9.31
    }
  },
  {
    "sampleId": "C002_serum_R+45",
    "crewId": "C002",
    "timepoint": "R+45",
    "observedAt": "2021-11-02T12:00:00.000Z",
    "localDate": "2021-11-02",
    "missionPhase": "postflight",
    "values": {
      "glucose": 44,
      "creatinine": 1.02,
      "urea_nitrogen_bun": 19,
      "sodium": 140,
      "potassium": 4.1,
      "chloride": 104,
      "calcium": 9.3,
      "alt": 14,
      "ast": 17,
      "albumin": 4.2,
      "crp": 3.68
    }
  },
  {
    "sampleId": "C002_serum_R+82",
    "crewId": "C002",
    "timepoint": "R+82",
    "observedAt": "2021-12-09T12:00:00.000Z",
    "localDate": "2021-12-09",
    "missionPhase": "postflight",
    "values": {
      "glucose": 77,
      "creatinine": 0.82,
      "urea_nitrogen_bun": 16,
      "sodium": 141,
      "potassium": 3.7,
      "chloride": 105,
      "calcium": 9.7,
      "alt": 17,
      "ast": 21,
      "albumin": 4.5,
      "crp": 8.63
    }
  },
  {
    "sampleId": "C002_serum_R+194",
    "crewId": "C002",
    "timepoint": "R+194",
    "observedAt": "2022-03-31T12:00:00.000Z",
    "localDate": "2022-03-31",
    "missionPhase": "postflight",
    "values": {
      "glucose": 84,
      "creatinine": 1.02,
      "urea_nitrogen_bun": 18,
      "sodium": 138,
      "potassium": 4.4,
      "chloride": 104,
      "calcium": 9.5,
      "alt": 17,
      "ast": 24,
      "albumin": 4.3,
      "crp": 21.46
    }
  },
  {
    "sampleId": "C003_serum_L-92",
    "crewId": "C003",
    "timepoint": "L-92",
    "observedAt": "2021-06-16T12:00:00.000Z",
    "localDate": "2021-06-16",
    "missionPhase": "preflight",
    "values": {
      "glucose": 77,
      "creatinine": 1,
      "urea_nitrogen_bun": 17,
      "sodium": 139,
      "potassium": 3.7,
      "chloride": 102,
      "calcium": 9.3,
      "alt": 12,
      "ast": 15,
      "albumin": 4.4,
      "crp": 75.75
    }
  },
  {
    "sampleId": "C003_serum_L-44",
    "crewId": "C003",
    "timepoint": "L-44",
    "observedAt": "2021-08-03T12:00:00.000Z",
    "localDate": "2021-08-03",
    "missionPhase": "preflight",
    "values": {
      "glucose": 62,
      "creatinine": 1.03,
      "urea_nitrogen_bun": 19,
      "sodium": 139,
      "potassium": 3.5,
      "chloride": 99,
      "calcium": 10.3,
      "alt": 13,
      "ast": 17,
      "albumin": 4.9,
      "crp": 9.38
    }
  },
  {
    "sampleId": "C003_serum_L-3",
    "crewId": "C003",
    "timepoint": "L-3",
    "observedAt": "2021-09-13T12:00:00.000Z",
    "localDate": "2021-09-13",
    "missionPhase": "preflight",
    "values": {
      "glucose": 75,
      "creatinine": 1.08,
      "urea_nitrogen_bun": 26,
      "sodium": 138,
      "potassium": 3.3,
      "chloride": 101,
      "calcium": 9.5,
      "alt": 13,
      "ast": 13,
      "albumin": 4.2,
      "crp": 42.84
    }
  },
  {
    "sampleId": "C003_serum_R+1",
    "crewId": "C003",
    "timepoint": "R+1",
    "observedAt": "2021-09-19T14:00:00.000Z",
    "localDate": "2021-09-19",
    "missionPhase": "postflight",
    "values": {
      "glucose": 103,
      "creatinine": 0.89,
      "urea_nitrogen_bun": 21,
      "sodium": 137,
      "potassium": 3,
      "chloride": 103,
      "calcium": 9.4,
      "alt": 19,
      "ast": 18,
      "albumin": 4.2,
      "crp": 83.62
    }
  },
  {
    "sampleId": "C003_serum_R+45",
    "crewId": "C003",
    "timepoint": "R+45",
    "observedAt": "2021-11-02T12:00:00.000Z",
    "localDate": "2021-11-02",
    "missionPhase": "postflight",
    "values": {
      "glucose": 36,
      "creatinine": 0.94,
      "urea_nitrogen_bun": 19,
      "sodium": 136,
      "potassium": 4.4,
      "chloride": 97,
      "calcium": 9.6,
      "alt": 17,
      "ast": 19,
      "albumin": 4.5,
      "crp": 39.19
    }
  },
  {
    "sampleId": "C003_serum_R+82",
    "crewId": "C003",
    "timepoint": "R+82",
    "observedAt": "2021-12-09T12:00:00.000Z",
    "localDate": "2021-12-09",
    "missionPhase": "postflight",
    "values": {
      "glucose": 80,
      "creatinine": 0.89,
      "urea_nitrogen_bun": 23,
      "sodium": 138,
      "potassium": 3.7,
      "chloride": 102,
      "calcium": 10,
      "alt": 12,
      "ast": 15,
      "albumin": 4.8,
      "crp": 12.68
    }
  },
  {
    "sampleId": "C003_serum_R+194",
    "crewId": "C003",
    "timepoint": "R+194",
    "observedAt": "2022-03-31T12:00:00.000Z",
    "localDate": "2022-03-31",
    "missionPhase": "postflight",
    "values": {
      "glucose": 73,
      "creatinine": 1.1,
      "urea_nitrogen_bun": 28,
      "sodium": 137,
      "potassium": 3.8,
      "chloride": 101,
      "calcium": 9.6,
      "alt": 10,
      "ast": 15,
      "albumin": 4.4,
      "crp": 9.38
    }
  },
  {
    "sampleId": "C004_serum_L-92",
    "crewId": "C004",
    "timepoint": "L-92",
    "observedAt": "2021-06-16T12:00:00.000Z",
    "localDate": "2021-06-16",
    "missionPhase": "preflight",
    "values": {
      "glucose": 100,
      "creatinine": 1.14,
      "urea_nitrogen_bun": 22,
      "sodium": 138,
      "potassium": 4.2,
      "chloride": 102,
      "calcium": 10,
      "alt": 37,
      "ast": 36,
      "albumin": 4.6,
      "crp": 21.38
    }
  },
  {
    "sampleId": "C004_serum_L-44",
    "crewId": "C004",
    "timepoint": "L-44",
    "observedAt": "2021-08-03T12:00:00.000Z",
    "localDate": "2021-08-03",
    "missionPhase": "preflight",
    "values": {
      "glucose": 83,
      "creatinine": 1.08,
      "urea_nitrogen_bun": 19,
      "sodium": 140,
      "potassium": 4.2,
      "chloride": 103,
      "calcium": 10.1,
      "alt": 35,
      "ast": 44,
      "albumin": 4.4,
      "crp": 1.29
    }
  },
  {
    "sampleId": "C004_serum_L-3",
    "crewId": "C004",
    "timepoint": "L-3",
    "observedAt": "2021-09-13T12:00:00.000Z",
    "localDate": "2021-09-13",
    "missionPhase": "preflight",
    "values": {
      "glucose": 56,
      "creatinine": 1.13,
      "urea_nitrogen_bun": 19,
      "sodium": 141,
      "potassium": 3.7,
      "chloride": 103,
      "calcium": 10.2,
      "alt": 37,
      "ast": 39,
      "albumin": 4.6,
      "crp": 13.74
    }
  },
  {
    "sampleId": "C004_serum_R+1",
    "crewId": "C004",
    "timepoint": "R+1",
    "observedAt": "2021-09-19T14:00:00.000Z",
    "localDate": "2021-09-19",
    "missionPhase": "postflight",
    "values": {
      "glucose": 97,
      "creatinine": 1.15,
      "urea_nitrogen_bun": 26,
      "sodium": 140,
      "potassium": 4,
      "chloride": 105,
      "calcium": 9.8,
      "alt": 40,
      "ast": 48,
      "albumin": 4.5,
      "crp": 17.7
    }
  },
  {
    "sampleId": "C004_serum_R+45",
    "crewId": "C004",
    "timepoint": "R+45",
    "observedAt": "2021-11-02T12:00:00.000Z",
    "localDate": "2021-11-02",
    "missionPhase": "postflight",
    "values": {
      "glucose": 43,
      "creatinine": 1.08,
      "urea_nitrogen_bun": 21,
      "sodium": 139,
      "potassium": 5.9,
      "chloride": 102,
      "calcium": 9.8,
      "alt": 32,
      "ast": 33,
      "albumin": 4.5,
      "crp": 22.41
    }
  },
  {
    "sampleId": "C004_serum_R+82",
    "crewId": "C004",
    "timepoint": "R+82",
    "observedAt": "2021-12-09T12:00:00.000Z",
    "localDate": "2021-12-09",
    "missionPhase": "postflight",
    "values": {
      "glucose": 80,
      "creatinine": 1.11,
      "urea_nitrogen_bun": 16,
      "sodium": 140,
      "potassium": 4.2,
      "chloride": 103,
      "calcium": 10,
      "alt": 23,
      "ast": 25,
      "albumin": 4.6,
      "crp": 7.9
    }
  },
  {
    "sampleId": "C004_serum_R+194",
    "crewId": "C004",
    "timepoint": "R+194",
    "observedAt": "2022-03-31T12:00:00.000Z",
    "localDate": "2022-03-31",
    "missionPhase": "postflight",
    "values": {
      "glucose": 84,
      "creatinine": 1.31,
      "urea_nitrogen_bun": 27,
      "sodium": 141,
      "potassium": 3.8,
      "chloride": 105,
      "calcium": 9.8,
      "alt": 43,
      "ast": 38,
      "albumin": 4.3,
      "crp": 46.01
    }
  }
] as const;

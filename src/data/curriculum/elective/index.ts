import type { CurriculumIndicatorRecord } from '../types';
import {
  BOTANICAL_GRADES,
  BOTANICAL_OUTCOMES_BY_GRADE,
  BOTANICAL_STANDARDS,
  OCCUPATION_BASIC_GRADES,
  OCCUPATION_BASIC_STANDARDS,
  type ElectiveStandardDef,
} from './electiveSource';
import {
  BOTANICAL_SUBJECT,
  OCCUPATION_BASIC_SUBJECT,
} from './standards';

function formatIndicator(code: string, text: string): string {
  return `${code} ${text}`.replace(/\s+/g, ' ').trim();
}

function resolveIndicatorCode(
  standardCode: string,
  gradeLevel: string,
  indicator: ElectiveStandardDef['indicators'][number],
): string {
  if ('code' in indicator) return indicator.code;
  return `${standardCode} ${gradeLevel}/${indicator.seq}`;
}

function expandElective(
  subject: string,
  grades: typeof BOTANICAL_GRADES,
  standards: ElectiveStandardDef[],
  idPrefix: string,
): CurriculumIndicatorRecord[] {
  const rows: CurriculumIndicatorRecord[] = [];
  let seq = 0;

  for (const gradeLevel of grades) {
    for (const standard of standards) {
      for (const indicator of standard.indicators) {
        seq += 1;
        const indicatorCode = resolveIndicatorCode(standard.code, gradeLevel, indicator);
        rows.push({
          id: `${idPrefix}-${gradeLevel}-${seq}`,
          learningArea: 'การงานอาชีพ',
          subject,
          gradeLevel,
          strandNo: standard.strandNo,
          strandName: standard.strandName,
          standardCode: standard.code,
          standardDescription: standard.description,
          midwayIndicator: null,
          exitIndicator: formatIndicator(indicatorCode, indicator.text),
          learningAreaNote: null,
        });
      }
    }
  }

  return rows;
}

function buildBotanicalCurriculum(): CurriculumIndicatorRecord[] {
  const rows: CurriculumIndicatorRecord[] = [];

  for (const gradeLevel of BOTANICAL_GRADES) {
    const indicatorCountByStrand = new Map<number, number>();
    for (const outcome of BOTANICAL_OUTCOMES_BY_GRADE[gradeLevel]) {
      const standard = BOTANICAL_STANDARDS.find((item) => item.strandNo === outcome.strandNo);
      if (!standard) continue;

      const indicatorNo = (indicatorCountByStrand.get(outcome.strandNo) ?? 0) + 1;
      indicatorCountByStrand.set(outcome.strandNo, indicatorNo);
      const indicatorCode = `${standard.code} ${gradeLevel}/${indicatorNo}`;
      rows.push({
        id: `elec-bot-${gradeLevel}-${outcome.strandNo}-${indicatorNo}`,
        learningArea: 'วิทยาศาสตร์และเทคโนโลยี',
        subject: BOTANICAL_SUBJECT,
        gradeLevel,
        strandNo: standard.strandNo,
        strandName: standard.strandName,
        standardCode: standard.code,
        standardDescription: standard.description,
        midwayIndicator: null,
        exitIndicator: formatIndicator(indicatorCode, outcome.text),
        learningAreaNote: 'อ้างอิงหลักสูตรสวนพฤกษศาสตร์โรงเรียน ปรับปรุง 2568',
      });
    }
  }

  return rows;
}

export const botanicalElectiveCurriculum = buildBotanicalCurriculum();

export const occupationBasicElectiveCurriculum = expandElective(
  OCCUPATION_BASIC_SUBJECT,
  OCCUPATION_BASIC_GRADES,
  OCCUPATION_BASIC_STANDARDS,
  'elec-occ',
);

export const electiveCurriculum: CurriculumIndicatorRecord[] = [
  ...botanicalElectiveCurriculum,
  ...occupationBasicElectiveCurriculum,
];

export {
  BOTANICAL_SUBJECT,
  OCCUPATION_BASIC_SUBJECT,
} from './standards';

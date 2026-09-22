import mathData from './mathData.json';
import type { CurriculumGradeLevel, CurriculumIndicatorRecord } from '../types';
import { mathStrandFromStandard } from '../utils';
import { MATH_STANDARD_DESCRIPTIONS } from './standards';

interface MathSourceRow {
  gradeLevel: CurriculumGradeLevel;
  standardCode: string;
  indicatorType: 'midway' | 'exit';
  text: string;
}

/**
 * ข้อมูลคณิตศาสตร์ ป.1-ม.6 จากหลักสูตรสถานศึกษา พ.ศ. 2568
 * ใช้แหล่งข้อมูลเดียวครบทุกชั้น เพื่อไม่ให้ข้อมูลจากชุดเดิมซ้อนหรือขาดหาย
 */
export const mathCurriculum: CurriculumIndicatorRecord[] = (mathData as MathSourceRow[]).map(
  (source, index) => {
    const strand = mathStrandFromStandard(source.standardCode);
    return {
      id: `math-2568-${index + 1}`,
      learningArea: 'คณิตศาสตร์',
      subject: 'คณิตศาสตร์',
      gradeLevel: source.gradeLevel,
      strandNo: strand.strandNo,
      strandName: strand.strandName,
      standardCode: source.standardCode,
      standardDescription: MATH_STANDARD_DESCRIPTIONS[source.standardCode] ?? '',
      midwayIndicator: source.indicatorType === 'midway' ? source.text : null,
      exitIndicator: source.indicatorType === 'exit' ? source.text : null,
      learningAreaNote: null,
    };
  },
);

export { MATH_STANDARD_DESCRIPTIONS } from './standards';

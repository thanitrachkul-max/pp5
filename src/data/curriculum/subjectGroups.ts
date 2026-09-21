import type { CurriculumIndicatorRecord } from './types';

export const SOCIAL_COMBINED_SUBJECT = 'สังคมศึกษา ศาสนา และวัฒนธรรม';
export const SOCIAL_HISTORY_SUBJECT = 'ประวัติศาสตร์';
export const SOCIAL_GEOGRAPHY_SUBJECT = 'ภูมิศาสตร์';
export const ART_COMBINED_SUBJECT = 'ศิลปะ';

function normalizeSubjectText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, '').replace(/ฯ/g, '').toLowerCase();
}

export function canonicalCurriculumSubjectName(
  learningArea: string,
  subject: string | null | undefined,
): string {
  const trimmedSubject = subject?.trim() ?? '';
  const normalizedArea = normalizeSubjectText(learningArea);
  const normalizedSubject = normalizeSubjectText(trimmedSubject);

  if (normalizedArea.includes('สังคมศึกษา')) {
    if (normalizedSubject.includes('ประวัติ')) return SOCIAL_HISTORY_SUBJECT;
    if (normalizedSubject.includes('ภูมิ')) return SOCIAL_GEOGRAPHY_SUBJECT;
    if (
      !normalizedSubject ||
      normalizedSubject.includes('สังคมศึกษา') ||
      normalizedSubject.includes('ศาสนา') ||
      normalizedSubject.includes('ศีลธรรม') ||
      normalizedSubject.includes('จริยธรรม') ||
      normalizedSubject.includes('หน้าที่พลเมือง') ||
      normalizedSubject.includes('วัฒนธรรม') ||
      normalizedSubject.includes('เศรษฐ')
    ) {
      return SOCIAL_COMBINED_SUBJECT;
    }
  }

  if (normalizedArea === normalizeSubjectText(ART_COMBINED_SUBJECT)) {
    return ART_COMBINED_SUBJECT;
  }

  return trimmedSubject || learningArea;
}

export function canonicalizeCurriculumRecordSubject<T extends CurriculumIndicatorRecord>(record: T): T {
  const subject = canonicalCurriculumSubjectName(record.learningArea, record.subject);
  return subject === record.subject ? record : { ...record, subject };
}

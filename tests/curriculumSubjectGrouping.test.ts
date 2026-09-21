import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CURRICULUM_GRADE_LEVELS,
  getCurriculumRecords,
  getCurriculumSubjectOptions,
} from '../src/data/curriculum';

const SOCIAL_AREA = 'สังคมศึกษา ศาสนา และวัฒนธรรม';

test('social curriculum combines strands 1-3 and keeps history and geography separate at every grade', () => {
  assert.deepEqual(getCurriculumSubjectOptions(SOCIAL_AREA), [
    SOCIAL_AREA,
    'ประวัติศาสตร์',
    'ภูมิศาสตร์',
  ]);

  for (const gradeLevel of CURRICULUM_GRADE_LEVELS) {
    const combinedStrands = new Set(
      getCurriculumRecords({ learningArea: SOCIAL_AREA, subject: SOCIAL_AREA, gradeLevel })
        .map((row) => row.strandNo),
    );
    assert.deepEqual([...combinedStrands].sort(), [1, 2, 3]);
    assert.deepEqual(
      [...new Set(getCurriculumRecords({ learningArea: SOCIAL_AREA, subject: 'ประวัติศาสตร์', gradeLevel }).map((row) => row.strandNo))],
      [4],
    );
    assert.deepEqual(
      [...new Set(getCurriculumRecords({ learningArea: SOCIAL_AREA, subject: 'ภูมิศาสตร์', gradeLevel }).map((row) => row.strandNo))],
      [5],
    );
  }
});

test('legacy social subject names resolve to the combined social subject', () => {
  for (const subject of [
    'ศาสนา ศีลธรรม จริยธรรม',
    'หน้าที่พลเมือง วัฒนธรรม และการดำเนินชีวิตในสังคม',
    'เศรษฐศาสตร์',
  ]) {
    const strands = new Set(
      getCurriculumRecords({ learningArea: SOCIAL_AREA, subject, gradeLevel: 'ม.1' })
        .map((row) => row.strandNo),
    );
    assert.deepEqual([...strands].sort(), [1, 2, 3]);
  }
});

test('art curriculum exposes one subject containing all three art strands', () => {
  assert.deepEqual(getCurriculumSubjectOptions('ศิลปะ'), ['ศิลปะ']);

  const allStrands = new Set<number>();
  for (const gradeLevel of CURRICULUM_GRADE_LEVELS) {
    const rows = getCurriculumRecords({ learningArea: 'ศิลปะ', subject: 'ศิลปะ', gradeLevel });
    assert.ok(rows.length > 0, `expected art curriculum rows for ${gradeLevel}`);
    assert.ok(rows.every((row) => row.subject === 'ศิลปะ'));
    rows.forEach((row) => allStrands.add(row.strandNo));
  }

  assert.deepEqual([...allStrands].sort(), [1, 2, 3]);
});

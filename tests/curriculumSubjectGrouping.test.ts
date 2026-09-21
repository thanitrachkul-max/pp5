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

test('curriculum indicator descriptions keep the complete canonical text', () => {
  const expected = new Map([
    ['ส 1.1 ป.1/3', 'บอกความหมาย ความสำคัญ และเคารพพระรัตนตรัย ปฏิบัติตามหลักธรรมโอวาท ๓ ในพระพุทธศาสนาหรือหลักธรรม ของศาสนาที่ตนนับถือตามที่กำหนด'],
    ['ส 3.1 ป.2/4', 'สรุปผลดีของ การใช้จ่ายที่เหมาะสมกับรายได้ และการออม'],
    ['ส 2.1 ม.1/3', 'อภิปรายเกี่ยวกับ คุณค่าทางวัฒนธรรมที่เป็นปัจจัย ในการสร้างความสัมพันธ์ที่ดีหรือ อาจนำไปสู่ความเข้าใจผิดต่อกัน'],
    ['ส 2.1 ม.1/4', 'แสดงออกถึง การเคารพในสิทธิเสรีภาพของ ตนเองและผู้อื่น'],
    ['ส 2.2 ม.1/3', 'ปฏิบัติตนตาม บทบัญญัติของรัฐธรรมนูญ แห่งราชอาณาจักรไทยฉบับปัจจุบัน ที่เกี่ยวข้องกับตนเอง'],
  ]);

  const socialRows = getCurriculumRecords({
    learningArea: 'สังคมศึกษา ศาสนา และวัฒนธรรม',
  });

  for (const [code, description] of expected) {
    const row = socialRows.find((candidate) =>
      (candidate.midwayIndicator ?? candidate.exitIndicator)?.startsWith(`${code} `),
    );
    assert.ok(row, `expected curriculum row for ${code}`);
    assert.equal(row.midwayIndicator ?? row.exitIndicator, `${code} ${description}`);
  }
});

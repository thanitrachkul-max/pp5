import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CURRICULUM_GRADE_LEVELS,
  getCurriculumLearningAreas,
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

test('Thai secondary curriculum includes every official midway and exit indicator', () => {
  for (const [gradeLevel, count, midway, exit] of [
    ['ม.2', 32, 22, 10],
    ['ม.3', 36, 26, 10],
    ['ม.4', 36, 23, 13],
    ['ม.5', 36, 23, 13],
    ['ม.6', 36, 23, 13],
  ] as const) {
    const rows = getCurriculumRecords({ learningArea: 'ภาษาไทย', subject: 'ภาษาไทย', gradeLevel });
    assert.equal(rows.length, count, gradeLevel);
    assert.equal(rows.filter((row) => row.midwayIndicator).length, midway, gradeLevel);
    assert.equal(rows.filter((row) => row.exitIndicator).length, exit, gradeLevel);
    assert.ok(rows.every((row) => row.standardDescription && (row.midwayIndicator || row.exitIndicator)));
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

test('math curriculum contains every grade and all 120 indicators from the 2568 school curriculum', () => {
  const expectedCountByGrade = new Map([
    ['ป.1', 8],
    ['ป.2', 12],
    ['ป.3', 15],
    ['ป.4', 19],
    ['ป.5', 17],
    ['ป.6', 20],
    ['ม.1', 6],
    ['ม.2', 8],
    ['ม.3', 7],
    ['ม.4', 3],
    ['ม.5', 4],
    ['ม.6', 1],
  ]);

  let total = 0;
  for (const [gradeLevel, expectedCount] of expectedCountByGrade) {
    const rows = getCurriculumRecords({ learningArea: 'คณิตศาสตร์', gradeLevel });
    assert.equal(rows.length, expectedCount, `unexpected math indicator count for ${gradeLevel}`);
    assert.ok(rows.every((row) => row.standardDescription.length > 0));
    total += rows.length;
  }
  assert.equal(total, 120);

  const primaryFive = getCurriculumRecords({ learningArea: 'คณิตศาสตร์', gradeLevel: 'ป.5' });
  assert.ok(primaryFive.some((row) => row.midwayIndicator?.startsWith('ค 1.1 ป.5/1')));
  assert.ok(primaryFive.some((row) => row.exitIndicator === 'ค 1.1 ป.5/2 แสดงวิธีหาคำตอบของโจทย์ปัญหาโดยใช้บัญญัติไตรยางศ์'));
  assert.ok(primaryFive.some((row) => row.exitIndicator?.startsWith('ค 3.1 ป.5/2')));

  const upperSecondary = ['ม.4', 'ม.5', 'ม.6']
    .flatMap((gradeLevel) => getCurriculumRecords({ learningArea: 'คณิตศาสตร์', gradeLevel }));
  const upperSecondaryText = upperSecondary
    .flatMap((row) => [row.midwayIndicator, row.exitIndicator])
    .filter(Boolean)
    .join('\n');
  for (const code of [
    'ค 1.1 ม.4/1',
    'ค 3.2 ม.4/1',
    'ค 3.2 ม.4/2',
    'ค 1.1 ม.5/1',
    'ค 1.2 ม.5/1',
    'ค 1.2 ม.5/2',
    'ค 1.3 ม.5/1',
    'ค 3.1 ม.6/1',
  ]) {
    assert.ok(upperSecondaryText.includes(code), `expected upper-secondary indicator ${code}`);
  }
});

test('additional curriculum places school subjects in their core learning areas', () => {
  assert.ok(!getCurriculumLearningAreas().includes('กลุ่มสาระการเรียนรู้เพิ่มเติม'));
  assert.equal(
    getCurriculumRecords({ learningArea: 'วิทยาศาสตร์และเทคโนโลยี' })
      .some((row) => row.subject.includes('สวนพฤกษศาสตร์')),
    true,
  );
  assert.equal(
    getCurriculumRecords({ learningArea: 'การงานอาชีพ' })
      .some((row) => row.subject === 'พื้นฐานอาชีพ'),
    true,
  );
});

test('botanical outcomes match the 2568 school curriculum count and grade progression', () => {
  const expectedCountByGrade = new Map([
    ['ป.1', 5], ['ป.2', 5], ['ป.3', 5], ['ป.4', 5], ['ป.5', 5], ['ป.6', 5],
    ['ม.1', 16], ['ม.2', 18], ['ม.3', 19], ['ม.4', 23], ['ม.5', 28], ['ม.6', 34],
  ]);

  for (const [gradeLevel, expectedCount] of expectedCountByGrade) {
    const rows = getCurriculumRecords({
      learningArea: 'วิทยาศาสตร์และเทคโนโลยี',
      subject: 'สวนพฤกษศาสตร์ในโรงเรียน',
      gradeLevel,
    });
    assert.equal(rows.length, expectedCount, `unexpected botanical outcome count for ${gradeLevel}`);
    assert.ok(rows.every((row) => row.learningArea === 'วิทยาศาสตร์และเทคโนโลยี'));
  }

  const m6 = getCurriculumRecords({
    learningArea: 'วิทยาศาสตร์และเทคโนโลยี',
    subject: 'สวนพฤกษศาสตร์ในโรงเรียน',
    gradeLevel: 'ม.6',
  });
  assert.ok(m6.some((row) => row.exitIndicator?.includes('ตรวจสอบความถูกต้องทางวิชาการด้านพฤกษศาสตร์')));
  assert.ok(m6.some((row) => row.exitIndicator?.includes('ใช้ ดูแลรักษา และพัฒนาแหล่งเรียนรู้')));
});

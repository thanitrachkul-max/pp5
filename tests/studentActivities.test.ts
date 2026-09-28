import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attendanceDateKey,
  attendanceGridDates,
  buildSegmentedAttendanceSchedule,
} from '../src/lib/attendanceSchedule.ts';
import { classLevelFromCode, GUIDANCE_OBJECTIVES, SCOUT_UNITS } from '../src/data/studentActivityCurriculum.ts';
import {
  ACTIVITY_TOTAL_HOURS,
  activityApprovalPreventsSubmission,
  activityAssessmentDefinitions,
  activityAttendancePeriod,
  activityCoverSummary,
  activityResultCell,
  activityStudyPeriod,
  activitySummaryRow,
  assessmentYearResult,
  buildActivityGeneralInfo,
  clearAssessmentKind,
  computeActivityStats,
  definitionItemKeys,
  emptyActivityAssessments,
  fillAssessmentMarks,
  fillResultOverrides,
  longClassroomName,
  normalizeActivityAssessments,
  setAssessmentMark,
  setResultOverride,
  thaiFullDate,
  toggleSummaryResult,
  type ActivityAssessments,
  type ActivityKind,
  type StudentActivityData,
} from '../src/lib/studentActivities.ts';
import {
  getActivityStudyMonths,
  getStudentActivityPrintPageSpecs,
  splitActivityItems,
} from '../src/utils/studentActivityPrintLayout.ts';

function generalInfo(classroomName = 'ม.1/4', classLevelCode = 'ม.1') {
  return buildActivityGeneralInfo({
    schoolName: 'โรงเรียนกาฬสินธุ์ปัญญานุกูล จังหวัดกาฬสินธุ์',
    classroomName,
    classLevelCode,
    yearBe: 2569,
    homeroomTeachers: ['นาย ครู หนึ่ง', '', 'นาง ครู สาม'],
    studyStartDate: '2026-05-16',
    studyEndDate: '2027-03-31',
    semester1EndDate: '2026-10-11',
    semester2StartDate: '2026-11-01',
  });
}

function sampleData(studentCount = 2): StudentActivityData {
  return {
    generalInfo: generalInfo(),
    students: Array.from({ length: studentCount }, (_, index) => ({
      id: `s${index + 1}`,
      studentId: String(index + 1),
      name: `เด็กชาย ทดสอบ ${index + 1}`,
    })),
    attendance: {},
    assessments: emptyActivityAssessments(),
  };
}

const definitions = activityAssessmentDefinitions(generalInfo());
const keysOf = (kind: ActivityKind) => definitionItemKeys(definitions[kind]);

function passAllActivities(assessments: ActivityAssessments, studentIds: string[]) {
  let next = assessments;
  for (const kind of ['guidance', 'scout', 'club', 'social'] as const) {
    next = fillAssessmentMarks(next, kind, keysOf(kind), studentIds, 'ผ');
  }
  return next;
}

test('guidance and scout items follow the curriculum of the classroom level', () => {
  assert.equal(classLevelFromCode('ม.1/4'), 'ม.1');
  assert.equal(classLevelFromCode('ป. 3'), 'ป.3');
  assert.equal(classLevelFromCode('อนุบาล 2'), '');

  assert.equal(keysOf('guidance').length, GUIDANCE_OBJECTIVES['ม.1'].items.length);
  assert.equal(keysOf('guidance').length, 31);
  assert.equal(definitions.guidance.groups[0].label, 'จุดประสงค์ชั้นปี');
  assert.equal(definitions.guidance.groups[0].items[0].label, '1. รับรู้ความเปลี่ยนแปลงด้านร่างกายตามวัย');
  assert.equal(keysOf('scout').length, 10);
  assert.match(definitions.scout.groups[0].label, /ลูกเสือโลก/);
  assert.equal(keysOf('club').length, 15);
  assert.equal(keysOf('social').length, 15);

  const primary = activityAssessmentDefinitions(generalInfo('ป.1/1', 'ป.1'));
  assert.equal(definitionItemKeys(primary.guidance).length, 13);
  assert.equal(definitionItemKeys(primary.scout).length, SCOUT_UNITS['ป.1'].items.length);
  assert.equal(definitionItemKeys(primary.scout).length, 12);

  const rover = activityAssessmentDefinitions(generalInfo('ม.6/1', ''));
  assert.equal(definitionItemKeys(rover.scout).length, 10, 'ม.6 falls back to the level in the classroom name');
  assert.equal(rover.scout.groups[0].label, 'หน่วยการเรียนรู้ ลูกเสือวิสามัญ');

  for (const [level, curriculum] of Object.entries(GUIDANCE_OBJECTIVES)) {
    assert.ok(curriculum.items.length >= 10, `${level} has guidance objectives`);
    assert.ok(curriculum.items.every((item) => item.text.trim()), `${level} objectives are not blank`);
  }

  const unknown = activityAssessmentDefinitions(generalInfo('อนุบาล 2', ''));
  assert.deepEqual(unknown.guidance.groups, []);
  assert.equal(assessmentYearResult({}, definitionItemKeys(unknown.guidance)).result, null);
});

test('year-end results need every item and pass from 50 percent', () => {
  const keys = keysOf('club');
  const partial = Object.fromEntries(keys.slice(0, 14).map((key) => [key, 'ผ' as const]));
  assert.equal(assessmentYearResult(partial, keys).result, null);

  const passing = Object.fromEntries(keys.map((key, index) => [key, index < 8 ? 'ผ' as const : 'มผ' as const]));
  assert.equal(assessmentYearResult(passing, keys).result, 'ผ่าน');

  const failing = Object.fromEntries(keys.map((key, index) => [key, index < 7 ? 'ผ' as const : 'มผ' as const]));
  assert.equal(assessmentYearResult(failing, keys).result, 'ไม่ผ่าน');
});

test('overall activity result passes only when all four activities pass', () => {
  let data = sampleData();
  data = { ...data, assessments: passAllActivities(data.assessments, ['s1', 's2']) };
  data = { ...data, assessments: clearAssessmentKind(data.assessments, 'scout') };
  data = { ...data, assessments: fillAssessmentMarks(data.assessments, 'scout', keysOf('scout'), ['s1'], 'ผ') };

  assert.equal(activitySummaryRow(data, 's1').overall, 'ผ่าน');
  assert.equal(activitySummaryRow(data, 's2').overall, null, 'scout result is still missing');

  data = { ...data, assessments: fillAssessmentMarks(data.assessments, 'scout', keysOf('scout'), ['s2'], 'มผ') };
  assert.equal(activitySummaryRow(data, 's2').activities.scout.result, 'ไม่ผ่าน');
  assert.equal(activitySummaryRow(data, 's2').overall, 'ไม่ผ่าน');
  assert.deepEqual(activityCoverSummary(data), {
    totalStudents: 2,
    passed: 1,
    failed: 1,
    pending: 0,
    passedPercent: 50,
  });

  data = { ...data, assessments: setAssessmentMark(data.assessments, 'club', 's1', 'c1_1', null) };
  assert.equal(activitySummaryRow(data, 's1').activities.club.result, null);
  assert.equal(activitySummaryRow(data, 's1').overall, null);
});

test('teachers can set any activity result in the summary and click again to undo it', () => {
  let assessments = fillAssessmentMarks(emptyActivityAssessments(), 'club', keysOf('club'), ['s1'], 'ผ');
  let cell = activityResultCell(assessments, definitions.club, 's1');
  assert.deepEqual([cell.result, cell.derived, cell.override], ['ผ่าน', 'ผ่าน', null]);

  assert.equal(toggleSummaryResult(assessments, cell, 's1', 'club', 'ผ่าน'), assessments, 'clicking a derived result keeps it');

  assessments = toggleSummaryResult(assessments, cell, 's1', 'club', 'ไม่ผ่าน');
  cell = activityResultCell(assessments, definitions.club, 's1');
  assert.deepEqual([cell.result, cell.derived, cell.override], ['ไม่ผ่าน', 'ผ่าน', 'ไม่ผ่าน']);

  assessments = toggleSummaryResult(assessments, cell, 's1', 'club', 'ไม่ผ่าน');
  cell = activityResultCell(assessments, definitions.club, 's1');
  assert.deepEqual([cell.result, cell.override], ['ผ่าน', null], 'clicking the manual result again returns to the items');

  // Students without complete item marks can still receive a result (the cells used to be read-only).
  let guidance = activityResultCell(assessments, definitions.guidance, 's2');
  assert.equal(guidance.result, null);
  assessments = toggleSummaryResult(assessments, guidance, 's2', 'guidance', 'ผ่าน');
  guidance = activityResultCell(assessments, definitions.guidance, 's2');
  assert.deepEqual([guidance.result, guidance.override], ['ผ่าน', 'ผ่าน']);

  assessments = fillResultOverrides(assessments, ['scout', 'social'], ['s2'], 'ไม่ผ่าน');
  assert.deepEqual(assessments.results.s2, { guidance: 'ผ่าน', scout: 'ไม่ผ่าน', social: 'ไม่ผ่าน' });

  assessments = clearAssessmentKind(assessments, 'scout');
  assert.deepEqual(assessments.results.s2, { guidance: 'ผ่าน', social: 'ไม่ผ่าน' }, 'clearing a tab clears its manual results');
  assessments = setResultOverride(assessments, 's2', 'guidance', null);
  assert.deepEqual(assessments.results.s2, { social: 'ไม่ผ่าน' });
});

test('attendance below 80 percent fails the overall result once a schedule exists', () => {
  let data = sampleData();
  const assessments = passAllActivities(data.assessments, ['s1']);
  const hoursMap = { '05-18': '1-60', '11-02': '61-120' };
  data = { ...data, assessments, attendance: { hoursMap, records: { s1: { '05-18': '/' } } } };

  const row = activitySummaryRow(data, 's1');
  assert.equal(row.attendanceShort, true);
  assert.equal(row.attendancePercent, 50);
  assert.equal(row.overall, 'ไม่ผ่าน');

  data = { ...data, attendance: { hoursMap, records: { s1: { '05-18': '/', '11-02': '/' } } } };
  assert.equal(activitySummaryRow(data, 's1').overall, 'ผ่าน');
});

test('the study period covers the whole year and skips the October break', () => {
  assert.deepEqual(activityStudyPeriod({ yearBe: 2569 }), {
    start: '2026-05-16',
    end: '2027-03-31',
    semester1End: '2026-09-30',
    semester2Start: '2026-11-01',
  });
  assert.equal(activityStudyPeriod({ yearBe: 2569, semester1EndDate: '2026-09-25' }).semester1End, '2026-09-25');
  assert.equal(activityStudyPeriod({ yearBe: '2569', studyStartDate: '2569-05-18' }).start, '2026-05-18');

  const period = activityAttendancePeriod(generalInfo());
  assert.equal(period.totalHours, ACTIVITY_TOTAL_HOURS);
  assert.equal(period.hoursPerWeek, 3);
  assert.deepEqual(period.segments, [
    { startDate: '2026-05-16', endDate: '2026-09-30' },
    { startDate: '2026-11-01', endDate: '2027-03-31' },
  ]);
  assert.match(period.note ?? '', /1 ตุลาคม 2569 – 31 ตุลาคม 2569/);
  assert.equal(thaiFullDate(generalInfo().approvalDate), '31 มีนาคม 2570');
});

test('annual attendance schedules 120 numbered hours inside both semesters', () => {
  const holidays = { '06-01': 'หยุด', '06-03': 'หยุด', '07-28': 'หยุด', '07-29': 'หยุด', '07-30': 'หยุด', '08-12': 'หยุด', '12-10': 'หยุด' };
  const segments = [
    { startDate: new Date(2026, 4, 16), endDate: new Date(2026, 8, 30) },
    { startDate: new Date(2026, 10, 1), endDate: new Date(2027, 2, 31) },
  ];
  const plan = buildSegmentedAttendanceSchedule({
    segments,
    schedule: [
      { dayOfWeek: 1, hours: 1 },
      { dayOfWeek: 3, hours: 1 },
      { dayOfWeek: 5, hours: 1 },
    ],
    holidays,
    totalHours: 120,
  });

  assert.equal(plan.scheduleDays.reduce((sum, day) => sum + day.hours, 0), 120);
  const labels = plan.scheduleDays.map((day) => plan.hoursMap[day.dateKey]);
  assert.equal(labels[0], '1');
  assert.equal(labels.at(-1), '120');
  for (const day of plan.scheduleDays) {
    assert.notEqual(day.date.getMonth(), 9, 'no hours during the October break');
    assert.ok(day.date.getDay() >= 1 && day.date.getDay() <= 5);
    assert.equal(holidays[attendanceDateKey(day.date) as keyof typeof holidays], undefined);
  }
  const semesterOneHours = plan.scheduleDays
    .filter((day) => day.date < new Date(2026, 9, 1))
    .reduce((sum, day) => sum + day.hours, 0);
  assert.equal(semesterOneHours, 60);
});

test('the annual attendance grid keeps whole weeks and leaves out break weeks', () => {
  const dates = attendanceGridDates([
    { startDate: new Date(2026, 4, 16), endDate: new Date(2026, 8, 30) },
    { startDate: new Date(2026, 10, 1), endDate: new Date(2027, 2, 31) },
  ]);
  assert.equal(dates.length % 5, 0);
  assert.equal(attendanceDateKey(dates[0]), '05-18');
  assert.equal(dates[0].getDay(), 1);
  assert.ok(!dates.some((date) => date.getMonth() === 9 && date.getDate() > 2), 'October weeks are skipped');
  assert.equal(attendanceDateKey(dates.at(-1)!), '04-02');
  assert.equal(new Set(dates.map(attendanceDateKey)).size, dates.length, 'date keys stay unique across the year');
});

test('saved assessments keep only known items and results, including first-version records', () => {
  const normalized = normalizeActivityAssessments({
    clubName: 'ชุมนุมดนตรี',
    guidance: { s1: { g1: 'ผ', g31: 'มผ', gx: 'ผ', c1_1: 'ผ' } },
    scout: { s1: { u10: 'ผ', u0: 'ผ' } },
    club: { s1: { c1_1: 'ผ', unknown: 'ผ', c1_2: 'x' } },
    social: 'broken',
    results: { s1: { guidance: 'ผ่าน', scout: 'maybe', club: 'ไม่ผ่าน' }, s2: 'bad' },
  });
  assert.deepEqual(normalized, {
    clubName: 'ชุมนุมดนตรี',
    guidance: { s1: { g1: 'ผ', g31: 'มผ' } },
    scout: { s1: { u10: 'ผ' } },
    club: { s1: { c1_1: 'ผ' } },
    social: {},
    results: { s1: { guidance: 'ผ่าน', club: 'ไม่ผ่าน' } },
  });
});

test('completion reaches 100 percent only when attendance and every activity result are recorded', () => {
  let data = sampleData();
  assert.equal(computeActivityStats(data).completionPercent, 0);

  data = { ...data, assessments: passAllActivities(data.assessments, ['s1', 's2']) };
  assert.equal(computeActivityStats(data).completionPercent, 80, 'attendance is still missing');

  data = {
    ...data,
    attendance: { hoursMap: { '05-18': '1-120' }, records: { s1: { '05-18': '/' }, s2: { '05-18': '/' } } },
  };
  let stats = computeActivityStats(data);
  assert.equal(stats.completionPercent, 100);
  assert.equal(stats.passedCount, 2);

  data = { ...data, assessments: setAssessmentMark(data.assessments, 'guidance', 's2', 'g31', null) };
  stats = computeActivityStats(data);
  assert.equal(stats.completionPercent, 99, 'one missing item keeps the record below 100 percent');

  data = { ...data, assessments: setResultOverride(data.assessments, 's2', 'guidance', 'ผ่าน') };
  assert.equal(computeActivityStats(data).completionPercent, 100, 'a manual result completes the activity');
});

test('submitted or approved records prevent duplicate submission', () => {
  assert.equal(activityApprovalPreventsSubmission(null), false);
  assert.equal(activityApprovalPreventsSubmission('revision_requested'), false);
  assert.equal(activityApprovalPreventsSubmission('pending'), true);
  assert.equal(activityApprovalPreventsSubmission('approved'), true);
});

test('print pages follow the ปพ.5 layout: 2 months per attendance page and 12 students per assessment page', () => {
  assert.deepEqual(splitActivityItems(31), [[0, 11], [11, 21], [21, 31]]);
  assert.deepEqual(splitActivityItems(15), [[0, 15]]);
  assert.deepEqual(splitActivityItems(0), [[0, 0]]);

  const data = sampleData(12);
  assert.deepEqual(getActivityStudyMonths(data), [5, 6, 7, 8, 9, 11, 12, 1, 2, 3]);

  const specs = getStudentActivityPrintPageSpecs(data);
  assert.deepEqual(
    specs.map((spec) => spec.id),
    [
      'cover',
      'attendance-1', 'attendance-2', 'attendance-3', 'attendance-4', 'attendance-5', 'attendance-6',
      'attendance-summary',
      'guidance', 'guidance-2', 'guidance-3',
      'scout',
      'club',
      'social',
      'summary',
      'instructions-1', 'instructions-2', 'instructions-3', 'instructions-4',
    ],
  );
  assert.equal(specs[0].orientation, 'portrait');
  assert.equal(specs.at(-1)!.orientation, 'portrait');
  assert.ok(specs.slice(1, -4).every((spec) => spec.orientation === 'landscape'));

  const larger = getStudentActivityPrintPageSpecs(sampleData(16));
  assert.equal(larger.filter((spec) => spec.id.startsWith('guidance')).length, 6, '3 item pages × 2 student pages');
  assert.deepEqual(larger.filter((spec) => spec.id.startsWith('summary')).map((spec) => spec.id), ['summary', 'summary-2']);
  assert.equal(new Set(larger.map((spec) => spec.id)).size, larger.length, 'page ids are unique');
});

test('classroom names expand to the full Thai level name on the cover', () => {
  assert.equal(longClassroomName('ม.1/4'), 'มัธยมศึกษาปีที่ 1/4');
  assert.equal(longClassroomName('ป.6/1'), 'ประถมศึกษาปีที่ 6/1');
  assert.equal(longClassroomName('ม.3'), 'มัธยมศึกษาปีที่ 3');
  assert.equal(longClassroomName('อนุบาล 2'), 'อนุบาล 2');
  assert.deepEqual(
    [generalInfo().homeroomTeacher1, generalInfo().homeroomTeacher2, generalInfo().homeroomTeacher3],
    ['นาย ครู หนึ่ง', 'นาง ครู สาม', ''],
  );
  assert.equal(generalInfo().headOfActivities, 'นางสาว ธารดี มูลเมือง');
});

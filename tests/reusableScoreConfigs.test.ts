import assert from 'node:assert/strict';
import test from 'node:test';
import { filterReusableScoreConfigs } from '../src/lib/reusableScoreConfigs';
import type { AppData, ScoreConfig } from '../src/types';

const generalInfo = {
  gradeLevel: 'ม.6/5', semester: '1', academicYear: '2569', subjectCode: 'ว33102',
  subjectName: 'วิทยาการคำนวณ', learningArea: 'วิทยาศาสตร์และเทคโนโลยี', totalHours: '20',
  hoursPerWeek: '1', hoursPerSemester: '20', teacherName: '', teacherName2: '', teacherName3: '',
  homeroomTeacher1: '', homeroomTeacher2: '', homeroomTeacher3: '', homeroomTeachers: '',
  headOfLearningArea: '', headOfEvaluation: '', deputyDirector: '', schoolDirector: '', approvalDate: '',
} satisfies AppData['generalInfo'];

const config: ScoreConfig = {
  learningArea: generalInfo.learningArea,
  subjectName: generalInfo.subjectName,
  subjectCode: generalInfo.subjectCode,
  standard: 'ว 4.2',
  selectedIndicators: ['ว 4.2 ม.6/1'],
  storedScore: 70,
  units: [{ name: 'การแก้ปัญหา', indicators: [{ code: 'ว 4.2 ม.6/1', fullScore: 70, passingScore: 35 }] }],
};

test('keeps only saved configs for the same subject, area, year and semester', () => {
  const rows = [
    { id: 'current', updated_at: '2026-09-22', general_info: generalInfo, score_config: config },
    { id: 'same', updated_at: '2026-09-21', general_info: { ...generalInfo, gradeLevel: 'ม.6/1' }, score_config: config },
    { id: 'other-subject', updated_at: '2026-09-20', general_info: { ...generalInfo, subjectCode: 'ว33101' }, score_config: { ...config, subjectCode: 'ว33101' } },
    { id: 'other-area', updated_at: '2026-09-19', general_info: { ...generalInfo, learningArea: 'คณิตศาสตร์' }, score_config: { ...config, learningArea: 'คณิตศาสตร์' } },
    { id: 'other-year', updated_at: '2026-09-18', general_info: { ...generalInfo, academicYear: '2568' }, score_config: config },
    { id: 'legacy-info', updated_at: '2026-09-17', general_info: {}, score_config: config },
  ];

  const result = filterReusableScoreConfigs(rows, {
    currentGradebookId: 'current',
    generalInfo,
    semesterFullScore: 100,
  });

  assert.deepEqual(result.map(item => item.id), ['same', 'legacy-info']);
  assert.equal(result[0].classroomName, 'ม.6/1');
  assert.equal(result[0].config.units.length, 1);
  assert.equal(result[0].config.units[0].name, 'การแก้ปัญหา');
  assert.equal(result[0].config.units[0].indicators.length, 1);
  assert.deepEqual(result[0].config.units[0].indicators[0], {
    code: 'ว 4.2 ม.6/1',
    fullScore: 70,
    passingScore: 35,
  });
});

test('rejects empty and incompatible 50-point configs', () => {
  const empty = { ...config, selectedIndicators: [], units: [] };
  const primary = { ...config, semesterFullScore: 50 as const, storedScore: 35 };
  const rows = [
    { id: 'empty', updated_at: '2026-09-22', general_info: { ...generalInfo, gradeLevel: 'ม.6/1' }, score_config: empty },
    { id: 'primary', updated_at: '2026-09-21', general_info: { ...generalInfo, gradeLevel: 'ม.6/2' }, score_config: primary },
  ];

  assert.deepEqual(filterReusableScoreConfigs(rows, {
    currentGradebookId: 'current',
    generalInfo,
    semesterFullScore: 100,
  }), []);
});

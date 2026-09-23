import assert from 'node:assert/strict';
import test from 'node:test';
import { constrainScores, examScoreLimits } from '../src/lib/scoreLimits';
import type { ScoreConfig } from '../src/types';

const config = (storedScore: number): ScoreConfig => ({
  learningArea: 'วิทยาศาสตร์และเทคโนโลยี', subjectName: 'วิทยาศาสตร์',
  standard: '', selectedIndicators: ['ว 1.3 ม.3/8'], storedScore,
  units: [{ name: 'หน่วย 1', indicators: [
    { code: 'ว 1.3 ม.3/8', fullScore: 10, passingScore: 5 },
    { code: 'ว 2.1 ม.3/2', fullScore: storedScore - 10, passingScore: 5 },
  ] }],
});

test('every supported stored-score choice makes a 100-point semester', () => {
  for (const storedScore of [60, 70, 80, 90]) {
    const exams = examScoreLimits(config(storedScore));
    assert.equal(exams.storedScore + exams.midterm + exams.final, 100);
    assert.ok(exams.midterm > 0 && exams.final > 0);
  }
  assert.deepEqual(examScoreLimits(config(80)), { storedScore: 80, midterm: 10, final: 10 });
});

test('repairs old over-limit scores while preserving valid values and blanks', () => {
  const scores = {
    studentA: { u0_i0: 11, u0_i1: 70, midterm: 9, final: 18 },
    studentB: { u0_i0: 5, u0_i1: '', midterm: 8, final: 10 },
  };
  const repaired = constrainScores(scores, config(80));
  assert.equal(repaired.changed, 2);
  assert.deepEqual(repaired.scores.studentA, { u0_i0: 10, u0_i1: 70, midterm: 9, final: 10 });
  assert.deepEqual(repaired.scores.studentB, scores.studentB);
  assert.equal(constrainScores(repaired.scores, config(80)).changed, 0);
});

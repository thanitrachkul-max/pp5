import test from 'node:test';
import assert from 'node:assert/strict';
import { gradebookDataResetPayload, resetPrimaryTerm } from '../api/reset-gradebook';

test('clears every teacher-entered gradebook section and submission state', () => {
  const generalInfo = { subjectCode: 'ค16101' } as any;
  const students = [{ id: 'student-1', name: 'นักเรียน' }] as any;
  const result = gradebookDataResetPayload('now', generalInfo, students);

  assert.equal(result.status, 'not_started');
  assert.equal(result.general_info, generalInfo);
  assert.equal(result.students, students);
  assert.deepEqual(result.attendance, {});
  assert.deepEqual(result.scores, {});
  assert.equal(result.score_config, null);
  assert.deepEqual(result.attributes, {});
  assert.deepEqual(result.analytical, {});
  assert.deepEqual(result.indicators, []);
  assert.deepEqual(result.stats, {});
  assert.equal(result.approval_status, null);
  assert.equal(result.approval_reason, null);
});

test('clears only the selected semester in a primary annual gradebook', () => {
  const term2 = { scores: { student: { score: 10 } } };
  const result = resetPrimaryTerm({
    1: { scores: { student: { score: 5 } } },
    2: term2,
  }, 1);

  assert.deepEqual(result['1'], {
    scores: {}, scoreConfig: null, attributes: {}, analytical: {},
  });
  assert.equal(result['2'], term2);
});

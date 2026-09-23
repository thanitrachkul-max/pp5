import assert from 'node:assert/strict';
import test from 'node:test';
import { constrainAssessmentData, parseAssessmentScore } from '../src/lib/assessmentLimits';
import type { AppData } from '../src/types';

test('assessment ratings accept only whole numbers from 0 to 3', () => {
  assert.equal(parseAssessmentScore(''), '');
  for (const score of [0, 1, 2, 3]) assert.equal(parseAssessmentScore(String(score)), score);
  for (const score of ['-1', '3.5', '4', '6', 'Infinity']) assert.equal(parseAssessmentScore(score), null);
});

test('legacy attributes and analytical ratings above 3 are repaired without changing unrelated fields', () => {
  const data = {
    attributes: { student: { attr1_1: 6, attr5_2: 2, unrelated: 9 } },
    analytical: { student: { attr1: 5, attr2: '', attr3: 3 } },
  } as unknown as AppData;
  const repaired = constrainAssessmentData(data);
  assert.equal(repaired.changed, 2);
  assert.deepEqual(repaired.data.attributes.student, { attr1_1: 3, attr5_2: 2, unrelated: 9 });
  assert.deepEqual(repaired.data.analytical.student, { attr1: 3, attr2: '', attr3: 3 });
  assert.equal(constrainAssessmentData(repaired.data).changed, 0);
});

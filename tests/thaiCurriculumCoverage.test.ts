import assert from 'node:assert/strict';
import test from 'node:test';
import { getCurriculumRecords } from '../src/data/curriculum';
import { extractIndicatorCodes } from '../src/data/curriculum/utils';

const EXPECTED_COUNTS = {
  'ม.2': { midway: 22, exit: 10, unique: 32 },
  'ม.3': { midway: 26, exit: 10, unique: 36 },
  'ม.4': { midway: 9, exit: 6, unique: 15 },
  'ม.5': { midway: 8, exit: 6, unique: 14 },
  'ม.6': { midway: 7, exit: 7, unique: 14 },
} as const;

test('Thai curriculum includes complete secondary midway and exit indicators', () => {
  for (const [gradeLevel, expected] of Object.entries(EXPECTED_COUNTS)) {
    const rows = getCurriculumRecords({ learningArea: 'ภาษาไทย', gradeLevel });
    const midway = new Set(rows.flatMap((row) => extractIndicatorCodes(row.midwayIndicator)));
    const exit = new Set(rows.flatMap((row) => extractIndicatorCodes(row.exitIndicator)));

    assert.equal(midway.size, expected.midway, `${gradeLevel} midway indicator count`);
    assert.equal(exit.size, expected.exit, `${gradeLevel} exit indicator count`);
    assert.equal(new Set([...midway, ...exit]).size, expected.unique, `${gradeLevel} unique indicator count`);
    assert.ok(rows.every((row) => row.standardDescription.length > 0), `${gradeLevel} standard descriptions`);
  }
});

test('Thai upper-secondary shared codes retain the ม.4-6 curriculum level', () => {
  const rows = getCurriculumRecords({ learningArea: 'ภาษาไทย', gradeLevel: 'ม.5' });
  const codes = new Set(rows.flatMap((row) => [
    ...extractIndicatorCodes(row.midwayIndicator),
    ...extractIndicatorCodes(row.exitIndicator),
  ]));

  assert.ok([...codes].every((code) => code.includes('ม.4-6/')));
});

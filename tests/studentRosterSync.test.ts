import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeRosterWithSavedState } from '../src/lib/studentRoster';

test('central classroom roster removes stale gradebook students and keeps saved student settings', () => {
  const roster = [
    {
      id: 'student-1',
      studentId: '1001-new',
      citizenId: '1111111111111',
      name: 'เด็กชาย รายชื่อใหม่',
      studentNumber: 1,
    },
    {
      id: 'student-3',
      studentId: '1003',
      citizenId: '3333333333333',
      name: 'เด็กหญิง เพิ่มใหม่',
      studentNumber: 3,
    },
  ];
  const savedStudents = [
    {
      id: 'student-1',
      studentId: '1001-old',
      citizenId: 'old',
      name: 'ชื่อเดิม',
      studentNumber: 1,
      targetPercentage: 80,
    },
    {
      id: 'student-2',
      studentId: '1002',
      citizenId: '2222222222222',
      name: 'เด็กชาย ถูกลบแล้ว',
      studentNumber: 2,
      targetPercentage: 60,
    },
  ];

  const merged = mergeRosterWithSavedState(roster, savedStudents);

  assert.deepEqual(merged, [
    {
      ...roster[0],
      targetPercentage: 80,
    },
    roster[1],
  ]);
});

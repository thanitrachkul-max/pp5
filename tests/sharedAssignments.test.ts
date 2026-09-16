import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignmentGroupKey,
  assignmentTeacherCounts,
  expandSharedAssignmentRows,
  sharedRecordForAssignment,
} from '../src/lib/sharedAssignments.ts';

test('teacher counts use distinct members of the same course group', () => {
  const base = { id: 'a', semester_id: 's', subject_id: 'subject', classroom_id: 'room', teacher_id: 't1' };
  const rows = [base, { ...base, id: 'b', teacher_id: 't2' }, { ...base, id: 'duplicate' }, { ...base, id: 'other-room', classroom_id: 'room2' }];
  assert.equal(assignmentTeacherCounts(rows).get(assignmentGroupKey(base)), 2);
  assert.equal(assignmentTeacherCounts(rows.slice(1)).get(assignmentGroupKey(base)), 2);
  assert.equal(assignmentTeacherCounts([base]).get(assignmentGroupKey(base)), 1);
  assert.equal(assignmentTeacherCounts(rows).get(assignmentGroupKey(rows[3])), 1);
});

test('one timetable row expands to one assignment per unique teacher', () => {
  const labels: Record<string, string> = {
    teacherA: 'ครู ก',
    teacherB: 'ครู ข',
    teacherC: 'ครู ค',
  };
  const rows = expandSharedAssignmentRows(
    { semester_id: 'semester', subject_id: 'subject', classroom_id: 'room' },
    'teacherA',
    ['teacherB', 'teacherA', 'teacherC'],
    (id) => labels[id] ?? '',
  );

  assert.deepEqual(rows.map((row) => row.teacher_id), ['teacherA', 'teacherB', 'teacherC']);
  assert.equal(rows[0].co_teacher_name, 'ครู ข, ครู ค');
  assert.equal(rows[1].co_teacher_name, 'ครู ก, ครู ค');
  assert.equal(rows[2].co_teacher_name, 'ครู ก, ครู ข');
});

test('co-teacher assignments resolve the same shared gradebook', () => {
  const first = {
    id: 'assignment-a',
    assignment_group_id: 'shared-group',
    semester_id: 'semester',
    subject_id: 'subject',
    classroom_id: 'room',
  };
  const second = { ...first, id: 'assignment-b' };
  const sharedGradebook = { id: 'gradebook-shared', completion: 72 };
  const byGroup = new Map([['shared-group', sharedGradebook]]);

  assert.equal(sharedRecordForAssignment(first, byGroup, { id: 'direct-a', completion: 0 }), sharedGradebook);
  assert.equal(sharedRecordForAssignment(second, byGroup, null), sharedGradebook);
  assert.equal(assignmentGroupKey(first), assignmentGroupKey(second));
});

test('legacy assignments still use their direct gradebook', () => {
  const legacy = {
    id: 'assignment-old',
    semester_id: 'semester',
    subject_id: 'subject',
    classroom_id: 'room',
  };
  const direct = { id: 'gradebook-old' };
  assert.equal(sharedRecordForAssignment(legacy, new Map(), direct), direct);
  assert.equal(assignmentGroupKey(legacy), 'legacy:semester:subject:room');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { STUDENT_HOMEROOMS } from '../src/data/studentHomerooms';
import { currentHomeroomTeacherNames } from '../src/lib/homeroomTeachers';

test('current classroom slots remain authoritative when a homeroom teacher is removed', () => {
  assert.deepEqual(
    currentHomeroomTeacherNames({
      homeroom_teacher_1: { title: 'นาง', full_name: 'ประนอมจิตร หอมบุญ' },
      homeroom_teacher_2: { title: 'นาย', full_name: 'ธนิท ธนพัฒนิรัชกุล' },
      homeroom_teacher_3: null,
    }),
    ['นาง ประนอมจิตร หอมบุญ', 'นาย ธนิท ธนพัฒนิรัชกุล', ''],
  );
});

test('fallback import data assigns Teeraporn to M.1/3 instead of M.1/4', () => {
  assert.ok(STUDENT_HOMEROOMS['ม.1/3'].includes('นางธีราพร เจริญยิ่ง'));
  assert.ok(!STUDENT_HOMEROOMS['ม.1/4'].includes('นางธีราพร เจริญยิ่ง'));
});

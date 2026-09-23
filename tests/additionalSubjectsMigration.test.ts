import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { SUBJECTS_CATALOG } from '../src/data/subjectsCatalog';

test('generated catalog assigns school subjects to their learning areas', () => {
  const schoolSubjects = SUBJECTS_CATALOG.filter((item) =>
    ['สวนพฤกษศาสตร์ในโรงเรียน', 'พื้นฐานอาชีพ'].includes(item.subject_name),
  );
  assert.ok(schoolSubjects.length > 0);
  assert.ok(schoolSubjects.every((item) => item.learning_area === (
    item.subject_name === 'สวนพฤกษศาสตร์ในโรงเรียน' ? 'วิทยาศาสตร์และเทคโนโลยี' : 'การงานอาชีพ'
  )));
});

test('subject migration restores core learning areas without changing IDs', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table subjects (
        id uuid primary key,
        subject_name text,
        learning_area text
      );
      insert into subjects values
        ('00000000-0000-0000-0000-000000000001', 'สวนพฤกษศาสตร์ในโรงเรียน', 'กลุ่มสาระการเรียนรู้เพิ่มเติม'),
        ('00000000-0000-0000-0000-000000000002', 'พื้นฐานอาชีพ', 'กลุ่มสาระการเรียนรู้เพิ่มเติม'),
        ('00000000-0000-0000-0000-000000000003', 'วิทยาศาสตร์', 'วิทยาศาสตร์และเทคโนโลยี');
    `);

    const migration = readFileSync(
      'supabase/migrations/0052_move_additional_subjects_to_learning_areas.sql',
      'utf8',
    );
    const subjectUpdate = migration.match(/update public\.subjects[\s\S]*?;\s/)?.[0];
    assert.ok(subjectUpdate, 'expected subject update statement');
    await db.exec(subjectUpdate);
    await db.exec(subjectUpdate);

    const rows = await db.query<{ id: string; subject_name: string; learning_area: string }>(
      'select * from subjects order by id',
    );
    assert.deepEqual(rows.rows, [
      {
        id: '00000000-0000-0000-0000-000000000001',
        subject_name: 'สวนพฤกษศาสตร์ในโรงเรียน',
        learning_area: 'วิทยาศาสตร์และเทคโนโลยี',
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        subject_name: 'พื้นฐานอาชีพ',
        learning_area: 'การงานอาชีพ',
      },
      {
        id: '00000000-0000-0000-0000-000000000003',
        subject_name: 'วิทยาศาสตร์',
        learning_area: 'วิทยาศาสตร์และเทคโนโลยี',
      },
    ]);
  } finally {
    await db.close();
  }
});

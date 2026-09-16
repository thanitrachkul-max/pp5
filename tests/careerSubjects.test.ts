import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { SUBJECTS_CATALOG } from '../src/data/subjectsCatalog';

test('career correction preserves subject IDs, credits and other subjects', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table subjects (
      id serial primary key, subject_code text, subject_name text,
      learning_area text, default_class_level text, credits numeric,
      hours_total integer, hours_per_week integer
    );`);
    for (const item of SUBJECTS_CATALOG) {
      await db.query(`insert into subjects
        (subject_code, subject_name, learning_area, default_class_level, credits, hours_total, hours_per_week)
        values ($1,$2,$3,$4,$5,$6,$7)`, [item.subject_code, item.subject_name,
        item.learning_area, item.default_class_level, item.credits, item.hours_total, item.hours_per_week]);
    }
    const codes = ['ง32201', 'ง32202', 'ง33201', 'ง33202'];
    const original = (await db.query('select * from subjects order by id')).rows;
    for (const code of codes) {
      const item = SUBJECTS_CATALOG.find((subject) => subject.subject_code === code)!;
      assert.equal(item.subject_name, 'พื้นฐานอาชีพ');
      assert.equal(item.hours_total, 240);
      assert.equal(item.hours_per_week, 12);
      await db.query(`update subjects set subject_name='อาชีพ', hours_total=60, hours_per_week=3 where subject_code=$1`, [code]);
    }
    const sql = readFileSync('supabase/migrations/0042_correct_upper_secondary_career_subjects.sql', 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    assert.deepEqual((await db.query('select * from subjects order by id')).rows, original);
  } finally {
    await db.close();
  }
});

import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('assigned teachers can add and remove a student in the central classroom roster', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql
        as $$ select current_setting('test.uid', true)::uuid $$;
      create function public.current_school_id() returns uuid language sql
        as $$ select '00000000-0000-0000-0000-000000000010'::uuid $$;
      create function public.current_role_is_admin() returns boolean language sql
        as $$ select false $$;

      create table public.semesters (
        id uuid primary key,
        academic_year_id uuid not null
      );
      create table public.classrooms (
        id uuid primary key,
        school_id uuid not null,
        class_level_code text not null
      );
      create table public.teaching_assignments (
        id uuid primary key,
        teacher_id uuid not null,
        semester_id uuid not null,
        classroom_id uuid not null,
        status text not null
      );
      create table public.students (
        id uuid primary key default gen_random_uuid(),
        school_id uuid not null,
        student_code text not null,
        citizen_id text,
        title text,
        first_name text not null,
        last_name text not null,
        gender text,
        status text not null default 'active',
        unique (school_id, student_code)
      );
      create table public.student_enrollments (
        id uuid primary key default gen_random_uuid(),
        student_id uuid not null references public.students(id),
        academic_year_id uuid not null,
        classroom_id uuid not null,
        class_level_code text not null,
        student_number integer,
        status text not null default 'active',
        unique (student_id, academic_year_id)
      );

      insert into public.semesters values (
        '00000000-0000-0000-0000-000000000020',
        '00000000-0000-0000-0000-000000000030'
      );
      insert into public.classrooms values (
        '00000000-0000-0000-0000-000000000040',
        '00000000-0000-0000-0000-000000000010',
        'ป.5'
      );
      insert into public.teaching_assignments values (
        '00000000-0000-0000-0000-000000000050',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000020',
        '00000000-0000-0000-0000-000000000040',
        'active'
      );
    `);

    await db.exec(
      readFileSync('supabase/migrations/0047_teacher_manage_assigned_student_roster.sql', 'utf8'),
    );
    await db.exec(`
      grant usage on schema public, auth to authenticated;
      set role authenticated;
      set test.uid = '00000000-0000-0000-0000-000000000001';
    `);

    const added = await db.query<{ student_id: string }>(`
      select public.teacher_add_assigned_student(
        '00000000-0000-0000-0000-000000000050',
        'P5001',
        '1234567890123',
        'เด็กหญิง',
        'ทดสอบ',
        'ระบบ',
        7
      ) as student_id
    `);
    const studentId = added.rows[0].student_id;
    assert.match(studentId, /^[0-9a-f-]{36}$/);

    await db.exec('reset role');
    const active = await db.query<{
      student_code: string;
      student_number: number;
      class_level_code: string;
      status: string;
    }>(`
      select s.student_code, se.student_number, se.class_level_code, se.status
      from public.students s
      join public.student_enrollments se on se.student_id = s.id
    `);
    assert.deepEqual(active.rows, [{
      student_code: 'P5001',
      student_number: 7,
      class_level_code: 'ป.5',
      status: 'active',
    }]);

    await db.exec(`
      set role authenticated;
      set test.uid = '00000000-0000-0000-0000-000000000001';
    `);
    await db.query(`
      select public.teacher_remove_assigned_student(
        '00000000-0000-0000-0000-000000000050',
        $1
      )
    `, [studentId]);
    await db.exec('reset role');

    const removed = await db.query<{ status: string }>(
      'select status from public.student_enrollments where student_id = $1',
      [studentId],
    );
    assert.equal(removed.rows[0].status, 'inactive');

    await db.exec(`
      set role authenticated;
      set test.uid = '00000000-0000-0000-0000-000000000099';
    `);
    await assert.rejects(
      db.query(`
        select public.teacher_add_assigned_student(
          '00000000-0000-0000-0000-000000000050',
          'P5002',
          null,
          'เด็กชาย',
          'ไม่มี',
          'สิทธิ์',
          8
        )
      `),
      /ไม่มีสิทธิ์เพิ่มนักเรียนในห้องเรียนนี้/,
    );
  } finally {
    await db.close();
  }
});

import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('student roster mutations create add, update and remove audit events', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create schema auth;
      create function auth.uid() returns uuid language sql
        as $$ select current_setting('test.uid', true)::uuid $$;
      create function public.current_school_id() returns uuid language sql
        as $$ select '00000000-0000-0000-0000-000000000010'::uuid $$;
      create function public.current_role_is_admin() returns boolean language sql
        as $$ select false $$;
      create function public.is_admin_or_exec() returns boolean language sql
        as $$ select false $$;

      create table public.schools (id uuid primary key);
      create table public.profiles (
        id uuid primary key,
        school_id uuid,
        full_name text not null,
        title text,
        role text not null default 'teacher'
      );
      create table public.academic_years (
        id uuid primary key,
        school_id uuid not null,
        is_active boolean not null default true
      );
      create table public.semesters (
        id uuid primary key,
        academic_year_id uuid not null
      );
      create table public.classrooms (
        id uuid primary key,
        school_id uuid not null,
        academic_year_id uuid not null,
        class_level_code text not null
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
        status text not null default 'active'
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
      create table public.teaching_assignments (
        id uuid primary key,
        assignment_group_id uuid,
        teacher_id uuid not null,
        semester_id uuid not null,
        classroom_id uuid not null,
        status text not null
      );
      create table public.gradebooks (
        id uuid primary key,
        teaching_assignment_id uuid not null,
        assignment_group_id uuid,
        deleted_at timestamptz
      );
      create table public.gradebook_delegations (
        id uuid primary key default gen_random_uuid(),
        gradebook_id uuid not null,
        teacher_id uuid not null
      );

      insert into public.schools values ('00000000-0000-0000-0000-000000000010');
      insert into public.profiles values (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000010',
        'ครูทดสอบ',
        'นางสาว',
        'teacher'
      );
      insert into public.academic_years values (
        '00000000-0000-0000-0000-000000000030',
        '00000000-0000-0000-0000-000000000010',
        true
      );
      insert into public.semesters values (
        '00000000-0000-0000-0000-000000000020',
        '00000000-0000-0000-0000-000000000030'
      );
      insert into public.classrooms values (
        '00000000-0000-0000-0000-000000000040',
        '00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000030',
        'ป.5'
      );
      insert into public.teaching_assignments values (
        '00000000-0000-0000-0000-000000000050',
        '00000000-0000-0000-0000-000000000060',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000020',
        '00000000-0000-0000-0000-000000000040',
        'active'
      );
      insert into public.gradebooks values (
        '00000000-0000-0000-0000-000000000070',
        '00000000-0000-0000-0000-000000000050',
        '00000000-0000-0000-0000-000000000060',
        null
      );
    `);

    await db.exec(readFileSync('supabase/migrations/0047_teacher_manage_assigned_student_roster.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/0050_student_roster_audit.sql', 'utf8'));
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

    await db.query(`
      select public.teacher_update_assigned_student(
        $1,
        'P5001',
        'P5002',
        '1234567890123',
        'เด็กหญิง',
        'แก้ไข',
        'ข้อมูล'
      )
    `, [studentId]);
    await db.query(`
      select public.teacher_remove_assigned_student(
        '00000000-0000-0000-0000-000000000050',
        $1
      )
    `, [studentId]);

    await db.exec('reset role');
    const audit = await db.query<{ action: string; before_data: unknown; after_data: unknown }>(`
      select action, before_data, after_data
      from public.student_roster_audit_logs
      order by created_at, id
    `);
    assert.deepEqual(audit.rows.map((row) => row.action), ['add', 'update', 'remove']);
    assert.equal(audit.rows[0].before_data, null);
    assert.equal((audit.rows[0].after_data as { studentId: string }).studentId, 'P5001');
    assert.equal((audit.rows[1].before_data as { studentId: string }).studentId, 'P5001');
    assert.equal((audit.rows[1].after_data as { studentId: string }).studentId, 'P5002');
    assert.equal((audit.rows[2].before_data as { studentId: string }).studentId, 'P5002');
    assert.equal(audit.rows[2].after_data, null);
  } finally {
    await db.close();
  }
});

import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SCHOOL = '00000000-0000-0000-0000-000000000010';
const YEAR = '00000000-0000-0000-0000-000000000030';
const CLASSROOM = '00000000-0000-0000-0000-000000000040';
const OTHER_CLASSROOM = '00000000-0000-0000-0000-000000000041';
const HOMEROOM = '00000000-0000-0000-0000-000000000001';
const CO_HOMEROOM = '00000000-0000-0000-0000-000000000002';
const OTHER_TEACHER = '00000000-0000-0000-0000-000000000099';
const ADMIN = '00000000-0000-0000-0000-000000000077';
const ACTIVITY_HEAD = '00000000-0000-0000-0000-000000000003';

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

    create table public.schools (id uuid primary key, name text not null);
    create table public.profiles (
      id uuid primary key,
      school_id uuid,
      title text,
      full_name text not null,
      role text not null,
      is_active boolean not null default true
    );
    create table public.academic_years (
      id uuid primary key,
      school_id uuid not null,
      year_be int not null,
      start_date date not null,
      end_date date not null,
      is_active boolean not null,
      study_start_date date,
      study_end_date date
    );
    create table public.semesters (
      id uuid primary key default gen_random_uuid(),
      academic_year_id uuid not null,
      semester_number int not null,
      start_date date,
      end_date date
    );
    create table public.classrooms (
      id uuid primary key,
      school_id uuid not null,
      academic_year_id uuid not null,
      class_level_code text not null,
      room_number int not null,
      name text not null,
      homeroom_teacher_id uuid,
      homeroom_teacher_2_id uuid,
      homeroom_teacher_3_id uuid
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
    create table public.school_learning_area_heads (
      school_id uuid not null,
      learning_area text not null,
      teacher_id uuid
    );
    create table public.school_pap5_officials (
      school_id uuid primary key,
      head_of_evaluation_id uuid,
      deputy_director_id uuid,
      school_director_id uuid
    );

    create function public.current_school_id() returns uuid language sql stable security definer
      as $$ select school_id from public.profiles where id = auth.uid() $$;
    create function public.current_role_is_admin() returns boolean language sql stable security definer
      as $$ select exists(select 1 from public.profiles where id = auth.uid() and role in ('admin', 'super_admin')) $$;
    create function public.is_admin_or_exec() returns boolean language sql stable security definer
      as $$ select exists(select 1 from public.profiles where id = auth.uid() and role in ('admin', 'super_admin', 'executive')) $$;

    insert into public.schools values ('${SCHOOL}', 'โรงเรียนกาฬสินธุ์ปัญญานุกูล จังหวัดกาฬสินธุ์');
    insert into public.profiles (id, school_id, title, full_name, role) values
      ('${HOMEROOM}', '${SCHOOL}', 'นาย', 'ครูประจำชั้น หนึ่ง', 'teacher'),
      ('${CO_HOMEROOM}', '${SCHOOL}', 'นาง', 'ครูประจำชั้น สอง', 'teacher'),
      ('${ACTIVITY_HEAD}', '${SCHOOL}', 'นางสาว', 'หัวหน้า กิจกรรม', 'teacher'),
      ('${OTHER_TEACHER}', '${SCHOOL}', 'นาย', 'ครูห้องอื่น', 'teacher'),
      ('${ADMIN}', '${SCHOOL}', null, 'ผู้ดูแลระบบ', 'admin');
    insert into public.academic_years values
      ('${YEAR}', '${SCHOOL}', 2569, '2026-05-16', '2027-03-31', true, '2026-05-16', '2027-03-31');
    insert into public.semesters (academic_year_id, semester_number, start_date, end_date) values
      ('${YEAR}', 1, '2026-05-16', '2026-10-11'),
      ('${YEAR}', 2, '2026-11-01', '2027-03-31');
    insert into public.classrooms values
      ('${CLASSROOM}', '${SCHOOL}', '${YEAR}', 'ม.1', 4, 'ม.1/4', '${HOMEROOM}', '${CO_HOMEROOM}', null),
      ('${OTHER_CLASSROOM}', '${SCHOOL}', '${YEAR}', 'ม.1', 5, 'ม.1/5', '${OTHER_TEACHER}', null, null);
    insert into public.school_learning_area_heads values ('${SCHOOL}', 'กิจกรรม พัฒนาผู้เรียน', '${ACTIVITY_HEAD}');
  `);
  await db.exec(readFileSync('supabase/migrations/0055_student_activity_records.sql', 'utf8'));
  await db.exec(`
    grant usage on schema public, auth to authenticated;
    grant select, insert, update on public.students, public.student_enrollments to authenticated;
  `);
  return db;
}

async function actAs(db: PGlite, uid: string) {
  await db.exec(`reset role; set test.uid = '${uid}'; set role authenticated;`);
}

test('homeroom teachers open, create and save the classroom activity record', async () => {
  const db = await createDatabase();
  try {
    await actAs(db, HOMEROOM);
    const context = await db.query<{ context: Record<string, any> }>(
      'select public.get_student_activity_context($1) as context',
      [CLASSROOM],
    );
    const value = context.rows[0].context;
    assert.equal(value.can_edit, true);
    assert.equal(value.classroom.name, 'ม.1/4');
    assert.equal(value.year.year_be, 2569);
    assert.deepEqual(value.homeroom_teachers, ['นาย ครูประจำชั้น หนึ่ง', 'นาง ครูประจำชั้น สอง', '']);
    assert.equal(value.officials.head_of_activities, 'นางสาว หัวหน้า กิจกรรม');
    assert.equal(value.semesters.length, 2);

    const inserted = await db.query<{ id: string; created_by: string }>(`
      insert into public.student_activity_records (school_id, academic_year_id, classroom_id, assessments)
      values ($1, $2, $3, '{"clubName":"ชุมนุมดนตรี"}')
      returning id, created_by
    `, [SCHOOL, YEAR, CLASSROOM]);
    assert.equal(inserted.rows[0].created_by, HOMEROOM);

    await actAs(db, CO_HOMEROOM);
    const updated = await db.query<{ id: string; updated_by: string; created_by: string }>(`
      update public.student_activity_records
      set status = 'in_progress', created_by = null
      where id = $1
      returning id, updated_by, created_by
    `, [inserted.rows[0].id]);
    assert.equal(updated.rows.length, 1);
    assert.equal(updated.rows[0].updated_by, CO_HOMEROOM);
    assert.equal(updated.rows[0].created_by, HOMEROOM, 'the creator cannot be rewritten');
  } finally {
    await db.close();
  }
});

test('other teachers cannot read or write another classroom activity record', async () => {
  const db = await createDatabase();
  try {
    await actAs(db, OTHER_TEACHER);
    await assert.rejects(
      db.query(
        'insert into public.student_activity_records (school_id, academic_year_id, classroom_id) values ($1, $2, $3)',
        [SCHOOL, YEAR, CLASSROOM],
      ),
      /row-level security/,
    );

    await actAs(db, HOMEROOM);
    await db.query(
      'insert into public.student_activity_records (school_id, academic_year_id, classroom_id) values ($1, $2, $3)',
      [SCHOOL, YEAR, CLASSROOM],
    );

    await actAs(db, OTHER_TEACHER);
    await assert.rejects(
      db.query('select public.get_student_activity_context($1)', [CLASSROOM]),
      /ไม่มีสิทธิ์เปิดบันทึกกิจกรรมพัฒนาผู้เรียน/,
    );
    const visible = await db.query('select id from public.student_activity_records');
    assert.equal(visible.rows.length, 0);
    const changed = await db.query(`update public.student_activity_records set status = 'completed' returning id`);
    assert.equal(changed.rows.length, 0);

    await actAs(db, ADMIN);
    const adminContext = await db.query<{ context: Record<string, any> }>(
      'select public.get_student_activity_context($1) as context',
      [CLASSROOM],
    );
    assert.equal(adminContext.rows[0].context.can_edit, true);
    const adminVisible = await db.query('select id from public.student_activity_records');
    assert.equal(adminVisible.rows.length, 1);
  } finally {
    await db.close();
  }
});

test('homeroom teachers become read-only once the academic year is closed', async () => {
  const db = await createDatabase();
  try {
    await db.exec(`update public.academic_years set is_active = false`);
    await actAs(db, HOMEROOM);
    const context = await db.query<{ context: Record<string, any> }>(
      'select public.get_student_activity_context($1) as context',
      [CLASSROOM],
    );
    assert.equal(context.rows[0].context.can_edit, false);
    await assert.rejects(
      db.query(
        'insert into public.student_activity_records (school_id, academic_year_id, classroom_id) values ($1, $2, $3)',
        [SCHOOL, YEAR, CLASSROOM],
      ),
      /row-level security/,
    );
  } finally {
    await db.close();
  }
});

test('homeroom teachers manage the central roster of their own classroom only', async () => {
  const db = await createDatabase();
  try {
    await actAs(db, HOMEROOM);
    const added = await db.query<{ student_id: string }>(`
      select public.homeroom_add_classroom_student($1, 'A001', '1234567890123', 'เด็กหญิง', 'ทดสอบ', 'ระบบ', 3) as student_id
    `, [CLASSROOM]);
    const studentId = added.rows[0].student_id;

    await db.query(`
      select public.homeroom_update_classroom_student($1, $2, 'A001', 'A002', null, 'เด็กหญิง', 'แก้ไข', 'ชื่อ')
    `, [CLASSROOM, studentId]);

    await db.exec('reset role');
    const saved = await db.query<{ student_code: string; first_name: string; classroom_id: string; student_number: number }>(`
      select s.student_code, s.first_name, se.classroom_id, se.student_number
      from public.students s join public.student_enrollments se on se.student_id = s.id
    `);
    assert.deepEqual(saved.rows, [{ student_code: 'A002', first_name: 'แก้ไข', classroom_id: CLASSROOM, student_number: 3 }]);

    await actAs(db, OTHER_TEACHER);
    await assert.rejects(
      db.query('select public.homeroom_remove_classroom_student($1, $2)', [CLASSROOM, studentId]),
      /ไม่มีสิทธิ์ลบนักเรียนจากห้องเรียนนี้/,
    );
    await assert.rejects(
      db.query(`select public.homeroom_update_classroom_student($1, $2, 'A002', 'A003', null, 'เด็กชาย', 'ไม่มี', 'สิทธิ์')`, [CLASSROOM, studentId]),
      /ไม่มีสิทธิ์แก้ไขข้อมูลนักเรียนในห้องเรียนนี้/,
    );
    await assert.rejects(
      db.query(`select public.homeroom_add_classroom_student($1, 'A002', null, 'เด็กหญิง', 'ย้าย', 'ห้อง', 1)`, [OTHER_CLASSROOM]),
      /มีห้องเรียนในปีการศึกษาปัจจุบันแล้ว/,
    );

    await actAs(db, HOMEROOM);
    await db.query('select public.homeroom_remove_classroom_student($1, $2)', [CLASSROOM, studentId]);
    await db.exec('reset role');
    const removed = await db.query<{ status: string }>('select status from public.student_enrollments');
    assert.equal(removed.rows[0].status, 'inactive');
  } finally {
    await db.close();
  }
});

test('homeroom teachers submit a complete record and only admins approve or return it', async () => {
  const db = await createDatabase();
  try {
    await actAs(db, HOMEROOM);
    const context = await db.query<{ context: Record<string, any> }>(
      'select public.get_student_activity_context($1) as context',
      [CLASSROOM],
    );
    assert.equal(context.rows[0].context.can_review, false);

    const inserted = await db.query<{ id: string; approval_status: string | null }>(`
      insert into public.student_activity_records (school_id, academic_year_id, classroom_id, stats, approval_status)
      values ($1, $2, $3, '{"completionPercent": 60}', 'approved')
      returning id, approval_status
    `, [SCHOOL, YEAR, CLASSROOM]);
    const recordId = inserted.rows[0].id;
    assert.equal(inserted.rows[0].approval_status, null, 'a new record cannot start approved');

    await assert.rejects(
      db.query('select public.submit_student_activity_record($1)', [recordId]),
      /ให้ครบ 100% ก่อนส่ง/,
    );

    const forged = await db.query<{ approval_status: string | null }>(`
      update public.student_activity_records
      set approval_status = 'approved', stats = '{"completionPercent": 100}'
      where id = $1
      returning approval_status
    `, [recordId]);
    assert.equal(forged.rows[0].approval_status, null, 'teachers cannot approve by updating the row');

    const submitted = await db.query<{ approval: Record<string, any> }>(
      'select public.submit_student_activity_record($1) as approval',
      [recordId],
    );
    assert.equal(submitted.rows[0].approval.approval_status, 'pending');
    assert.ok(submitted.rows[0].approval.submitted_at);

    await assert.rejects(
      db.query(`update public.student_activity_records set assessments = '{"clubName":"แก้หลังส่ง"}' where id = $1`, [recordId]),
      /ส่งการประเมินกิจกรรมพัฒนาผู้เรียนแล้ว/,
    );
    await assert.rejects(
      db.query('select public.submit_student_activity_record($1)', [recordId]),
      /กำลังรออนุมัติ/,
    );
    await assert.rejects(
      db.query(`select public.review_student_activity_record($1, 'approved')`, [recordId]),
      /เฉพาะผู้ดูแลระบบ/,
    );

    await actAs(db, ADMIN);
    const adminContext = await db.query<{ context: Record<string, any> }>(
      'select public.get_student_activity_context($1) as context',
      [CLASSROOM],
    );
    assert.equal(adminContext.rows[0].context.can_review, true);
    await assert.rejects(
      db.query(`select public.review_student_activity_record($1, 'revision_requested', '  ')`, [recordId]),
      /กรุณาระบุเหตุผล/,
    );
    const returned = await db.query<{ approval: Record<string, any> }>(
      `select public.review_student_activity_record($1, 'revision_requested', 'ตรวจเวลาเรียนเดือนมิถุนายนอีกครั้ง') as approval`,
      [recordId],
    );
    assert.equal(returned.rows[0].approval.approval_status, 'revision_requested');
    assert.equal(returned.rows[0].approval.approval_reason, 'ตรวจเวลาเรียนเดือนมิถุนายนอีกครั้ง');

    await actAs(db, CO_HOMEROOM);
    const edited = await db.query<{ id: string }>(
      `update public.student_activity_records set assessments = '{"clubName":"ชุมนุมดนตรี"}' where id = $1 returning id`,
      [recordId],
    );
    assert.equal(edited.rows.length, 1, 'a returned record can be edited again');
    const resubmitted = await db.query<{ approval: Record<string, any> }>(
      'select public.submit_student_activity_record($1) as approval',
      [recordId],
    );
    assert.equal(resubmitted.rows[0].approval.approval_status, 'pending');
    assert.equal(resubmitted.rows[0].approval.approval_reason, null);

    await actAs(db, ADMIN);
    const approved = await db.query<{ approval: Record<string, any> }>(
      `select public.review_student_activity_record($1, 'approved') as approval`,
      [recordId],
    );
    assert.equal(approved.rows[0].approval.approval_status, 'approved');

    await actAs(db, HOMEROOM);
    await assert.rejects(
      db.query(`update public.student_activity_records set status = 'in_progress' where id = $1`, [recordId]),
      /ไม่สามารถแก้ไขได้/,
    );
    await db.exec('reset role');
    const saved = await db.query<{ approval_status: string; submitted_by: string; reviewed_by: string }>(
      'select approval_status, submitted_by, reviewed_by from public.student_activity_records where id = $1',
      [recordId],
    );
    assert.deepEqual(saved.rows[0], { approval_status: 'approved', submitted_by: CO_HOMEROOM, reviewed_by: ADMIN });
  } finally {
    await db.close();
  }
});

test('bulk activity status edits enforce scope, submission, admin permissions and pending-only approval', async () => {
  const db = await createDatabase();
  try {
    await db.exec(readFileSync('supabase/migrations/0056_bulk_student_activity_approval.sql', 'utf8'));
    await actAs(db, ADMIN);
    const { rows } = await db.query<{ id: string }>(`insert into public.student_activity_records
      (school_id, academic_year_id, classroom_id, stats) values ($1,$2,$3,'{"completionPercent":100}'),
      ($1,$2,$4,'{"completionPercent":100}') returning id`, [SCHOOL, YEAR, CLASSROOM, OTHER_CLASSROOM]);
    const ids = rows.map(r => r.id);
    const change = (status: string, reason: string | null = null, only = false, year = YEAR) =>
      db.query<{ count: number }>('select public.bulk_set_student_activity_approval($1,$2,$3,$4,$5) as count', [year, [...ids, ids[0]], status, reason, only]);
    assert.equal((await change('approved')).rows[0].count, 0, 'drafts are never approved');
    await db.query('select public.submit_student_activity_record($1)', [ids[0]]);
    await actAs(db, HOMEROOM);
    await assert.rejects(change('approved'), /เฉพาะผู้ดูแลระบบ/);
    await actAs(db, ADMIN);
    assert.equal((await change('approved', null, true, OTHER_CLASSROOM)).rows[0].count, 0, 'wrong year is excluded');
    await assert.rejects(change('revision_requested', ' '), /กรุณาระบุเหตุผล/);
    assert.equal((await change('approved', null, true)).rows[0].count, 1, 'deduplicates shared room and excludes drafts');
    assert.equal((await change('approved', null, true)).rows[0].count, 0, 'stale pending-only requests skip already reviewed rows');
    assert.equal((await change('revision_requested', 'ตรวจเวลาเรียน')).rows[0].count, 1);
    assert.equal((await change('pending')).rows[0].count, 1);
    const saved = await db.query<{ approval_reason: string | null; reviewed_at: string | null; submitted_at: string | null }>('select approval_reason, reviewed_at, submitted_at from public.student_activity_records where id=$1', [ids[0]]);
    assert.equal(saved.rows[0].approval_reason, null);
    assert.equal(saved.rows[0].reviewed_at, null);
    assert.ok(saved.rows[0].submitted_at, 'original submission is preserved');
    await db.exec(`reset role; update profiles set school_id='00000000-0000-0000-0000-000000000999' where id='${ADMIN}'`);
    await actAs(db, ADMIN);
    assert.equal((await change('approved')).rows[0].count, 0, 'other school is excluded');
    await db.exec(`reset role; update profiles set is_active=false where id='${ADMIN}'`);
    await actAs(db, ADMIN);
    await assert.rejects(change('approved'), /เฉพาะผู้ดูแลระบบ/);
  } finally { await db.close(); }
});

import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
for (const emptyDuplicate of [false, true]) {
test(`shared migration preserves data and permissions (empty duplicate: ${emptyDuplicate})`, async () => {
const db = new PGlite();
try {
await db.exec(`
create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
create function current_school_id() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000010'::uuid $$;
create function current_role_is_admin() returns boolean language sql as $$ select true $$;
create table profiles(id uuid primary key, school_id uuid, title text, full_name text, is_active boolean, role text);
create table academic_years(id uuid primary key, school_id uuid, is_active boolean);
create table semesters(id uuid primary key, academic_year_id uuid);
create table subjects(id uuid primary key, school_id uuid);
create table classrooms(id uuid primary key, school_id uuid, academic_year_id uuid);
create table teaching_assignments(id uuid primary key default gen_random_uuid(), school_id uuid, semester_id uuid, teacher_id uuid references profiles(id), subject_id uuid, classroom_id uuid, hours_per_week integer, hours_per_semester integer, status text, created_by uuid, created_at timestamptz default now(), entry_start_date date, entry_end_date date, co_teacher_name text, unique(semester_id,teacher_id,subject_id,classroom_id));
create table gradebooks(id uuid primary key default gen_random_uuid(), teaching_assignment_id uuid unique references teaching_assignments(id) on delete cascade, teacher_id uuid, semester_id uuid, status text, stats jsonb default '{}', scores jsonb default '{}', deleted_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
create function gradebook_assignment_is_active_for_teacher(uuid,uuid,uuid) returns boolean language sql as $$ select true $$;
insert into profiles values ('00000000-0000-0000-0000-000000000001',current_school_id(),'นาย','ครูหนึ่ง',true,'teacher'),('00000000-0000-0000-0000-000000000002',current_school_id(),'นาง','ครูสอง',true,'teacher');
insert into academic_years values ('00000000-0000-0000-0000-000000000020',current_school_id(),true);
insert into semesters values ('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020');
insert into subjects values ('00000000-0000-0000-0000-000000000040',current_school_id());
insert into classrooms values ('00000000-0000-0000-0000-000000000050',current_school_id(),'00000000-0000-0000-0000-000000000020');
insert into teaching_assignments(id,school_id,semester_id,teacher_id,subject_id,classroom_id,status,co_teacher_name) values ('00000000-0000-0000-0000-000000000060',current_school_id(),'00000000-0000-0000-0000-000000000030',auth.uid(),'00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000050','active','นาง ครูสอง');
insert into gradebooks(teaching_assignment_id,teacher_id,semester_id,status,scores) select id,teacher_id,semester_id,'in_progress','{"student":85}' from teaching_assignments;
`);
await db.exec(`
alter table gradebooks add general_info jsonb default '{}', add score_config jsonb default '{}', add indicators jsonb default '{}';
alter table semesters add semester_number integer default 1;
alter table academic_years add year_be integer default 2569;
alter table classrooms add name text default '1/1';
alter table subjects add subject_code text default 'TEST', add subject_name text default 'Test', add learning_area text default 'Test';
`);
if (emptyDuplicate) await db.exec(`
update gradebooks set status='not_started', scores='{}';
insert into teaching_assignments(school_id,semester_id,teacher_id,subject_id,classroom_id,status)
select school_id,semester_id,'00000000-0000-0000-0000-000000000002',subject_id,classroom_id,status from teaching_assignments limit 1;
insert into gradebooks(teaching_assignment_id,teacher_id,semester_id,status,scores)
select id,teacher_id,semester_id,'not_started','{}' from teaching_assignments where teacher_id='00000000-0000-0000-0000-000000000002';
`);
const sql=readFileSync('supabase/migrations/0039_shared_co_teacher_gradebooks.sql','utf8');
await db.exec(sql);
await db.exec(sql);
const invoke = `select id from admin_sync_teaching_assignment_group('00000000-0000-0000-0000-000000000060',current_school_id(),'00000000-0000-0000-0000-000000000030',array['00000000-0000-0000-0000-000000000001'::uuid,'00000000-0000-0000-0000-000000000002'::uuid],'00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000050',3,60,null,null,'active')`;
await db.query(invoke);
const invariants = await db.query<{teachers:number;groups:number;books:number}>(`select (select count(*)::int from teaching_assignments) as teachers, (select count(distinct assignment_group_id)::int from teaching_assignments) as groups, (select count(*)::int from gradebooks where deleted_at is null) as books`);
assert.deepEqual(invariants.rows[0], {teachers:2, groups:1, books:1});
if (emptyDuplicate) {
  const archived = await db.query<{n:number}>(`select count(*)::int as n from gradebooks where deleted_at is not null and scores='{}'`);
  assert.equal(archived.rows[0].n, 1);
} else {
  assert.equal((await db.query<{scores:{student:number}}>('select scores from gradebooks where deleted_at is null')).rows[0].scores.student,85);
}
await db.exec(`
create or replace function auth.uid() returns uuid language sql as $$ select current_setting('test.uid',true)::uuid $$;
create or replace function current_role_is_admin() returns boolean language sql as $$ select false $$;
grant usage on schema public,auth to authenticated;
grant select,update on gradebooks to authenticated;
grant select on teaching_assignments to authenticated;
alter table gradebooks enable row level security;
set role authenticated;
set test.uid='00000000-0000-0000-0000-000000000002';
`);
const coRead = await db.query('select id from gradebooks where deleted_at is null');
if(coRead.rows.length!==1) throw Error('Co-teacher cannot read shared book');
const clonedExisting = await db.query(`select clone_gradebook_structure((select id from gradebooks where deleted_at is null limit 1),(select id from teaching_assignments where teacher_id=auth.uid())) as id`);
if(clonedExisting.rows[0].id!==coRead.rows[0].id) throw Error('Clone did not resolve existing shared book');
const coWrite = await db.query(`update gradebooks set scores='{"student":90}' where deleted_at is null returning id`);
if(coWrite.rows.length!==1) throw Error('Co-teacher cannot write shared book');
await db.exec(`set test.uid='00000000-0000-0000-0000-000000000099'`);
if((await db.query('select id from gradebooks where deleted_at is null')).rows.length) throw Error('Outsider can read');
if((await db.query(`update gradebooks set scores='{}' returning id`)).rows.length) throw Error('Outsider can write');
await db.exec('reset role');
if((await db.query<{scores:{student:number}}>('select scores from gradebooks where deleted_at is null')).rows[0].scores.student!==90) throw Error('Shared score missing');
await db.exec(readFileSync('supabase/migrations/0041_sync_teachers_after_assignment_delete.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/0041_sync_teachers_after_assignment_delete.sql', 'utf8'));
await db.exec(`
create or replace function current_role_is_admin() returns boolean language sql as $$ select true $$;
insert into profiles values ('00000000-0000-0000-0000-000000000003',current_school_id(),'นาย','ครูสาม',true,'teacher');
insert into teaching_assignments(school_id,semester_id,teacher_id,subject_id,classroom_id,status)
select school_id,semester_id,'00000000-0000-0000-0000-000000000003',subject_id,classroom_id,status from teaching_assignments limit 1;
update gradebooks set general_info='{"teacherName":"stale","teacherName2":"stale","teacherName3":"stale","schoolName":"School"}' where deleted_at is null;
`);
const removedTeacher = emptyDuplicate ? '00000000-0000-0000-0000-000000000002' : '00000000-0000-0000-0000-000000000001';
await db.query('delete from teaching_assignments where teacher_id=$1', [removedTeacher]);
const remaining = await db.query<{teacher_id:string;co_teacher_name:string}>(`select teacher_id,co_teacher_name from teaching_assignments order by teacher_id`);
assert.equal(remaining.rows.length, 2);
assert.ok(remaining.rows.every(row => row.co_teacher_name && !row.co_teacher_name.includes(emptyDuplicate ? 'ครูสอง' : 'ครูหนึ่ง')));
const cover = await db.query<{general_info:Record<string,string>;scores:{student:number}}>('select general_info,scores from gradebooks where deleted_at is null');
assert.equal(cover.rows.length, 1);
assert.equal(cover.rows[0].scores.student, 90);
assert.equal(cover.rows[0].general_info.schoolName, 'School');
assert.equal(cover.rows[0].general_info.teacherName3, '');
assert.deepEqual(new Set([cover.rows[0].general_info.teacherName, cover.rows[0].general_info.teacherName2]), new Set([emptyDuplicate ? 'นาย ครูหนึ่ง' : 'นาง ครูสอง', 'นาย ครูสาม']));
await db.query('delete from teaching_assignments where teacher_id=$1', [remaining.rows[0].teacher_id]);
assert.equal((await db.query('select co_teacher_name from teaching_assignments')).rows[0].co_teacher_name, null);
const lastCover = (await db.query<{general_info:Record<string,string>;scores:{student:number}}>('select general_info,scores from gradebooks where deleted_at is null')).rows[0];
assert.equal(lastCover.general_info.teacherName, 'นาย ครูสาม');
assert.equal(lastCover.general_info.teacherName2, '');
assert.equal(lastCover.general_info.teacherName3, '');
assert.equal(lastCover.scores.student, 90);
await db.exec('delete from teaching_assignments');
assert.equal((await db.query('select id from gradebooks where deleted_at is null')).rows.length, 0);
 } finally { await db.close(); }
});

}

import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('shared migration preserves scores, supports co-teachers and denies outsiders', async () => {
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
const sql=readFileSync('supabase/migrations/0039_shared_co_teacher_gradebooks.sql','utf8');
await db.exec(sql);
await db.exec(sql);
const invoke = `select id from admin_sync_teaching_assignment_group('00000000-0000-0000-0000-000000000060',current_school_id(),'00000000-0000-0000-0000-000000000030',array['00000000-0000-0000-0000-000000000001'::uuid,'00000000-0000-0000-0000-000000000002'::uuid],'00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000050',3,60,null,null,'active')`;
await db.query(invoke);
const invariants = await db.query<{teachers:number;groups:number;books:number}>(`select (select count(*)::int from teaching_assignments) as teachers, (select count(distinct assignment_group_id)::int from teaching_assignments) as groups, (select count(*)::int from gradebooks where deleted_at is null) as books`);
assert.deepEqual(invariants.rows[0], {teachers:2, groups:1, books:1});
assert.equal((await db.query<{scores:{student:number}}>('select scores from gradebooks')).rows[0].scores.student,85);
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
const coRead = await db.query('select id from gradebooks');
if(coRead.rows.length!==1) throw Error('Co-teacher cannot read shared book');
const clonedExisting = await db.query(`select clone_gradebook_structure((select id from gradebooks limit 1),(select id from teaching_assignments where teacher_id=auth.uid())) as id`);
if(clonedExisting.rows[0].id!==coRead.rows[0].id) throw Error('Clone did not resolve existing shared book');
const coWrite = await db.query(`update gradebooks set scores='{"student":90}' returning id`);
if(coWrite.rows.length!==1) throw Error('Co-teacher cannot write shared book');
await db.exec(`set test.uid='00000000-0000-0000-0000-000000000099'`);
if((await db.query('select id from gradebooks')).rows.length) throw Error('Outsider can read');
if((await db.query(`update gradebooks set scores='{}' returning id`)).rows.length) throw Error('Outsider can write');
await db.exec('reset role');
if((await db.query<{scores:{student:number}}>('select scores from gradebooks')).rows[0].scores.student!==90) throw Error('Shared score missing');
 } finally { await db.close(); }
});

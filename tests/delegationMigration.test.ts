import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('delegation grants shared editing, prevents escalation and revokes without losing scores', async () => {
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

await db.exec(readFileSync('supabase/migrations/0039_shared_co_teacher_gradebooks.sql','utf8'));
await db.exec(`
create role anon;
alter table classrooms add homeroom_teacher_id uuid, add homeroom_teacher_2_id uuid, add homeroom_teacher_3_id uuid;
insert into profiles values
 ('00000000-0000-0000-0000-000000000003',current_school_id(),'นาย','ผู้รับมอบหมาย',true,'teacher'),
 ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000099','นาย','ต่างโรงเรียน',true,'teacher'),
 ('00000000-0000-0000-0000-000000000005',current_school_id(),'นาย','ปิดบัญชี',false,'teacher'),
 ('00000000-0000-0000-0000-000000000006',current_school_id(),'นางสาว','พัชรี ภูละคร',true,'teacher');
update classrooms set homeroom_teacher_id='00000000-0000-0000-0000-000000000003';
insert into teaching_assignments(school_id,semester_id,teacher_id,subject_id,classroom_id,status)
values (current_school_id(),'00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000050','active');
create or replace function auth.uid() returns uuid language sql as $$ select current_setting('test.uid',true)::uuid $$;
create or replace function current_role_is_admin() returns boolean language sql as $$ select false $$;
grant usage on schema public,auth to authenticated;
grant select,update on gradebooks to authenticated;
grant select on teaching_assignments to authenticated;
alter table gradebooks enable row level security;
alter table teaching_assignments enable row level security;
create policy ta_teacher_read on teaching_assignments for select using (teacher_id=auth.uid());
`);
await db.exec(readFileSync('supabase/migrations/0040_gradebook_delegations.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/0048_additional_subjects_and_delegation_candidates.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/0049_allow_co_teachers_as_delegation_candidates.sql','utf8'));
const book = (await db.query<{id:string}>('select id from gradebooks where deleted_at is null')).rows[0].id;
const setUser = async (id: number) => db.exec(`set test.uid='00000000-0000-0000-0000-${String(id).padStart(12,'0')}'`);
await db.exec('set role authenticated');
await setUser(3);
assert.equal((await db.query('select id from gradebooks')).rows.length,0);
await assert.rejects(db.query('select set_gradebook_delegation($1,$2)',[book,'00000000-0000-0000-0000-000000000003']));
// Either original co-teacher can delegate the same shared book.
await setUser(2);
const candidates=await db.query<{id:string;classrooms:string[]}>('select * from gradebook_delegation_teachers($1)',[book]);
assert.deepEqual(new Set(candidates.rows.map(t=>t.id)),new Set([
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000006',
]));
assert.deepEqual(candidates.rows.find(t=>t.id.endsWith('3'))?.classrooms,['1/1']);
for (const invalid of [2,4,5]) await assert.rejects(db.query('select set_gradebook_delegation($1,$2)',[book,`00000000-0000-0000-0000-${String(invalid).padStart(12,'0')}`]));
await db.query('select set_gradebook_delegation($1,$2)',[book,'00000000-0000-0000-0000-000000000003']);
await db.query('select set_gradebook_delegation($1,$2)',[book,'00000000-0000-0000-0000-000000000003']);
assert.equal((await db.query('select * from list_gradebook_delegations()')).rows.length,1);
await setUser(3);
assert.equal((await db.query('select id from gradebooks')).rows.length,1);
assert.equal((await db.query('select id from teaching_assignments')).rows.length,3);
assert.equal((await db.query(`update gradebooks set scores='{"student":97}' returning id`)).rows.length,1);
await assert.rejects(db.query('select gradebook_delegation_teachers($1)',[book]));
await assert.rejects(db.query('select set_gradebook_delegation($1,$2,true)',[book,'00000000-0000-0000-0000-000000000003']));
await assert.rejects(db.query('delete from gradebook_delegations'));
await assert.rejects(db.query(`update gradebooks set teacher_id=auth.uid() returning id`));
// Closed academic year retains read access but blocks writes.
await db.exec('reset role; update academic_years set is_active=false; set role authenticated');
assert.equal((await db.query(`update gradebooks set scores='{}' returning id`)).rows.length,0);
assert.equal((await db.query('select id from gradebooks')).rows.length,1);
await db.exec('reset role; update academic_years set is_active=true; set role authenticated');
// A different original teacher can revoke; saved work remains in the same book.
await setUser(1);
await db.query('select set_gradebook_delegation($1,$2,true)',[book,'00000000-0000-0000-0000-000000000003']);
await setUser(3);
assert.equal((await db.query('select id from gradebooks')).rows.length,0);
assert.equal((await db.query('select id from teaching_assignments')).rows.length,0);
assert.equal((await db.query(`update gradebooks set scores='{}' returning id`)).rows.length,0);
await setUser(2);
assert.equal((await db.query<{scores:{student:number}}>('select scores from gradebooks')).rows[0].scores.student,97);
assert.equal((await db.query('select * from list_gradebook_delegations()')).rows.length,0);
} finally { await db.close(); }
});

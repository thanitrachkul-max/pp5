begin;

-- One subject/classroom/semester can be taught by several teachers, while all
-- assigned teachers work in the same Pap.5 gradebook.

alter table public.teaching_assignments
  add column if not exists assignment_group_id uuid;

-- Backfill one stable group for every subject x classroom x semester. Existing
-- duplicate teacher assignments therefore become collaborators immediately.
with grouped as (
  select
    semester_id,
    subject_id,
    classroom_id,
    coalesce(min(assignment_group_id::text), min(id::text))::uuid as assignment_group_id
  from public.teaching_assignments
  group by semester_id, subject_id, classroom_id
)
update public.teaching_assignments ta
set assignment_group_id = grouped.assignment_group_id
from grouped
where ta.semester_id = grouped.semester_id
  and ta.subject_id = grouped.subject_id
  and ta.classroom_id = grouped.classroom_id
  and ta.assignment_group_id is distinct from grouped.assignment_group_id;

alter table public.teaching_assignments
  alter column assignment_group_id set default gen_random_uuid();

alter table public.teaching_assignments
  alter column assignment_group_id set not null;

create index if not exists teaching_assignments_group_idx
  on public.teaching_assignments (assignment_group_id);

create or replace function public.set_teaching_assignment_group()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  -- Preserve the group for ordinary edits. Re-resolve it only when the subject
  -- identity changes, or when a new assignment is inserted.
  if tg_op = 'UPDATE'
     and new.semester_id is not distinct from old.semester_id
     and new.subject_id is not distinct from old.subject_id
     and new.classroom_id is not distinct from old.classroom_id then
    new.assignment_group_id := old.assignment_group_id;
    return new;
  end if;

  select ta.assignment_group_id
    into v_group_id
  from public.teaching_assignments ta
  where ta.semester_id = new.semester_id
    and ta.subject_id = new.subject_id
    and ta.classroom_id = new.classroom_id
    and ta.id <> new.id
  order by ta.created_at, ta.id
  limit 1;

  new.assignment_group_id := coalesce(v_group_id, md5(new.school_id::text || ':' || new.semester_id::text || ':' || new.subject_id::text || ':' || new.classroom_id::text)::uuid);
  return new;
end;
$$;

drop trigger if exists trg_teaching_assignment_group on public.teaching_assignments;
create trigger trg_teaching_assignment_group
  before insert or update of semester_id, subject_id, classroom_id
  on public.teaching_assignments
  for each row execute function public.set_teaching_assignment_group();

-- Older timetable imports stored collaborators only as a comma-separated name
-- on the primary assignment. Resolve names against active profiles and create
-- the missing assignment rows so current subject counts become correct too.
with source_assignments as (
  select
    ta.*,
    concat_ws(' ', owner.title, owner.full_name) as owner_name
  from public.teaching_assignments ta
  join public.profiles owner on owner.id = ta.teacher_id
  where nullif(btrim(ta.co_teacher_name), '') is not null
), split_names as (
  select
    source_assignments.*,
    btrim(name_part) as collaborator_name
  from source_assignments
  cross join lateral regexp_split_to_table(
    source_assignments.co_teacher_name,
    '[,;\n]+'
  ) as name_part
), matched_collaborators as (
  select distinct on (
    split_names.semester_id,
    split_names.subject_id,
    split_names.classroom_id,
    collaborator.id
  )
    split_names.school_id,
    split_names.semester_id,
    collaborator.id as teacher_id,
    split_names.subject_id,
    split_names.classroom_id,
    split_names.hours_per_week,
    split_names.hours_per_semester,
    split_names.status,
    split_names.created_by,
    split_names.entry_start_date,
    split_names.entry_end_date,
    concat_ws(', ', split_names.owner_name, split_names.co_teacher_name) as co_teacher_name
  from split_names
  join public.profiles collaborator
    on collaborator.school_id = split_names.school_id
   and collaborator.is_active = true
   and collaborator.id <> split_names.teacher_id
   and (
     regexp_replace(lower(split_names.collaborator_name), '[[:space:]]+', '', 'g') =
       regexp_replace(lower(concat_ws('', collaborator.title, collaborator.full_name)), '[[:space:]]+', '', 'g')
     or regexp_replace(lower(split_names.collaborator_name), '[[:space:]]+', '', 'g') =
       regexp_replace(lower(collaborator.full_name), '[[:space:]]+', '', 'g')
   )
  where split_names.collaborator_name <> ''
  order by
    split_names.semester_id,
    split_names.subject_id,
    split_names.classroom_id,
    collaborator.id,
    split_names.created_at
)
insert into public.teaching_assignments (
  school_id,
  semester_id,
  teacher_id,
  subject_id,
  classroom_id,
  hours_per_week,
  hours_per_semester,
  status,
  created_by,
  entry_start_date,
  entry_end_date,
  co_teacher_name
)
select
  school_id,
  semester_id,
  teacher_id,
  subject_id,
  classroom_id,
  hours_per_week,
  hours_per_semester,
  status,
  created_by,
  entry_start_date,
  entry_end_date,
  co_teacher_name
from matched_collaborators
on conflict (semester_id, teacher_id, subject_id, classroom_id)
do nothing;

alter table public.gradebooks
  add column if not exists assignment_group_id uuid;

update public.gradebooks g
set assignment_group_id = ta.assignment_group_id
from public.teaching_assignments ta
where ta.id = g.teaching_assignment_id
  and g.assignment_group_id is distinct from ta.assignment_group_id;

-- Archive redundant, untouched books only when every stored payload agrees.
-- Keep the full row for recovery. Teacher/homeroom labels are rebuilt from the
-- shared assignment and classroom relations by the application.
update public.gradebooks redundant
set deleted_at = now()
where redundant.deleted_at is null
  and redundant.status = 'not_started'
  and redundant.scores = '{}'::jsonb
  and coalesce((redundant.stats->>'hasTeacherInput')::boolean, false) = false
  and exists (
    select 1 from public.gradebooks canonical
    where canonical.assignment_group_id = redundant.assignment_group_id
      and canonical.id < redundant.id
      and canonical.deleted_at is null
      and canonical.status = 'not_started'
      and canonical.scores = '{}'::jsonb
      and (to_jsonb(canonical) - array['id','teaching_assignment_id','teacher_id','created_at','updated_at','general_info'])
        = (to_jsonb(redundant) - array['id','teaching_assignment_id','teacher_id','created_at','updated_at','general_info'])
      and (coalesce(canonical.general_info, '{}'::jsonb) - array['teacherName','teacherName2','teacherName3','homeroomTeacher1','homeroomTeacher2','homeroomTeacher3','homeroomTeachers'])
        = (coalesce(redundant.general_info, '{}'::jsonb) - array['teacherName','teacherName2','teacherName3','homeroomTeacher1','homeroomTeacher2','homeroomTeacher3','homeroomTeachers'])
  );

-- Refuse to silently discard either teacher's work if separate books exist.
do $$
begin
  if exists (
    select 1 from public.gradebooks where deleted_at is null
    group by assignment_group_id having count(*) > 1
  ) then
    raise exception 'Separate gradebooks contain existing work. Review and merge them before enabling shared gradebooks.';
  end if;
end;
$$;

alter table public.gradebooks
  alter column assignment_group_id set not null;

create unique index if not exists gradebooks_one_active_per_assignment_group
  on public.gradebooks (assignment_group_id)
  where deleted_at is null;

-- Archived copies must not block moving the shared book to another teacher.
-- The active group index above is stricter than the former per-assignment key.
alter table public.gradebooks
  drop constraint if exists gradebooks_teaching_assignment_id_key;

create index if not exists gradebooks_assignment_group_idx
  on public.gradebooks (assignment_group_id);

create or replace function public.set_gradebook_assignment_group()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null
     and not coalesce(public.current_role_is_admin(), false)
     and (new.teaching_assignment_id is distinct from old.teaching_assignment_id
       or new.teacher_id is distinct from old.teacher_id
       or new.semester_id is distinct from old.semester_id
       or new.assignment_group_id is distinct from old.assignment_group_id) then
    raise exception 'Only administrators can change gradebook ownership' using errcode = '42501';
  end if;
  select ta.assignment_group_id
    into new.assignment_group_id
  from public.teaching_assignments ta
  where ta.id = new.teaching_assignment_id;

  if new.assignment_group_id is null then
    raise exception 'Teaching assignment not found' using errcode = '23503';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_gradebook_assignment_group on public.gradebooks;
create trigger trg_gradebook_assignment_group
  before insert or update of teaching_assignment_id, assignment_group_id, teacher_id, semester_id
  on public.gradebooks
  for each row execute function public.set_gradebook_assignment_group();

create or replace function public.sync_gradebook_after_assignment_regroup()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.gradebooks
  set assignment_group_id = new.assignment_group_id
  where teaching_assignment_id = new.id
    and assignment_group_id is distinct from new.assignment_group_id;
  return new;
end;
$$;

drop trigger if exists trg_sync_gradebook_after_assignment_regroup on public.teaching_assignments;
create trigger trg_sync_gradebook_after_assignment_regroup
  after update of assignment_group_id, semester_id, subject_id, classroom_id
  on public.teaching_assignments
  for each row execute function public.sync_gradebook_after_assignment_regroup();

create or replace function public.preserve_shared_gradebook_on_assignment_delete()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_replacement record;
begin
  if exists (
    select 1 from public.gradebooks g
    where g.teaching_assignment_id = old.id and g.deleted_at is null
  ) then
    select ta.id, ta.teacher_id
      into v_replacement
    from public.teaching_assignments ta
    where ta.assignment_group_id = old.assignment_group_id
      and ta.id <> old.id
    order by ta.created_at, ta.id
    limit 1;

    if v_replacement.id is not null then
      update public.gradebooks
      set
        teaching_assignment_id = v_replacement.id,
        teacher_id = v_replacement.teacher_id
      where teaching_assignment_id = old.id
        and deleted_at is null;
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_preserve_shared_gradebook_on_assignment_delete on public.teaching_assignments;
create trigger trg_preserve_shared_gradebook_on_assignment_delete
  before delete on public.teaching_assignments
  for each row execute function public.preserve_shared_gradebook_on_assignment_delete();

-- Transactional admin API for the manual add/edit modal. It keeps the member
-- assignment rows, collaborator labels and the canonical gradebook aligned.
create or replace function public.admin_sync_teaching_assignment_group(
  p_assignment_id uuid,
  p_school_id uuid,
  p_semester_id uuid,
  p_teacher_ids uuid[],
  p_subject_id uuid,
  p_classroom_id uuid,
  p_hours_per_week integer,
  p_hours_per_semester integer,
  p_entry_start_date date,
  p_entry_end_date date,
  p_status text
) returns setof public.teaching_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_group_id uuid;
  v_new_group_id uuid;
  v_primary_assignment_id uuid;
  v_teacher_id uuid;
  v_teacher_ids uuid[];
  v_saved_ids uuid[] := array[]::uuid[];
  v_co_teacher_name text;
begin
  if not coalesce(public.current_role_is_admin(), false) or p_school_id is distinct from public.current_school_id() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_status not in ('pending', 'active') then
    raise exception 'Invalid assignment status' using errcode = '22023';
  end if;

  select array_agg(teacher_id order by position)
    into v_teacher_ids
  from (
    select teacher_id, min(position) as position
    from unnest(coalesce(p_teacher_ids, array[]::uuid[])) with ordinality as teachers(teacher_id, position)
    where teacher_id is not null
    group by teacher_id
  ) deduplicated;

  if coalesce(cardinality(v_teacher_ids), 0) = 0 then
    raise exception 'At least one teacher is required' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_teacher_ids) teacher_id
    left join public.profiles profile
      on profile.id = teacher_id
     and profile.school_id = p_school_id
     and profile.is_active = true
    where profile.id is null
  ) then
    raise exception 'Invalid teacher scope' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.semesters sem
    join public.academic_years ay on ay.id = sem.academic_year_id
    where sem.id = p_semester_id and ay.school_id = p_school_id
  ) or not exists (
    select 1 from public.subjects s where s.id = p_subject_id and s.school_id = p_school_id
  ) or not exists (
    select 1 from public.classrooms c where c.id = p_classroom_id and c.school_id = p_school_id
      and c.academic_year_id = (select academic_year_id from public.semesters where id = p_semester_id)
  ) then
    raise exception 'Invalid assignment scope' using errcode = '42501';
  end if;

  if p_assignment_id is not null then
    select ta.assignment_group_id
      into v_old_group_id
    from public.teaching_assignments ta
    where ta.id = p_assignment_id
      and ta.school_id = p_school_id
    for update;

    if v_old_group_id is null then
      raise exception 'Teaching assignment not found' using errcode = 'P0002';
    end if;

    if exists (
      select 1 from public.teaching_assignments ta
      join public.gradebooks g on g.assignment_group_id = ta.assignment_group_id
      where ta.id = p_assignment_id and g.deleted_at is null
        and (ta.semester_id <> p_semester_id or ta.subject_id <> p_subject_id or ta.classroom_id <> p_classroom_id)
    ) then
      raise exception 'สมุดนี้มีข้อมูลแล้ว กรุณาสร้างรายการใหม่เมื่อต้องเปลี่ยนวิชาหรือห้องเรียน';
    end if;

    perform 1
    from public.teaching_assignments ta
    where ta.assignment_group_id = v_old_group_id
    for update;
  end if;

  foreach v_teacher_id in array v_teacher_ids loop
    v_primary_assignment_id := null;
    v_new_group_id := null;
    select string_agg(concat_ws(' ', p.title, p.full_name), ', ' order by teacher_order.position)
      into v_co_teacher_name
    from unnest(v_teacher_ids) with ordinality as teacher_order(teacher_id, position)
    join public.profiles p on p.id = teacher_order.teacher_id
    where teacher_order.teacher_id <> v_teacher_id;

    update public.teaching_assignments ta
    set
      semester_id = p_semester_id,
      teacher_id = v_teacher_id,
      subject_id = p_subject_id,
      classroom_id = p_classroom_id,
      hours_per_week = p_hours_per_week,
      hours_per_semester = p_hours_per_semester,
      entry_start_date = p_entry_start_date,
      entry_end_date = p_entry_end_date,
      status = p_status,
      co_teacher_name = nullif(v_co_teacher_name, '')
    where ta.id = (
      select candidate.id
      from public.teaching_assignments candidate
      where candidate.teacher_id = v_teacher_id
        and (
          (v_old_group_id is not null and candidate.assignment_group_id = v_old_group_id)
          or (
            candidate.semester_id = p_semester_id
            and candidate.subject_id = p_subject_id
            and candidate.classroom_id = p_classroom_id
          )
        )
      order by
        case when candidate.assignment_group_id = v_old_group_id then 0 else 1 end,
        candidate.created_at,
        candidate.id
      limit 1
    )
    returning ta.id, ta.assignment_group_id into v_primary_assignment_id, v_new_group_id;

    if v_primary_assignment_id is null then
      insert into public.teaching_assignments (
        school_id,
        semester_id,
        teacher_id,
        subject_id,
        classroom_id,
        hours_per_week,
        hours_per_semester,
        entry_start_date,
        entry_end_date,
        status,
        created_by,
        co_teacher_name
      ) values (
        p_school_id,
        p_semester_id,
        v_teacher_id,
        p_subject_id,
        p_classroom_id,
        p_hours_per_week,
        p_hours_per_semester,
        p_entry_start_date,
        p_entry_end_date,
        p_status,
        auth.uid(),
        nullif(v_co_teacher_name, '')
      )
      returning id, assignment_group_id into v_primary_assignment_id, v_new_group_id;
    end if;

    v_saved_ids := array_append(v_saved_ids, v_primary_assignment_id);
  end loop;

  select ta.assignment_group_id
    into v_new_group_id
  from public.teaching_assignments ta
  where ta.id = v_saved_ids[1];

  if v_old_group_id is not null then
    -- Move the gradebook before deleting a removed teacher assignment. The
    -- gradebook trigger derives the new group from the selected primary row.
    update public.gradebooks
    set
      teaching_assignment_id = v_saved_ids[1],
      teacher_id = v_teacher_ids[1]
    where assignment_group_id = v_old_group_id
      and deleted_at is null;

    delete from public.teaching_assignments ta
    where ta.assignment_group_id = v_old_group_id
      and not (ta.id = any(v_saved_ids));
  end if;

  return query
  select ta.*
  from public.teaching_assignments ta
  where ta.id = any(v_saved_ids)
  order by array_position(v_saved_ids, ta.id);
end;
$$;

-- RLS helper used by gradebook policies. The group is accessible only when the
-- signed-in teacher has a matching assignment in the same school and active
-- academic year.
create or replace function public.teacher_can_access_assignment_group(
  p_assignment_group_id uuid,
  p_semester_id uuid,
  p_teacher_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teaching_assignments ta
    join public.semesters sem on sem.id = ta.semester_id
    join public.academic_years ay on ay.id = sem.academic_year_id
    where ta.assignment_group_id = p_assignment_group_id
      and ta.semester_id = p_semester_id
      and ta.teacher_id = p_teacher_id
      and ay.is_active = true
      and ay.school_id = public.current_school_id()
  );
$$;

create or replace function public.teacher_can_read_assignment_group(
  p_assignment_group_id uuid,
  p_semester_id uuid,
  p_teacher_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teaching_assignments ta
    join public.semesters sem on sem.id = ta.semester_id
    join public.academic_years ay on ay.id = sem.academic_year_id
    where ta.assignment_group_id = p_assignment_group_id
      and ta.semester_id = p_semester_id
      and ta.teacher_id = p_teacher_id
      and ay.school_id = public.current_school_id()
  );
$$;

create or replace function public.gradebook_owner_is_group_member(
  p_assignment_group_id uuid,
  p_teacher_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teaching_assignments ta
    where ta.assignment_group_id = p_assignment_group_id
      and ta.teacher_id = p_teacher_id
      and ta.school_id = public.current_school_id()
  );
$$;

drop policy if exists gb_teacher_select on public.gradebooks;
create policy gb_teacher_select
  on public.gradebooks
  for select
  using (
    public.teacher_can_read_assignment_group(
      assignment_group_id,
      semester_id,
      auth.uid()
    )
  );

drop policy if exists gb_teacher_insert_active on public.gradebooks;
create policy gb_teacher_insert_active
  on public.gradebooks
  for insert
  with check (
    teacher_id = auth.uid()
    and public.gradebook_assignment_is_active_for_teacher(
      teaching_assignment_id,
      semester_id,
      teacher_id
    )
  );

drop policy if exists gb_teacher_update_active on public.gradebooks;
create policy gb_teacher_update_active
  on public.gradebooks
  for update
  using (
    public.teacher_can_access_assignment_group(
      assignment_group_id,
      semester_id,
      auth.uid()
    )
  )
  with check (
    public.teacher_can_access_assignment_group(
      assignment_group_id,
      semester_id,
      auth.uid()
    )
    and public.gradebook_owner_is_group_member(assignment_group_id, teacher_id)
  );

comment on column public.teaching_assignments.assignment_group_id is
  'Shared subject/classroom/semester identity used by every co-teacher assignment.';
comment on column public.gradebooks.assignment_group_id is
  'Shared assignment identity; only one active gradebook is allowed per group.';

revoke all on function public.set_teaching_assignment_group() from public;
revoke all on function public.set_gradebook_assignment_group() from public;
revoke all on function public.sync_gradebook_after_assignment_regroup() from public;
revoke all on function public.preserve_shared_gradebook_on_assignment_delete() from public;
revoke all on function public.teacher_can_access_assignment_group(uuid, uuid, uuid) from public;
revoke all on function public.teacher_can_read_assignment_group(uuid, uuid, uuid) from public;
revoke all on function public.gradebook_owner_is_group_member(uuid, uuid) from public;
revoke all on function public.admin_sync_teaching_assignment_group(
  uuid, uuid, uuid, uuid[], uuid, uuid, integer, integer, date, date, text
) from public;

grant execute on function public.teacher_can_access_assignment_group(uuid, uuid, uuid) to authenticated;
grant execute on function public.teacher_can_read_assignment_group(uuid, uuid, uuid) to authenticated;
grant execute on function public.gradebook_owner_is_group_member(uuid, uuid) to authenticated;
grant execute on function public.admin_sync_teaching_assignment_group(
  uuid, uuid, uuid, uuid[], uuid, uuid, integer, integer, date, date, text
) to authenticated;

-- Copying the previous year also resolves the shared book for every co-teacher.
create or replace function clone_gradebook_structure(
  p_source_gradebook_id uuid,
  p_target_assignment_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_existing_id uuid;
  v_new_id uuid;
  v_roster jsonb;
  v_general_info jsonb;
  v_source record;
  v_target record;
begin
  select
    g.id,
    g.teacher_id,
    g.assignment_group_id,
    g.semester_id,
    p.school_id,
    g.general_info,
    g.score_config,
    g.indicators
    into v_source
  from gradebooks g
  join profiles p on p.id = g.teacher_id
  where g.id = p_source_gradebook_id
    and g.deleted_at is null;

  if v_source.id is null then
    raise exception 'Source gradebook not found' using errcode = 'P0002';
  end if;

  select
    ta.id,
    ta.assignment_group_id,
    ta.teacher_id,
    ta.semester_id,
    ta.classroom_id,
    ta.status,
    ta.hours_per_week,
    ta.hours_per_semester,
    p.full_name as teacher_name,
    p.school_id,
    sem.semester_number,
    ay.id as academic_year_id,
    ay.year_be,
    ay.is_active as year_is_active,
    c.name as classroom_name,
    s.subject_code,
    s.subject_name,
    s.learning_area
    into v_target
  from teaching_assignments ta
  join profiles p on p.id = ta.teacher_id
  join semesters sem on sem.id = ta.semester_id
  join academic_years ay on ay.id = sem.academic_year_id
  join classrooms c on c.id = ta.classroom_id
  join subjects s on s.id = ta.subject_id
  where ta.id = p_target_assignment_id;

  if v_target.id is null then
    raise exception 'Target assignment not found' using errcode = 'P0002';
  end if;

  if v_target.school_id is distinct from current_school_id()
    or v_source.school_id <> v_target.school_id
  then
    raise exception 'Invalid gradebook scope' using errcode = '42501';
  end if;

  if not coalesce(current_role_is_admin(), false) and v_target.teacher_id <> auth.uid() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if not coalesce(current_role_is_admin(), false) and not public.teacher_can_read_assignment_group(v_source.assignment_group_id, v_source.semester_id, auth.uid()) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if v_target.status <> 'active' or not v_target.year_is_active then
    raise exception 'Target assignment is not editable' using errcode = '42501';
  end if;

  select id into v_existing_id
  from gradebooks
  where assignment_group_id = v_target.assignment_group_id
    and deleted_at is null;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', st.id,
           'studentId', st.student_code,
           'citizenId', st.citizen_id,
           'name', concat_ws(' ', st.title, st.first_name, st.last_name)
         ) order by e.student_number), '[]'::jsonb)
    into v_roster
  from student_enrollments e
  join students st on st.id = e.student_id
  where e.classroom_id = v_target.classroom_id
    and e.academic_year_id = v_target.academic_year_id
    and e.status = 'active'
    and st.status = 'active';

  v_general_info := coalesce(v_source.general_info, '{}'::jsonb) || jsonb_build_object(
    'gradeLevel', v_target.classroom_name,
    'semester', v_target.semester_number::text,
    'academicYear', v_target.year_be::text,
    'subjectCode', v_target.subject_code,
    'subjectName', v_target.subject_name,
    'learningArea', v_target.learning_area,
    'totalHours', coalesce(v_target.hours_per_week::text, v_source.general_info->>'totalHours', ''),
    'hoursPerWeek', coalesce(v_target.hours_per_week::text, v_source.general_info->>'hoursPerWeek', ''),
    'hoursPerSemester', coalesce(v_target.hours_per_semester::text, v_source.general_info->>'hoursPerSemester', ''),
    'teacherName', v_target.teacher_name
  );

  insert into gradebooks (
    teaching_assignment_id,
    teacher_id,
    semester_id,
    status,
    general_info,
    students,
    score_config,
    indicators
  )
  values (
    p_target_assignment_id,
    v_target.teacher_id,
    v_target.semester_id,
    'not_started',
    v_general_info,
    v_roster,
    v_source.score_config,
    v_source.indicators
  )
  on conflict do nothing
  returning id into v_new_id;

  if v_new_id is null then
    select id into v_new_id from gradebooks
    where assignment_group_id = v_target.assignment_group_id and deleted_at is null;
    if v_new_id is null then
      raise exception 'Target gradebook could not be created';
    end if;
  end if;

  return v_new_id;
end;
$$;

revoke all on function public.clone_gradebook_structure(uuid, uuid) from public;
grant execute on function public.clone_gradebook_structure(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

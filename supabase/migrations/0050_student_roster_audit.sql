begin;

-- Keep a durable, structured history for the roster editor.  The gradebook
-- JSON is a current snapshot, so it cannot explain who added, changed, or
-- removed a student after the snapshot was saved.
create table if not exists public.student_roster_audit_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  teaching_assignment_id uuid not null references public.teaching_assignments(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  action text not null check (action in ('add', 'update', 'remove')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists student_roster_audit_school_created_idx
  on public.student_roster_audit_logs (school_id, created_at desc);
create index if not exists student_roster_audit_assignment_idx
  on public.student_roster_audit_logs (teaching_assignment_id, created_at desc);
create index if not exists student_roster_audit_student_idx
  on public.student_roster_audit_logs (student_id, created_at desc);

alter table public.student_roster_audit_logs enable row level security;
revoke all on public.student_roster_audit_logs from anon, authenticated;
grant select on public.student_roster_audit_logs to authenticated;

drop policy if exists student_roster_audit_admin_read on public.student_roster_audit_logs;
create policy student_roster_audit_admin_read
  on public.student_roster_audit_logs
  for select
  to authenticated
  using (
    school_id = public.current_school_id()
    and public.is_admin_or_exec()
  );

-- Shared/delegated gradebooks are represented by the owner's assignment.  A
-- delegated teacher must therefore be allowed to manage the same classroom
-- roster even when auth.uid() is not target.teacher_id.
create or replace function public.teacher_can_manage_assigned_roster(
  p_teaching_assignment_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_delegated boolean := false;
begin
  if auth.uid() is null or public.current_school_id() is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.teaching_assignments target
    join public.classrooms c on c.id = target.classroom_id
    where target.id = p_teaching_assignment_id
      and target.status = 'active'
      and c.school_id = public.current_school_id()
  ) then
    return false;
  end if;

  if public.current_role_is_admin() then
    return true;
  end if;

  if exists (
    select 1
    from public.teaching_assignments target
    join public.teaching_assignments actor
      on actor.classroom_id = target.classroom_id
     and actor.semester_id = target.semester_id
    where target.id = p_teaching_assignment_id
      and actor.teacher_id = auth.uid()
      and actor.status = 'active'
  ) then
    return true;
  end if;

  -- Keep this optional so the roster migration remains safe on installations
  -- that have not enabled delegation yet.
  if to_regclass('public.gradebook_delegations') is not null then
    execute $query$
      select exists (
        select 1
        from public.gradebooks g
        join public.gradebook_delegations d on d.gradebook_id = g.id
        where d.teacher_id = auth.uid()
          and g.deleted_at is null
          and exists (
            select 1
            from public.teaching_assignments target
            where target.id = $1
              and (
                g.teaching_assignment_id = target.id
                or (
                  g.assignment_group_id is not null
                  and g.assignment_group_id = target.assignment_group_id
                )
              )
          )
      )
    $query$
    into v_delegated
    using p_teaching_assignment_id;
  end if;

  return v_delegated;
end;
$$;

revoke all on function public.teacher_can_manage_assigned_roster(uuid) from public;
grant execute on function public.teacher_can_manage_assigned_roster(uuid) to authenticated;

-- Recreate the add/remove RPCs here as well.  Migration 0047 may already be
-- recorded as applied on an existing Supabase project, so changing 0047 alone
-- would not update the live function bodies.
create or replace function public.teacher_add_assigned_student(
  p_teaching_assignment_id uuid,
  p_student_code text,
  p_citizen_id text,
  p_title text,
  p_first_name text,
  p_last_name text,
  p_student_number integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid := public.current_school_id();
  v_classroom_id uuid;
  v_academic_year_id uuid;
  v_class_level_code text;
  v_student_id uuid;
  v_existing_classroom_id uuid;
  v_is_admin boolean := public.current_role_is_admin();
begin
  if auth.uid() is null or v_school_id is null then
    raise exception 'ไม่พบสิทธิ์ผู้ใช้งานสำหรับเพิ่มนักเรียน';
  end if;

  perform set_config('app.student_roster_assignment_id', p_teaching_assignment_id::text, true);

  if nullif(trim(coalesce(p_student_code, '')), '') is null
    or nullif(trim(coalesce(p_first_name, '')), '') is null then
    raise exception 'กรุณากรอกรหัสนักเรียนและชื่อนักเรียน';
  end if;

  if p_student_number is not null and p_student_number < 1 then
    raise exception 'เลขที่นักเรียนต้องมากกว่า 0';
  end if;

  select c.id, sem.academic_year_id, c.class_level_code
    into v_classroom_id, v_academic_year_id, v_class_level_code
  from public.teaching_assignments target
  join public.classrooms c on c.id = target.classroom_id
  join public.semesters sem on sem.id = target.semester_id
  where target.id = p_teaching_assignment_id
    and public.teacher_can_manage_assigned_roster(target.id)
  limit 1;

  if v_classroom_id is null then
    raise exception 'ไม่มีสิทธิ์เพิ่มนักเรียนในห้องเรียนนี้';
  end if;

  select s.id into v_student_id
  from public.students s
  where s.school_id = v_school_id
    and s.student_code = trim(p_student_code)
  limit 1;

  if v_student_id is null then
    insert into public.students (
      school_id, student_code, citizen_id, title, first_name, last_name, gender, status
    ) values (
      v_school_id,
      trim(p_student_code),
      nullif(trim(coalesce(p_citizen_id, '')), ''),
      nullif(trim(coalesce(p_title, '')), ''),
      trim(p_first_name),
      trim(coalesce(p_last_name, '')),
      case
        when trim(coalesce(p_title, '')) in ('เด็กชาย', 'ด.ช.', 'นาย') then 'ชาย'
        when trim(coalesce(p_title, '')) in ('เด็กหญิง', 'ด.ญ.', 'นางสาว', 'น.ส.', 'นาง') then 'หญิง'
        else null
      end,
      'active'
    ) returning id into v_student_id;
  else
    update public.students
    set
      citizen_id = nullif(trim(coalesce(p_citizen_id, '')), ''),
      title = nullif(trim(coalesce(p_title, '')), ''),
      first_name = trim(p_first_name),
      last_name = trim(coalesce(p_last_name, '')),
      gender = coalesce(
        case
          when trim(coalesce(p_title, '')) in ('เด็กชาย', 'ด.ช.', 'นาย') then 'ชาย'
          when trim(coalesce(p_title, '')) in ('เด็กหญิง', 'ด.ญ.', 'นางสาว', 'น.ส.', 'นาง') then 'หญิง'
          else null
        end,
        gender
      ),
      status = 'active'
    where id = v_student_id;
  end if;

  select se.classroom_id into v_existing_classroom_id
  from public.student_enrollments se
  where se.student_id = v_student_id
    and se.academic_year_id = v_academic_year_id
    and se.status = 'active'
  limit 1;

  if v_existing_classroom_id is not null
    and v_existing_classroom_id <> v_classroom_id
    and not v_is_admin then
    raise exception 'นักเรียนรหัสนี้มีห้องเรียนในปีการศึกษาปัจจุบันแล้ว กรุณาให้ผู้ดูแลระบบย้ายห้องเรียน';
  end if;

  insert into public.student_enrollments (
    student_id, academic_year_id, classroom_id, class_level_code, student_number, status
  ) values (
    v_student_id, v_academic_year_id, v_classroom_id, v_class_level_code, p_student_number, 'active'
  )
  on conflict (student_id, academic_year_id) do update
  set
    classroom_id = excluded.classroom_id,
    class_level_code = excluded.class_level_code,
    student_number = excluded.student_number,
    status = 'active';

  return v_student_id;
end;
$$;

create or replace function public.teacher_remove_assigned_student(
  p_teaching_assignment_id uuid,
  p_student_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid := public.current_school_id();
  v_classroom_id uuid;
  v_academic_year_id uuid;
  v_removed_student_id uuid;
begin
  if auth.uid() is null or v_school_id is null then
    raise exception 'ไม่พบสิทธิ์ผู้ใช้งานสำหรับลบนักเรียน';
  end if;

  perform set_config('app.student_roster_assignment_id', p_teaching_assignment_id::text, true);

  select c.id, sem.academic_year_id
    into v_classroom_id, v_academic_year_id
  from public.teaching_assignments target
  join public.classrooms c on c.id = target.classroom_id
  join public.semesters sem on sem.id = target.semester_id
  where target.id = p_teaching_assignment_id
    and public.teacher_can_manage_assigned_roster(target.id)
  limit 1;

  if v_classroom_id is null then
    raise exception 'ไม่มีสิทธิ์ลบนักเรียนจากห้องเรียนนี้';
  end if;

  update public.student_enrollments se
  set status = 'inactive'
  where se.student_id = p_student_id
    and se.academic_year_id = v_academic_year_id
    and se.classroom_id = v_classroom_id
    and se.status = 'active'
  returning se.student_id into v_removed_student_id;

  if v_removed_student_id is null then
    raise exception 'ไม่พบรายชื่อนักเรียนที่กำลังใช้งานในห้องเรียนนี้';
  end if;

  return v_removed_student_id;
end;
$$;

revoke all on function public.teacher_add_assigned_student(uuid, text, text, text, text, text, integer) from public;
revoke all on function public.teacher_remove_assigned_student(uuid, uuid) from public;
grant execute on function public.teacher_add_assigned_student(uuid, text, text, text, text, text, integer) to authenticated;
grant execute on function public.teacher_remove_assigned_student(uuid, uuid) to authenticated;

-- The original teacher update RPC predates delegated/shared gradebooks. Keep
-- its public signature, but apply the same assignment-level authorization.
create or replace function public.teacher_update_assigned_student(
  p_student_id uuid,
  p_previous_student_code text,
  p_student_code text,
  p_citizen_id text,
  p_title text,
  p_first_name text,
  p_last_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid := public.current_school_id();
  v_student_id uuid;
begin
  if auth.uid() is null or v_school_id is null then
    raise exception 'ไม่พบสิทธิ์ผู้ใช้งานสำหรับอัปเดตข้อมูลนักเรียน';
  end if;

  select s.id
    into v_student_id
  from public.students s
  where s.school_id = v_school_id
    and (
      (p_student_id is not null and s.id = p_student_id)
      or (
        nullif(trim(coalesce(p_previous_student_code, '')), '') is not null
        and s.student_code = trim(p_previous_student_code)
      )
    )
    and exists (
      select 1
      from public.student_enrollments se
      join public.teaching_assignments ta
        on ta.classroom_id = se.classroom_id
      join public.semesters sem
        on sem.id = ta.semester_id
       and sem.academic_year_id = se.academic_year_id
      where se.student_id = s.id
        and se.status = 'active'
        and public.teacher_can_manage_assigned_roster(ta.id)
    )
  limit 1;

  if v_student_id is null then
    raise exception 'ไม่พบข้อมูลนักเรียนในฐานข้อมูลกลางที่ครูคนนี้สามารถอัปเดตได้';
  end if;

  if nullif(trim(coalesce(p_student_code, '')), '') is null
    or nullif(trim(coalesce(p_first_name, '')), '') is null then
    raise exception 'กรุณากรอกรหัสนักเรียนและชื่อนักเรียน';
  end if;

  if exists (
    select 1
    from public.students duplicate
    where duplicate.school_id = v_school_id
      and duplicate.student_code = trim(p_student_code)
      and duplicate.id <> v_student_id
  ) then
    raise exception 'รหัสนักเรียนนี้ถูกใช้งานแล้ว';
  end if;

  update public.students
  set
    student_code = trim(p_student_code),
    citizen_id = nullif(trim(coalesce(p_citizen_id, '')), ''),
    title = nullif(trim(coalesce(p_title, '')), ''),
    first_name = trim(p_first_name),
    last_name = trim(coalesce(p_last_name, ''))
  where id = v_student_id;

  return v_student_id;
end;
$$;

grant execute on function public.teacher_update_assigned_student(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;

create or replace function public.student_roster_snapshot(p_student_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id,
    'studentId', s.student_code,
    'citizenId', s.citizen_id,
    'title', s.title,
    'firstName', s.first_name,
    'lastName', s.last_name,
    'name', concat_ws(' ', s.title, s.first_name, s.last_name),
    'gender', s.gender
  )
  from public.students s
  where s.id = p_student_id;
$$;

create or replace function public.student_roster_audit_assignment_id(
  p_classroom_id uuid,
  p_academic_year_id uuid
)
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_configured text := nullif(current_setting('app.student_roster_assignment_id', true), '');
  v_assignment_id uuid;
begin
  if v_configured is not null and v_configured ~* '^[0-9a-f-]{36}$' then
    select ta.id
      into v_assignment_id
    from public.teaching_assignments ta
    join public.semesters sem on sem.id = ta.semester_id
    where ta.id = v_configured::uuid
      and ta.classroom_id = p_classroom_id
      and sem.academic_year_id = p_academic_year_id
      and public.teacher_can_manage_assigned_roster(ta.id);
    if v_assignment_id is not null then
      return v_assignment_id;
    end if;
  end if;

  select ta.id
    into v_assignment_id
  from public.teaching_assignments ta
  join public.semesters sem on sem.id = ta.semester_id
  where ta.classroom_id = p_classroom_id
    and sem.academic_year_id = p_academic_year_id
    and public.teacher_can_manage_assigned_roster(ta.id)
  order by ta.created_at, ta.id
  limit 1;

  return v_assignment_id;
end;
$$;

create or replace function public.record_student_roster_audit(
  p_action text,
  p_student_id uuid,
  p_teaching_assignment_id uuid,
  p_before_data jsonb,
  p_after_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid := public.current_school_id();
begin
  if auth.uid() is null
    or v_school_id is null
    or p_teaching_assignment_id is null
    or p_action not in ('add', 'update', 'remove') then
    return;
  end if;

  insert into public.student_roster_audit_logs (
    school_id,
    teaching_assignment_id,
    teacher_id,
    student_id,
    action,
    before_data,
    after_data
  ) values (
    v_school_id,
    p_teaching_assignment_id,
    auth.uid(),
    p_student_id,
    p_action,
    p_before_data,
    p_after_data
  );
end;
$$;

create or replace function public.student_roster_snapshot_from_row(p_student public.students)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', p_student.id,
    'studentId', p_student.student_code,
    'citizenId', p_student.citizen_id,
    'title', p_student.title,
    'firstName', p_student.first_name,
    'lastName', p_student.last_name,
    'name', concat_ws(' ', p_student.title, p_student.first_name, p_student.last_name),
    'gender', p_student.gender
  );
$$;

revoke all on function public.student_roster_snapshot(uuid) from public;
revoke all on function public.student_roster_audit_assignment_id(uuid, uuid) from public;
revoke all on function public.record_student_roster_audit(text, uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.student_roster_snapshot(uuid) to authenticated;
grant execute on function public.student_roster_audit_assignment_id(uuid, uuid) to authenticated;
grant execute on function public.record_student_roster_audit(text, uuid, uuid, jsonb, jsonb) to authenticated;

create or replace function public.trg_students_student_roster_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment record;
begin
  if tg_op <> 'UPDATE'
    or (
      old.student_code is not distinct from new.student_code
      and old.citizen_id is not distinct from new.citizen_id
      and old.title is not distinct from new.title
      and old.first_name is not distinct from new.first_name
      and old.last_name is not distinct from new.last_name
      and old.gender is not distinct from new.gender
    ) then
    return new;
  end if;

  for assignment in
    select distinct on (coalesce(ta.assignment_group_id, ta.id::uuid))
      ta.id,
      se.classroom_id,
      se.academic_year_id
    from public.student_enrollments se
    join public.teaching_assignments ta on ta.classroom_id = se.classroom_id
    join public.semesters sem
      on sem.id = ta.semester_id
     and sem.academic_year_id = se.academic_year_id
    where se.student_id = new.id
      and se.status = 'active'
      and public.teacher_can_manage_assigned_roster(ta.id)
    order by coalesce(ta.assignment_group_id, ta.id::uuid), ta.id
  loop
    perform public.record_student_roster_audit(
      'update',
      new.id,
      assignment.id,
      public.student_roster_snapshot_from_row(old),
      public.student_roster_snapshot_from_row(new)
    );
  end loop;

  return new;
end;
$$;

create or replace function public.trg_student_enrollments_student_roster_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_id uuid;
  snapshot jsonb;
begin
  if tg_op = 'INSERT' and new.status = 'active' then
    assignment_id := public.student_roster_audit_assignment_id(new.classroom_id, new.academic_year_id);
    if assignment_id is not null then
      perform public.record_student_roster_audit(
        'add',
        new.student_id,
        assignment_id,
        null,
        public.student_roster_snapshot(new.student_id)
      );
    end if;
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    if old.status = 'active' and new.status <> 'active' then
      assignment_id := public.student_roster_audit_assignment_id(old.classroom_id, old.academic_year_id);
      snapshot := public.student_roster_snapshot(old.student_id);
      if assignment_id is not null then
        perform public.record_student_roster_audit('remove', old.student_id, assignment_id, snapshot, null);
      end if;
    elsif old.status <> 'active' and new.status = 'active' then
      assignment_id := public.student_roster_audit_assignment_id(new.classroom_id, new.academic_year_id);
      if assignment_id is not null then
        perform public.record_student_roster_audit(
          'add',
          new.student_id,
          assignment_id,
          null,
          public.student_roster_snapshot(new.student_id)
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_students_student_roster_audit on public.students;
create trigger trg_students_student_roster_audit
  after update of student_code, citizen_id, title, first_name, last_name, gender
  on public.students
  for each row execute function public.trg_students_student_roster_audit();

drop trigger if exists trg_student_enrollments_student_roster_audit on public.student_enrollments;
create trigger trg_student_enrollments_student_roster_audit
  after insert or update of status
  on public.student_enrollments
  for each row execute function public.trg_student_enrollments_student_roster_audit();

alter table public.student_roster_audit_logs replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'student_roster_audit_logs'
    ) then
    alter publication supabase_realtime add table public.student_roster_audit_logs;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;

-- Let an assigned teacher add or remove students from the active classroom
-- roster. Changes are stored in the central enrollment tables so the admin
-- student screen receives the same data immediately.

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
    and target.status = 'active'
    and c.school_id = v_school_id
    and (
      v_is_admin
      or exists (
        select 1
        from public.teaching_assignments actor
        where actor.teacher_id = auth.uid()
          and actor.status = 'active'
          and actor.classroom_id = target.classroom_id
          and actor.semester_id = target.semester_id
      )
    )
  limit 1;

  if v_classroom_id is null then
    raise exception 'ไม่มีสิทธิ์เพิ่มนักเรียนในห้องเรียนนี้';
  end if;

  select s.id
    into v_student_id
  from public.students s
  where s.school_id = v_school_id
    and s.student_code = trim(p_student_code)
  limit 1;

  if v_student_id is null then
    insert into public.students (
      school_id,
      student_code,
      citizen_id,
      title,
      first_name,
      last_name,
      gender,
      status
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
    )
    returning id into v_student_id;
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

  select se.classroom_id
    into v_existing_classroom_id
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
    student_id,
    academic_year_id,
    classroom_id,
    class_level_code,
    student_number,
    status
  ) values (
    v_student_id,
    v_academic_year_id,
    v_classroom_id,
    v_class_level_code,
    p_student_number,
    'active'
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
  v_is_admin boolean := public.current_role_is_admin();
begin
  if auth.uid() is null or v_school_id is null then
    raise exception 'ไม่พบสิทธิ์ผู้ใช้งานสำหรับลบนักเรียน';
  end if;

  select c.id, sem.academic_year_id
    into v_classroom_id, v_academic_year_id
  from public.teaching_assignments target
  join public.classrooms c on c.id = target.classroom_id
  join public.semesters sem on sem.id = target.semester_id
  where target.id = p_teaching_assignment_id
    and target.status = 'active'
    and c.school_id = v_school_id
    and (
      v_is_admin
      or exists (
        select 1
        from public.teaching_assignments actor
        where actor.teacher_id = auth.uid()
          and actor.status = 'active'
          and actor.classroom_id = target.classroom_id
          and actor.semester_id = target.semester_id
      )
    )
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

revoke all on function public.teacher_add_assigned_student(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer
) from public;
revoke all on function public.teacher_remove_assigned_student(uuid, uuid) from public;

grant execute on function public.teacher_add_assigned_student(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer
) to authenticated;
grant execute on function public.teacher_remove_assigned_student(uuid, uuid) to authenticated;

-- Realtime events refresh the existing admin student screen without a manual reload.
alter table public.students replica identity full;
alter table public.student_enrollments replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'students'
    ) then
    alter publication supabase_realtime add table public.students;
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'student_enrollments'
    ) then
    alter publication supabase_realtime add table public.student_enrollments;
  end if;
end;
$$;

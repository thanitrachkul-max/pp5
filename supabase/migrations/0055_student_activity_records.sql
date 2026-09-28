begin;

-- บันทึกผลกิจกรรมพัฒนาผู้เรียน: 1 เล่มต่อ 1 ห้องเรียนต่อ 1 ปีการศึกษา
-- ครูประจำชั้นของห้องเป็นผู้บันทึก (ผู้ดูแลระบบแก้ไขได้ทุกห้อง ผู้บริหารเปิดดูได้)
create table if not exists public.student_activity_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  general_info jsonb not null default '{}'::jsonb,
  students jsonb not null default '[]'::jsonb,
  attendance jsonb not null default '{}'::jsonb,
  assessments jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (classroom_id, academic_year_id)
);

create index if not exists student_activity_records_school_year_idx
  on public.student_activity_records (school_id, academic_year_id);

-- การส่งและอนุมัติผลการประเมิน (แบบเดียวกับการส่ง ปพ.5) เปลี่ยนได้ผ่านฟังก์ชันส่ง/พิจารณาด้านล่างเท่านั้น
alter table public.student_activity_records
  add column if not exists approval_status text,
  add column if not exists approval_reason text,
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

do $$
begin
  alter table public.student_activity_records
    add constraint student_activity_records_approval_status_check
    check (approval_status is null or approval_status in ('pending', 'approved', 'revision_requested'));
exception
  when duplicate_object then null;
end;
$$;

-- ครูประจำชั้น (ช่อง 1-3) แก้ไขได้เมื่อปีการศึกษายังเปิดใช้งาน ผู้ดูแลระบบแก้ไขได้เสมอ
create or replace function public.can_manage_student_activity_record(p_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.classrooms c
      join public.academic_years ay on ay.id = c.academic_year_id
      where c.id = p_classroom_id
        and c.school_id = public.current_school_id()
        and (
          public.current_role_is_admin()
          or (
            ay.is_active
            and auth.uid() in (c.homeroom_teacher_id, c.homeroom_teacher_2_id, c.homeroom_teacher_3_id)
          )
        )
    );
$$;

create or replace function public.can_read_student_activity_record(p_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.classrooms c
      where c.id = p_classroom_id
        and c.school_id = public.current_school_id()
        and (
          public.is_admin_or_exec()
          or auth.uid() in (c.homeroom_teacher_id, c.homeroom_teacher_2_id, c.homeroom_teacher_3_id)
        )
    );
$$;

-- ห้องเรียน ปีการศึกษา และโรงเรียนของแถวต้องตรงกัน (ตรวจด้วยสิทธิ์ของฟังก์ชัน ไม่ขึ้นกับสิทธิ์อ่านตารางของผู้ใช้)
create or replace function public.student_activity_record_scope_is_valid(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_classroom_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classrooms c
    where c.id = p_classroom_id
      and c.school_id = p_school_id
      and c.academic_year_id = p_academic_year_id
  );
$$;

revoke all on function public.can_manage_student_activity_record(uuid) from public;
revoke all on function public.can_read_student_activity_record(uuid) from public;
revoke all on function public.student_activity_record_scope_is_valid(uuid, uuid, uuid) from public;
grant execute on function public.can_manage_student_activity_record(uuid) to authenticated;
grant execute on function public.can_read_student_activity_record(uuid) to authenticated;
grant execute on function public.student_activity_record_scope_is_valid(uuid, uuid, uuid) to authenticated;

create or replace function public.trg_student_activity_records_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at := old.created_at;
  new.created_by := old.created_by;

  if coalesce(current_setting('app.student_activity_approval', true), '') <> 'on' then
    new.approval_status := old.approval_status;
    new.approval_reason := old.approval_reason;
    new.submitted_at := old.submitted_at;
    new.submitted_by := old.submitted_by;
    new.reviewed_at := old.reviewed_at;
    new.reviewed_by := old.reviewed_by;

    -- ส่งแล้ว/อนุมัติแล้ว ครูประจำชั้นแก้ไขได้อีกครั้งเมื่อผู้ดูแลระบบส่งกลับให้แก้ไข
    if old.approval_status in ('pending', 'approved') and not public.current_role_is_admin() then
      raise exception 'ส่งการประเมินกิจกรรมพัฒนาผู้เรียนแล้ว ไม่สามารถแก้ไขได้จนกว่าจะถูกส่งกลับให้แก้ไข';
    end if;
  end if;

  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_student_activity_records_touch on public.student_activity_records;
create trigger trg_student_activity_records_touch
  before update on public.student_activity_records
  for each row execute function public.trg_student_activity_records_touch();

create or replace function public.trg_student_activity_records_new()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.approval_status := null;
  new.approval_reason := null;
  new.submitted_at := null;
  new.submitted_by := null;
  new.reviewed_at := null;
  new.reviewed_by := null;
  return new;
end;
$$;

drop trigger if exists trg_student_activity_records_new on public.student_activity_records;
create trigger trg_student_activity_records_new
  before insert on public.student_activity_records
  for each row execute function public.trg_student_activity_records_new();

alter table public.student_activity_records enable row level security;
revoke all on public.student_activity_records from anon;
grant select, insert, update, delete on public.student_activity_records to authenticated;

drop policy if exists student_activity_records_read on public.student_activity_records;
create policy student_activity_records_read
  on public.student_activity_records
  for select
  to authenticated
  using (
    school_id = public.current_school_id()
    and public.can_read_student_activity_record(classroom_id)
  );

drop policy if exists student_activity_records_insert on public.student_activity_records;
create policy student_activity_records_insert
  on public.student_activity_records
  for insert
  to authenticated
  with check (
    school_id = public.current_school_id()
    and public.can_manage_student_activity_record(classroom_id)
    and public.student_activity_record_scope_is_valid(school_id, academic_year_id, classroom_id)
  );

drop policy if exists student_activity_records_update on public.student_activity_records;
create policy student_activity_records_update
  on public.student_activity_records
  for update
  to authenticated
  using (
    school_id = public.current_school_id()
    and public.can_manage_student_activity_record(classroom_id)
  )
  with check (
    school_id = public.current_school_id()
    and public.can_manage_student_activity_record(classroom_id)
    and public.student_activity_record_scope_is_valid(school_id, academic_year_id, classroom_id)
  );

drop policy if exists student_activity_records_admin_delete on public.student_activity_records;
create policy student_activity_records_admin_delete
  on public.student_activity_records
  for delete
  to authenticated
  using (
    school_id = public.current_school_id()
    and public.current_role_is_admin()
  );

-- ข้อมูลหน้าปก: ครูอ่านตาราง profiles ของครูคนอื่นไม่ได้ จึงรวมชื่อครูประจำชั้นและผู้ลงนามไว้ในฟังก์ชันนี้
create or replace function public.get_student_activity_context(p_classroom_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school_id uuid := public.current_school_id();
  v_classroom record;
  v_head_of_activities text;
  v_head_of_evaluation text;
  v_deputy_director text;
  v_school_director text;
begin
  if auth.uid() is null or v_school_id is null then
    raise exception 'ไม่พบสิทธิ์ผู้ใช้งาน';
  end if;

  if not public.can_read_student_activity_record(p_classroom_id) then
    raise exception 'ไม่มีสิทธิ์เปิดบันทึกกิจกรรมพัฒนาผู้เรียนของห้องเรียนนี้';
  end if;

  select
    c.id,
    c.name,
    c.class_level_code,
    c.room_number,
    c.academic_year_id,
    ay.year_be,
    ay.is_active,
    ay.start_date,
    ay.end_date,
    ay.study_start_date,
    ay.study_end_date,
    s.name as school_name,
    concat_ws(' ', nullif(h1.title, ''), nullif(h1.full_name, '')) as homeroom_1,
    concat_ws(' ', nullif(h2.title, ''), nullif(h2.full_name, '')) as homeroom_2,
    concat_ws(' ', nullif(h3.title, ''), nullif(h3.full_name, '')) as homeroom_3
    into v_classroom
  from public.classrooms c
  join public.academic_years ay on ay.id = c.academic_year_id
  join public.schools s on s.id = c.school_id
  left join public.profiles h1 on h1.id = c.homeroom_teacher_id
  left join public.profiles h2 on h2.id = c.homeroom_teacher_2_id
  left join public.profiles h3 on h3.id = c.homeroom_teacher_3_id
  where c.id = p_classroom_id
    and c.school_id = v_school_id;

  if not found then
    raise exception 'ไม่พบห้องเรียน';
  end if;

  select concat_ws(' ', nullif(p.title, ''), nullif(p.full_name, ''))
    into v_head_of_activities
  from public.school_learning_area_heads lah
  join public.profiles p on p.id = lah.teacher_id
  where lah.school_id = v_school_id
    and regexp_replace(coalesce(lah.learning_area, ''), '[[:space:]]+', '', 'g') = 'กิจกรรมพัฒนาผู้เรียน'
  limit 1;

  select
    concat_ws(' ', nullif(evaluation_profile.title, ''), nullif(evaluation_profile.full_name, '')),
    concat_ws(' ', nullif(deputy_profile.title, ''), nullif(deputy_profile.full_name, '')),
    concat_ws(' ', nullif(director_profile.title, ''), nullif(director_profile.full_name, ''))
    into v_head_of_evaluation, v_deputy_director, v_school_director
  from public.school_pap5_officials officials
  left join public.profiles evaluation_profile on evaluation_profile.id = officials.head_of_evaluation_id
  left join public.profiles deputy_profile on deputy_profile.id = officials.deputy_director_id
  left join public.profiles director_profile on director_profile.id = officials.school_director_id
  where officials.school_id = v_school_id
  limit 1;

  return jsonb_build_object(
    'school_id', v_school_id,
    'school_name', v_classroom.school_name,
    'classroom', jsonb_build_object(
      'id', v_classroom.id,
      'name', v_classroom.name,
      'class_level_code', v_classroom.class_level_code,
      'room_number', v_classroom.room_number
    ),
    'year', jsonb_build_object(
      'id', v_classroom.academic_year_id,
      'year_be', v_classroom.year_be,
      'is_active', v_classroom.is_active,
      'start_date', v_classroom.start_date,
      'end_date', v_classroom.end_date,
      'study_start_date', v_classroom.study_start_date,
      'study_end_date', v_classroom.study_end_date
    ),
    'semesters', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'semester_number', sem.semester_number,
          'start_date', sem.start_date,
          'end_date', sem.end_date
        )
        order by sem.semester_number
      )
      from public.semesters sem
      where sem.academic_year_id = v_classroom.academic_year_id
    ), '[]'::jsonb),
    'homeroom_teachers', jsonb_build_array(
      v_classroom.homeroom_1,
      v_classroom.homeroom_2,
      v_classroom.homeroom_3
    ),
    'officials', jsonb_build_object(
      'head_of_activities', coalesce(v_head_of_activities, ''),
      'head_of_evaluation', coalesce(v_head_of_evaluation, ''),
      'deputy_director', coalesce(v_deputy_director, ''),
      'school_director', coalesce(v_school_director, '')
    ),
    'can_edit', public.can_manage_student_activity_record(p_classroom_id),
    'can_review', public.current_role_is_admin()
  );
end;
$$;

revoke all on function public.get_student_activity_context(uuid) from public;
grant execute on function public.get_student_activity_context(uuid) to authenticated;

create or replace function public.student_activity_approval_json(p_record public.student_activity_records)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'approval_status', p_record.approval_status,
    'approval_reason', p_record.approval_reason,
    'submitted_at', p_record.submitted_at,
    'reviewed_at', p_record.reviewed_at
  );
$$;

-- ครูประจำชั้นส่งการประเมินเมื่อบันทึกครบ 100% (ส่งซ้ำได้หลังถูกส่งกลับให้แก้ไข)
create or replace function public.submit_student_activity_record(p_record_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.student_activity_records%rowtype;
begin
  if auth.uid() is null or public.current_school_id() is null then
    raise exception 'ไม่พบสิทธิ์ผู้ใช้งาน';
  end if;

  select * into v_record
  from public.student_activity_records r
  where r.id = p_record_id
    and r.school_id = public.current_school_id()
  for update;

  if not found then
    raise exception 'ไม่พบบันทึกกิจกรรมพัฒนาผู้เรียน';
  end if;

  if not public.can_manage_student_activity_record(v_record.classroom_id) then
    raise exception 'ไม่มีสิทธิ์ส่งการประเมินกิจกรรมพัฒนาผู้เรียนของห้องเรียนนี้';
  end if;

  if v_record.approval_status = 'pending' then
    raise exception 'ส่งการประเมินกิจกรรมพัฒนาผู้เรียนแล้ว กำลังรออนุมัติ';
  end if;

  if v_record.approval_status = 'approved' then
    raise exception 'การประเมินกิจกรรมพัฒนาผู้เรียนได้รับการอนุมัติแล้ว';
  end if;

  if coalesce((v_record.stats ->> 'completionPercent')::numeric, 0) < 100 then
    raise exception 'กรุณาบันทึกข้อมูลกิจกรรมพัฒนาผู้เรียนให้ครบ 100%% ก่อนส่ง';
  end if;

  perform set_config('app.student_activity_approval', 'on', true);
  update public.student_activity_records
  set
    approval_status = 'pending',
    approval_reason = null,
    submitted_at = now(),
    submitted_by = auth.uid(),
    reviewed_at = null,
    reviewed_by = null
  where id = p_record_id
  returning * into v_record;
  perform set_config('app.student_activity_approval', 'off', true);

  return public.student_activity_approval_json(v_record);
end;
$$;

-- ผู้ดูแลระบบอนุมัติ หรือส่งกลับให้แก้ไขพร้อมเหตุผล
create or replace function public.review_student_activity_record(
  p_record_id uuid,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.student_activity_records%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or public.current_school_id() is null then
    raise exception 'ไม่พบสิทธิ์ผู้ใช้งาน';
  end if;

  if not public.current_role_is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่พิจารณาอนุมัติการประเมินกิจกรรมพัฒนาผู้เรียนได้';
  end if;

  if p_status is null or p_status not in ('approved', 'revision_requested') then
    raise exception 'สถานะการพิจารณาไม่ถูกต้อง';
  end if;

  if p_status = 'revision_requested' and v_reason is null then
    raise exception 'กรุณาระบุเหตุผลที่ไม่อนุมัติ';
  end if;

  select * into v_record
  from public.student_activity_records r
  where r.id = p_record_id
    and r.school_id = public.current_school_id()
  for update;

  if not found then
    raise exception 'ไม่พบบันทึกกิจกรรมพัฒนาผู้เรียน';
  end if;

  if v_record.approval_status is null or v_record.approval_status = 'revision_requested' then
    raise exception 'ครูประจำชั้นยังไม่ได้ส่งการประเมินกิจกรรมพัฒนาผู้เรียน';
  end if;

  perform set_config('app.student_activity_approval', 'on', true);
  update public.student_activity_records
  set
    approval_status = p_status,
    approval_reason = case when p_status = 'revision_requested' then v_reason else null end,
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where id = p_record_id
  returning * into v_record;
  perform set_config('app.student_activity_approval', 'off', true);

  return public.student_activity_approval_json(v_record);
end;
$$;

revoke all on function public.student_activity_approval_json(public.student_activity_records) from public;
revoke all on function public.submit_student_activity_record(uuid) from public;
revoke all on function public.review_student_activity_record(uuid, text, text) from public;
grant execute on function public.submit_student_activity_record(uuid) to authenticated;
grant execute on function public.review_student_activity_record(uuid, text, text) to authenticated;

-- ครูประจำชั้นแก้ไขรายชื่อนักเรียนของห้องได้จากหน้าเวลาเรียนกิจกรรมพัฒนาผู้เรียน
-- (บันทึกลงทะเบียนกลางเหมือนหน้าเวลาเรียน ปพ.5)
create or replace function public.homeroom_add_classroom_student(
  p_classroom_id uuid,
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
  v_academic_year_id uuid;
  v_class_level_code text;
  v_student_id uuid;
  v_existing_classroom_id uuid;
  v_is_admin boolean := public.current_role_is_admin();
begin
  if auth.uid() is null or v_school_id is null then
    raise exception 'ไม่พบสิทธิ์ผู้ใช้งานสำหรับเพิ่มนักเรียน';
  end if;

  if not public.can_manage_student_activity_record(p_classroom_id) then
    raise exception 'ไม่มีสิทธิ์เพิ่มนักเรียนในห้องเรียนนี้';
  end if;

  if nullif(trim(coalesce(p_student_code, '')), '') is null
    or nullif(trim(coalesce(p_first_name, '')), '') is null then
    raise exception 'กรุณากรอกรหัสนักเรียนและชื่อนักเรียน';
  end if;

  if p_student_number is not null and p_student_number < 1 then
    raise exception 'เลขที่นักเรียนต้องมากกว่า 0';
  end if;

  select c.academic_year_id, c.class_level_code
    into v_academic_year_id, v_class_level_code
  from public.classrooms c
  where c.id = p_classroom_id
    and c.school_id = v_school_id;

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
    and v_existing_classroom_id <> p_classroom_id
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
    p_classroom_id,
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

create or replace function public.homeroom_remove_classroom_student(
  p_classroom_id uuid,
  p_student_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed_student_id uuid;
begin
  if auth.uid() is null or public.current_school_id() is null then
    raise exception 'ไม่พบสิทธิ์ผู้ใช้งานสำหรับลบนักเรียน';
  end if;

  if not public.can_manage_student_activity_record(p_classroom_id) then
    raise exception 'ไม่มีสิทธิ์ลบนักเรียนจากห้องเรียนนี้';
  end if;

  update public.student_enrollments se
  set status = 'inactive'
  from public.classrooms c
  where c.id = p_classroom_id
    and se.student_id = p_student_id
    and se.classroom_id = c.id
    and se.academic_year_id = c.academic_year_id
    and se.status = 'active'
  returning se.student_id into v_removed_student_id;

  if v_removed_student_id is null then
    raise exception 'ไม่พบรายชื่อนักเรียนที่กำลังใช้งานในห้องเรียนนี้';
  end if;

  return v_removed_student_id;
end;
$$;

create or replace function public.homeroom_update_classroom_student(
  p_classroom_id uuid,
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

  if not public.can_manage_student_activity_record(p_classroom_id) then
    raise exception 'ไม่มีสิทธิ์แก้ไขข้อมูลนักเรียนในห้องเรียนนี้';
  end if;

  select s.id
    into v_student_id
  from public.students s
  join public.classrooms c on c.id = p_classroom_id
  join public.student_enrollments se
    on se.student_id = s.id
   and se.classroom_id = c.id
   and se.academic_year_id = c.academic_year_id
   and se.status = 'active'
  where s.school_id = v_school_id
    and (
      (p_student_id is not null and s.id = p_student_id)
      or (
        nullif(trim(coalesce(p_previous_student_code, '')), '') is not null
        and s.student_code = trim(p_previous_student_code)
      )
    )
  limit 1;

  if v_student_id is null then
    raise exception 'ไม่พบข้อมูลนักเรียนในห้องเรียนนี้';
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

revoke all on function public.homeroom_add_classroom_student(uuid, text, text, text, text, text, integer) from public;
revoke all on function public.homeroom_remove_classroom_student(uuid, uuid) from public;
revoke all on function public.homeroom_update_classroom_student(uuid, uuid, text, text, text, text, text, text) from public;
grant execute on function public.homeroom_add_classroom_student(uuid, text, text, text, text, text, integer) to authenticated;
grant execute on function public.homeroom_remove_classroom_student(uuid, uuid) to authenticated;
grant execute on function public.homeroom_update_classroom_student(uuid, uuid, text, text, text, text, text, text) to authenticated;

-- ให้หน้าครูและหน้าบันทึกเห็นผลการส่ง/อนุมัติทันทีโดยไม่ต้องรีเฟรช
alter table public.student_activity_records replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'student_activity_records'
    ) then
    alter publication supabase_realtime add table public.student_activity_records;
  end if;
end;
$$;

commit;

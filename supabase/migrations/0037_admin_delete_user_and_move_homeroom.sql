-- Permanent account deletion fallback and atomic homeroom-teacher moves.

create or replace function public.admin_delete_user_account(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller record;
  v_target record;
begin
  select role, school_id
    into v_caller
  from public.profiles
  where id = auth.uid();

  if coalesce(v_caller.role::text, '') not in ('super_admin', 'admin') then
    raise exception 'Forbidden';
  end if;

  if p_id = auth.uid() then
    raise exception 'ไม่สามารถลบบัญชีของตัวเองได้';
  end if;

  select id, school_id, role, full_name
    into v_target
  from public.profiles
  where id = p_id;

  if v_target.id is null then
    raise exception 'ไม่พบบัญชีผู้ใช้งาน';
  end if;

  if v_target.school_id is distinct from v_caller.school_id then
    raise exception 'Forbidden';
  end if;

  if v_target.role::text = 'super_admin' and v_caller.role::text <> 'super_admin' then
    raise exception 'เฉพาะ Super Admin เท่านั้นที่ลบบัญชีผู้พัฒนาระบบได้';
  end if;

  -- profiles references auth.users with ON DELETE CASCADE. Related assignments,
  -- gradebooks and device sessions are removed by their existing FK cascades;
  -- homeroom/official references use ON DELETE SET NULL.
  delete from auth.users where id = p_id;
  if not found then
    raise exception 'ไม่พบบัญชีผู้ใช้งานใน Auth';
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', p_id,
    'full_name', v_target.full_name
  );
end;
$$;

grant execute on function public.admin_delete_user_account(uuid) to authenticated;

create or replace function public.admin_move_homeroom_teacher(
  p_classroom_id uuid,
  p_field text,
  p_teacher_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller record;
  v_target record;
  v_teacher record;
begin
  select role, school_id
    into v_caller
  from public.profiles
  where id = auth.uid();

  if coalesce(v_caller.role::text, '') not in ('super_admin', 'admin') then
    raise exception 'Forbidden';
  end if;

  if p_field not in ('homeroom_teacher_id', 'homeroom_teacher_2_id', 'homeroom_teacher_3_id') then
    raise exception 'ช่องครูประจำชั้นไม่ถูกต้อง';
  end if;

  select id, school_id, academic_year_id, name
    into v_target
  from public.classrooms
  where id = p_classroom_id
  for update;

  if v_target.id is null then
    raise exception 'ไม่พบห้องเรียน';
  end if;

  if v_target.school_id is distinct from v_caller.school_id then
    raise exception 'Forbidden';
  end if;

  select id, school_id, role, is_active, full_name
    into v_teacher
  from public.profiles
  where id = p_teacher_id;

  if v_teacher.id is null
    or v_teacher.school_id is distinct from v_target.school_id
    or v_teacher.role::text <> 'teacher'
    or v_teacher.is_active is not true
  then
    raise exception 'ครูที่เลือกไม่พร้อมสำหรับการมอบหมาย';
  end if;

  -- Lock every classroom in the same year before clearing the teacher's old
  -- slot. This makes the move and the target replacement one transaction.
  perform id
  from public.classrooms
  where school_id = v_target.school_id
    and academic_year_id = v_target.academic_year_id
  for update;

  update public.classrooms
  set
    homeroom_teacher_id = case when homeroom_teacher_id = p_teacher_id then null else homeroom_teacher_id end,
    homeroom_teacher_2_id = case when homeroom_teacher_2_id = p_teacher_id then null else homeroom_teacher_2_id end,
    homeroom_teacher_3_id = case when homeroom_teacher_3_id = p_teacher_id then null else homeroom_teacher_3_id end
  where school_id = v_target.school_id
    and academic_year_id = v_target.academic_year_id
    and (
      homeroom_teacher_id = p_teacher_id
      or homeroom_teacher_2_id = p_teacher_id
      or homeroom_teacher_3_id = p_teacher_id
    );

  execute format('update public.classrooms set %I = $1 where id = $2', p_field)
    using p_teacher_id, p_classroom_id;

  return jsonb_build_object(
    'ok', true,
    'classroom_id', p_classroom_id,
    'classroom_name', v_target.name,
    'field', p_field,
    'teacher_id', p_teacher_id,
    'teacher_name', v_teacher.full_name
  );
end;
$$;

grant execute on function public.admin_move_homeroom_teacher(uuid, text, uuid) to authenticated;

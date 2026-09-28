-- Atomic admin-only activity approval changes, scoped to one school and year.
create or replace function public.bulk_set_student_activity_approval(
  p_year_id uuid, p_record_ids uuid[], p_status text,
  p_reason text default null, p_pending_only boolean default false
) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or public.current_school_id() is null
    or not public.current_role_is_admin()
    or not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'เฉพาะผู้ดูแลระบบที่เปิดใช้งานเท่านั้น';
  end if;
  if p_status is null or p_status not in ('pending', 'approved', 'revision_requested') then
    raise exception 'สถานะการพิจารณาไม่ถูกต้อง';
  end if;
  if p_status = 'revision_requested' and v_reason is null then
    raise exception 'กรุณาระบุเหตุผลที่ให้แก้ไข';
  end if;
  if p_pending_only and p_status <> 'approved' then
    raise exception 'การอนุมัติทั้งหมดต้องเลือกสถานะอนุมัติแล้ว';
  end if;
  perform set_config('app.student_activity_approval', 'on', true);
  update public.student_activity_records
  set approval_status = p_status,
      approval_reason = case when p_status = 'revision_requested' then v_reason else null end,
      reviewed_at = case when p_status = 'pending' then null else now() end,
      reviewed_by = case when p_status = 'pending' then null else auth.uid() end
  where school_id = public.current_school_id()
    and academic_year_id = p_year_id
    and id = any(p_record_ids)
    and approval_status is not null
    and (not p_pending_only or approval_status = 'pending');
  get diagnostics v_count = row_count;
  perform set_config('app.student_activity_approval', 'off', true);
  return v_count;
end;
$$;
revoke all on function public.bulk_set_student_activity_approval(uuid, uuid[], text, text, boolean) from public;
grant execute on function public.bulk_set_student_activity_approval(uuid, uuid[], text, text, boolean) to authenticated;

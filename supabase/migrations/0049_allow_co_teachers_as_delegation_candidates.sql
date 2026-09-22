begin;

-- A teacher who already belongs to the shared subject group can still be the
-- person explicitly assigned to record results. Keep them visible in the
-- delegation picker instead of silently removing them from search results.
create or replace function public.gradebook_delegation_teachers(p_gradebook_id uuid)
returns table(id uuid, name text, classrooms text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_manage_gradebook_delegation(p_gradebook_id) then
    raise exception 'ไม่มีสิทธิ์มอบหมายสมุดนี้' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    concat_ws(' ', p.title, p.full_name),
    array(
      select c.name
      from classrooms c
      join semesters sem on sem.academic_year_id = c.academic_year_id
      join gradebooks g on g.semester_id = sem.id
      where g.id = p_gradebook_id
        and c.school_id = p.school_id
        and p.id in (
          c.homeroom_teacher_id,
          c.homeroom_teacher_2_id,
          c.homeroom_teacher_3_id
        )
      order by c.name
    )
  from profiles p
  where p.school_id = current_school_id()
    and p.is_active
    and p.role in ('teacher', 'admin', 'super_admin', 'executive')
    and p.id <> auth.uid()
  order by p.full_name;
end;
$$;

revoke all on function public.gradebook_delegation_teachers(uuid) from public;
grant execute on function public.gradebook_delegation_teachers(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

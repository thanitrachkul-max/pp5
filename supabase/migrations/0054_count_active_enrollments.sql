begin;

create or replace function public.count_active_enrollments(p_classroom_ids uuid[])
returns table(classroom_id uuid, academic_year_id uuid, student_count bigint)
language sql stable security invoker set search_path = public
as $$
  select e.classroom_id, e.academic_year_id, count(*)::bigint
  from student_enrollments e
  where e.classroom_id = any(p_classroom_ids) and e.status = 'active'
  group by e.classroom_id, e.academic_year_id;
$$;

revoke all on function public.count_active_enrollments(uuid[]) from public;
grant execute on function public.count_active_enrollments(uuid[]) to authenticated;
notify pgrst, 'reload schema';
commit;

-- Keep collaborator labels and the saved cover aligned with actual membership.
-- The existing BEFORE DELETE trigger preserves the shared book and scores.
create or replace function public.sync_teachers_after_assignment_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.teaching_assignments target
  set co_teacher_name = (
    select string_agg(trim(concat_ws(' ', p.title, p.full_name)), ', ' order by member.created_at, member.id)
    from public.teaching_assignments member
    join public.profiles p on p.id = member.teacher_id
    where member.assignment_group_id = old.assignment_group_id
      and member.teacher_id <> target.teacher_id
  )
  where target.assignment_group_id = old.assignment_group_id;

  update public.gradebooks book
  set general_info = coalesce(book.general_info, '{}'::jsonb) || jsonb_build_object(
    'teacherName', coalesce(names.labels[1], ''),
    'teacherName2', coalesce(names.labels[2], ''),
    'teacherName3', coalesce(names.labels[3], '')
  )
  from (
    select g.id, array_agg(trim(concat_ws(' ', p.title, p.full_name))
      order by (member.id = g.teaching_assignment_id) desc, member.created_at, member.id) as labels
    from public.gradebooks g
    join public.teaching_assignments member on member.assignment_group_id = g.assignment_group_id
    join public.profiles p on p.id = member.teacher_id
    where g.assignment_group_id = old.assignment_group_id and g.deleted_at is null
    group by g.id
  ) names
  where book.id = names.id;
  return old;
end;
$$;

revoke all on function public.sync_teachers_after_assignment_delete() from public;
drop trigger if exists trg_sync_teachers_after_assignment_delete on public.teaching_assignments;
create trigger trg_sync_teachers_after_assignment_delete
  after delete on public.teaching_assignments
  for each row execute function public.sync_teachers_after_assignment_delete();

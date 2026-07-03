-- Allow admins to record Pap.5 approval decisions and broadcast gradebook changes.

drop policy if exists gb_admin_update_approval on public.gradebooks;

create policy gb_admin_update_approval
  on public.gradebooks
  for update
  using (
    public.current_role_is_admin()
    and exists (
      select 1
      from public.teaching_assignments ta
      where ta.id = teaching_assignment_id
        and ta.school_id = public.current_school_id()
    )
  )
  with check (
    public.current_role_is_admin()
    and exists (
      select 1
      from public.teaching_assignments ta
      where ta.id = teaching_assignment_id
        and ta.school_id = public.current_school_id()
    )
  );

alter table public.gradebooks replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.gradebooks;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

begin;

-- Delegates edit the existing book; teaching staff and printed names stay intact.
create table public.gradebook_delegations (
  id uuid primary key default gen_random_uuid(),
  gradebook_id uuid not null references public.gradebooks(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (gradebook_id, teacher_id)
);
alter table public.gradebook_delegations enable row level security;
revoke all on public.gradebook_delegations from anon, authenticated;

create function public.is_gradebook_delegate(p_group_id uuid, p_semester_id uuid, p_teacher_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_teacher_id = auth.uid() and exists (
    select 1 from gradebook_delegations d
    join gradebooks g on g.id = d.gradebook_id
    join profiles p on p.id = d.teacher_id
    join teaching_assignments ta on ta.id = g.teaching_assignment_id
    where d.teacher_id = p_teacher_id and p.is_active
      and p.school_id = current_school_id() and ta.school_id = p.school_id
      and g.assignment_group_id = p_group_id and g.semester_id = p_semester_id
      and g.deleted_at is null
  );
$$;

create or replace function public.teacher_can_read_assignment_group(p_assignment_group_id uuid, p_semester_id uuid, p_teacher_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from teaching_assignments ta join semesters sem on sem.id = ta.semester_id
    join academic_years ay on ay.id = sem.academic_year_id
    where ta.assignment_group_id = p_assignment_group_id and ta.semester_id = p_semester_id
      and ta.teacher_id = p_teacher_id and ay.school_id = current_school_id()
  ) or is_gradebook_delegate(p_assignment_group_id, p_semester_id, p_teacher_id);
$$;

create or replace function public.teacher_can_access_assignment_group(p_assignment_group_id uuid, p_semester_id uuid, p_teacher_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from semesters sem join academic_years ay on ay.id = sem.academic_year_id
    where sem.id = p_semester_id and ay.is_active and ay.school_id = current_school_id()
      and teacher_can_read_assignment_group(p_assignment_group_id, p_semester_id, p_teacher_id)
  );
$$;

create policy ta_delegate_read on public.teaching_assignments for select to authenticated
using (public.is_gradebook_delegate(assignment_group_id, semester_id, auth.uid()));

create function public.can_manage_gradebook_delegation(p_gradebook_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from gradebooks g join teaching_assignments ta on ta.assignment_group_id = g.assignment_group_id
    join profiles p on p.id = auth.uid()
    where g.id = p_gradebook_id and g.deleted_at is null and p.is_active
      and ta.school_id = p.school_id and p.school_id = current_school_id()
      and (ta.teacher_id = auth.uid() or current_role_is_admin())
  );
$$;

create function public.list_gradebook_delegations()
returns table(id uuid, gradebook_id uuid, assignment_id uuid, assignment_group_id uuid,
  teacher_id uuid, teacher_name text, assigned_by uuid, assigned_by_name text)
language sql stable security definer set search_path = public as $$
  select d.id, g.id, g.teaching_assignment_id, g.assignment_group_id, d.teacher_id,
    concat_ws(' ', p.title, p.full_name), d.assigned_by, concat_ws(' ', owner.title, owner.full_name)
  from gradebook_delegations d join gradebooks g on g.id = d.gradebook_id
  join profiles p on p.id = d.teacher_id join profiles owner on owner.id = d.assigned_by
  where g.deleted_at is null and (can_manage_gradebook_delegation(g.id)
    or is_gradebook_delegate(g.assignment_group_id, g.semester_id, auth.uid()));
$$;

create function public.gradebook_delegation_teachers(p_gradebook_id uuid)
returns table(id uuid, name text, classrooms text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_manage_gradebook_delegation(p_gradebook_id) then
    raise exception 'ไม่มีสิทธิ์มอบหมายสมุดนี้' using errcode = '42501';
  end if;
  return query select p.id, concat_ws(' ', p.title, p.full_name),
    array(select c.name from classrooms c join semesters sem on sem.academic_year_id = c.academic_year_id
      join gradebooks g on g.semester_id = sem.id
      where g.id = p_gradebook_id and c.school_id = p.school_id
        and p.id in (c.homeroom_teacher_id, c.homeroom_teacher_2_id, c.homeroom_teacher_3_id)
      order by c.name)
  from profiles p where p.school_id = current_school_id() and p.is_active
    and p.role in ('teacher', 'admin', 'super_admin') and p.id <> auth.uid()
    and not exists (select 1 from teaching_assignments ta join gradebooks g on g.assignment_group_id = ta.assignment_group_id
      where g.id = p_gradebook_id and ta.teacher_id = p.id)
  order by p.full_name;
end;
$$;

create function public.set_gradebook_delegation(p_gradebook_id uuid, p_teacher_id uuid, p_revoke boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Serialize mutations with deletion/ownership changes of the shared book.
  perform 1 from gradebooks where id = p_gradebook_id for update;
  if not can_manage_gradebook_delegation(p_gradebook_id) then
    raise exception 'ไม่มีสิทธิ์มอบหมายสมุดนี้' using errcode = '42501';
  end if;
  if p_revoke then
    delete from gradebook_delegations where gradebook_id = p_gradebook_id and teacher_id = p_teacher_id;
    return;
  end if;
  if not exists (select 1 from gradebook_delegation_teachers(p_gradebook_id) t where t.id = p_teacher_id) then
    raise exception 'กรุณาเลือกครูที่ยังปฏิบัติงานในโรงเรียนและไม่ได้เป็นครูผู้สอนวิชานี้' using errcode = '42501';
  end if;
  insert into gradebook_delegations(gradebook_id, teacher_id, assigned_by)
    values (p_gradebook_id, p_teacher_id, auth.uid()) on conflict (gradebook_id, teacher_id) do nothing;
end;
$$;

revoke all on function public.is_gradebook_delegate(uuid,uuid,uuid) from public;
revoke all on function public.can_manage_gradebook_delegation(uuid) from public;
revoke all on function public.list_gradebook_delegations() from public;
revoke all on function public.gradebook_delegation_teachers(uuid) from public;
revoke all on function public.set_gradebook_delegation(uuid,uuid,boolean) from public;
grant execute on function public.is_gradebook_delegate(uuid,uuid,uuid) to authenticated;
grant execute on function public.can_manage_gradebook_delegation(uuid) to authenticated;
grant execute on function public.list_gradebook_delegations() to authenticated;
grant execute on function public.gradebook_delegation_teachers(uuid) to authenticated;
grant execute on function public.set_gradebook_delegation(uuid,uuid,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;

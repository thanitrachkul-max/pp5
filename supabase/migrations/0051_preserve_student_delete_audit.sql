begin;

-- A timetable row can be intentionally kept in the `pending` state while it
-- is still assigned and visible to the teacher.  Match the gradebook access
-- rules: roster management follows assignment ownership/delegation and the
-- active academic year, not the separate timetable workflow status.
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
    join public.semesters sem on sem.id = target.semester_id
    join public.academic_years ay on ay.id = sem.academic_year_id
    where target.id = p_teaching_assignment_id
      and c.school_id = public.current_school_id()
      and ay.school_id = c.school_id
      and ay.is_active = true
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
      and actor.status in ('active', 'pending')
  ) then
    return true;
  end if;

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

-- A permanent student delete must not erase the audit entry that explains the
-- deletion.  Keep the student snapshot in before_data and make the foreign
-- key nullable so the history survives the cascade from students.
alter table public.student_roster_audit_logs
  alter column student_id drop not null;

alter table public.student_roster_audit_logs
  drop constraint if exists student_roster_audit_logs_student_id_fkey;

alter table public.student_roster_audit_logs
  add constraint student_roster_audit_logs_student_id_fkey
  foreign key (student_id)
  references public.students(id)
  on delete set null;

-- Keep every active gradebook snapshot in the same classroom/year aligned with
-- the central enrollment roster.  Per-book fields (for example
-- targetPercentage) are preserved while identity and ordering fields come
-- from the current enrollment rows.
create or replace function public.sync_gradebook_roster_for_classroom(
  p_classroom_id uuid,
  p_academic_year_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.gradebooks g
  set students = coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', st.id,
          'studentId', st.student_code,
          'citizenId', st.citizen_id,
          'name', concat_ws(' ', st.title, st.first_name, st.last_name),
          'studentNumber', enrollment.student_number
        ) || coalesce(
          (
            select saved_student - array[
              'id', 'studentId', 'citizenId', 'name', 'studentNumber'
            ]
            from jsonb_array_elements(coalesce(g.students, '[]'::jsonb)) saved_student
            where saved_student->>'id' = st.id::text
            limit 1
          ),
          '{}'::jsonb
        )
        order by enrollment.student_number nulls last, enrollment.id
      )
      from public.student_enrollments enrollment
      join public.students st on st.id = enrollment.student_id
      where enrollment.classroom_id = p_classroom_id
        and enrollment.academic_year_id = p_academic_year_id
        and enrollment.status = 'active'
    ),
    '[]'::jsonb
  )
  from public.teaching_assignments ta
  join public.semesters sem on sem.id = ta.semester_id
  where g.teaching_assignment_id = ta.id
    and g.deleted_at is null
    and ta.classroom_id = p_classroom_id
    and sem.academic_year_id = p_academic_year_id;
$$;

revoke all on function public.sync_gradebook_roster_for_classroom(uuid, uuid) from public;

-- Repair snapshots created before this migration, including books whose
-- classroom currently has no active enrollment rows.
do $$
declare
  target record;
begin
  for target in
    select distinct ta.classroom_id, sem.academic_year_id
    from public.gradebooks g
    join public.teaching_assignments ta on ta.id = g.teaching_assignment_id
    join public.semesters sem on sem.id = ta.semester_id
    where g.deleted_at is null
  loop
    perform public.sync_gradebook_roster_for_classroom(
      target.classroom_id,
      target.academic_year_id
    );
  end loop;
end;
$$;

-- The admin student screen deletes from public.students directly.  Capture a
-- remove event before the FK cascades delete the active enrollment rows.  The
-- student's complete identity remains available in before_data even though
-- student_id is set to null after the student row is deleted.
create or replace function public.trg_students_student_roster_delete_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment record;
begin
  if auth.uid() is null or public.current_school_id() is null then
    return old;
  end if;

  for assignment in
    select distinct on (coalesce(ta.assignment_group_id, ta.id::uuid))
      ta.id
    from public.student_enrollments se
    join public.teaching_assignments ta
      on ta.classroom_id = se.classroom_id
    join public.semesters sem
      on sem.id = ta.semester_id
     and sem.academic_year_id = se.academic_year_id
    where se.student_id = old.id
      and se.status = 'active'
      and public.teacher_can_manage_assigned_roster(ta.id)
    order by coalesce(ta.assignment_group_id, ta.id::uuid), ta.id
  loop
    perform public.record_student_roster_audit(
      'remove',
      old.id,
      assignment.id,
      public.student_roster_snapshot_from_row(old),
      null
    );
  end loop;

  return old;
end;
$$;

drop trigger if exists trg_students_student_roster_delete_audit on public.students;
create trigger trg_students_student_roster_delete_audit
  before delete on public.students
  for each row execute function public.trg_students_student_roster_delete_audit();

create or replace function public.trg_student_enrollments_student_gradebook_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_gradebook_roster_for_classroom(old.classroom_id, old.academic_year_id);
    return old;
  end if;

  perform public.sync_gradebook_roster_for_classroom(new.classroom_id, new.academic_year_id);
  if tg_op = 'UPDATE'
    and (old.classroom_id is distinct from new.classroom_id
      or old.academic_year_id is distinct from new.academic_year_id) then
    perform public.sync_gradebook_roster_for_classroom(old.classroom_id, old.academic_year_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_student_enrollments_student_gradebook_sync on public.student_enrollments;
create trigger trg_student_enrollments_student_gradebook_sync
  after insert or update or delete
  on public.student_enrollments
  for each row execute function public.trg_student_enrollments_student_gradebook_sync();

create or replace function public.trg_students_student_gradebook_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  enrollment record;
begin
  for enrollment in
    select classroom_id, academic_year_id
    from public.student_enrollments
    where student_id = new.id
      and status = 'active'
  loop
    perform public.sync_gradebook_roster_for_classroom(
      enrollment.classroom_id,
      enrollment.academic_year_id
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_students_student_gradebook_sync on public.students;
create trigger trg_students_student_gradebook_sync
  after update of student_code, citizen_id, title, first_name, last_name
  on public.students
  for each row execute function public.trg_students_student_gradebook_sync();

notify pgrst, 'reload schema';
commit;

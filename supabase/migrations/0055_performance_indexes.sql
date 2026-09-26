begin;

-- Existing indexes cover individual columns only, not this active-roster lookup.
create index if not exists student_enrollments_classroom_year_status_idx
  on public.student_enrollments (classroom_id, academic_year_id, status);

-- The existing unique key starts with gradebook_id, not teacher_id.
create index if not exists gradebook_delegations_teacher_idx
  on public.gradebook_delegations (teacher_id);

create index if not exists gradebooks_semester_idx
  on public.gradebooks (semester_id);

commit;

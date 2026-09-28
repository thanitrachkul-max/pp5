-- Keep school/classroom authorization and protected approval fields; allow assessment edits in every approval state.
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

  end if;

  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;


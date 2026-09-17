-- Match existing Thai/ISO date handling without changing saved settings.
begin;
create or replace function public.get_primary_gradebook_year(p_gradebook_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  b record;
  result_terms jsonb;
  legacy record;
  editable jsonb;
begin
  select g.*, ta.subject_id, ta.classroom_id, ta.school_id, sem.academic_year_id, c.class_level_code
    into b from gradebooks g join teaching_assignments ta on ta.id = g.teaching_assignment_id
    join semesters sem on sem.id = g.semester_id join classrooms c on c.id = ta.classroom_id
    where g.id = p_gradebook_id and g.deleted_at is null;
  if b.id is null or b.school_id is distinct from current_school_id()
    or b.class_level_code not like 'ป.%'
    or not exists (select 1 from profiles where id = auth.uid() and is_active)
    or not (coalesce(current_role_is_admin(),false)
      or teacher_can_read_assignment_group(b.assignment_group_id,b.semester_id,auth.uid())
      or exists(select 1 from profiles where id=auth.uid() and role='executive')) then
    raise exception 'ไม่มีสิทธิ์เปิดผลการเรียนรายปี' using errcode = '42501';
  end if;
  select terms into result_terms from primary_gradebook_years
    where academic_year_id=b.academic_year_id and classroom_id=b.classroom_id and subject_id=b.subject_id;
  result_terms := coalesce(result_terms, '{}'::jsonb);
  -- Read legacy semester books without changing or discarding their raw scores.
  for legacy in
    select distinct on (s.semester_number) s.semester_number, g.scores, g.score_config, g.attributes, g.analytical
    from gradebooks g join teaching_assignments ta on ta.id=g.teaching_assignment_id
    join semesters s on s.id=g.semester_id
    where s.academic_year_id=b.academic_year_id and ta.classroom_id=b.classroom_id
      and ta.subject_id=b.subject_id and g.deleted_at is null
    order by s.semester_number, g.updated_at desc, g.id
  loop
    if not (result_terms ? legacy.semester_number::text) then
      result_terms := result_terms || jsonb_build_object(legacy.semester_number::text,
        jsonb_build_object('scores',coalesce(legacy.scores,'{}'::jsonb),'scoreConfig',legacy.score_config,
          'attributes',coalesce(legacy.attributes,'{}'::jsonb),'analytical',coalesce(legacy.analytical,'{}'::jsonb)));
    end if;
  end loop;
  select coalesce(jsonb_agg(s.semester_number order by s.semester_number),'[]'::jsonb) into editable
  from semesters s join academic_years y on y.id=s.academic_year_id
  where y.id=b.academic_year_id and y.is_active and y.primary_grade_entry_enabled and s.grade_entry_enabled
    and (y.primary_entry_start_date is null or (now() at time zone 'Asia/Bangkok')::date >= (case when extract(year from y.primary_entry_start_date) >= 2400 then (y.primary_entry_start_date - interval '543 years')::date else y.primary_entry_start_date end))
    and (y.primary_entry_end_date is null or (now() at time zone 'Asia/Bangkok')::date <= (case when extract(year from y.primary_entry_end_date) >= 2400 then (y.primary_entry_end_date - interval '543 years')::date else y.primary_entry_end_date end))
    and (s.entry_start_date is null or (now() at time zone 'Asia/Bangkok')::date >= (case when extract(year from s.entry_start_date) >= 2400 then (s.entry_start_date - interval '543 years')::date else s.entry_start_date end))
    and (s.entry_end_date is null or (now() at time zone 'Asia/Bangkok')::date <= (case when extract(year from s.entry_end_date) >= 2400 then (s.entry_end_date - interval '543 years')::date else s.entry_end_date end));
  return jsonb_build_object('terms',result_terms,'editableTerms',editable);
end;
$$;

notify pgrst,'reload schema';
commit;

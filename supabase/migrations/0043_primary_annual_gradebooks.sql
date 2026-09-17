begin;

create table if not exists public.primary_gradebook_years (
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  terms jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (academic_year_id, classroom_id, subject_id)
);
alter table public.primary_gradebook_years enable row level security;
revoke all on public.primary_gradebook_years from anon, authenticated;

insert into public.primary_gradebook_years(academic_year_id,classroom_id,subject_id,terms)
select academic_year_id,classroom_id,subject_id,jsonb_object_agg(semester_number::text,payload)
from (
  select distinct on(s.academic_year_id,ta.classroom_id,ta.subject_id,s.semester_number)
    s.academic_year_id,ta.classroom_id,ta.subject_id,s.semester_number,
    jsonb_build_object('scores',coalesce(g.scores,'{}'::jsonb),'scoreConfig',g.score_config,
      'attributes',coalesce(g.attributes,'{}'::jsonb),'analytical',coalesce(g.analytical,'{}'::jsonb)) as payload
  from gradebooks g join teaching_assignments ta on ta.id=g.teaching_assignment_id
  join semesters s on s.id=g.semester_id join classrooms c on c.id=ta.classroom_id
  where g.deleted_at is null and c.class_level_code like 'ป.%'
  order by s.academic_year_id,ta.classroom_id,ta.subject_id,s.semester_number,g.updated_at desc,g.id
) existing group by academic_year_id,classroom_id,subject_id on conflict do nothing;

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
    and (y.primary_entry_start_date is null or (now() at time zone 'Asia/Bangkok')::date >= y.primary_entry_start_date)
    and (y.primary_entry_end_date is null or (now() at time zone 'Asia/Bangkok')::date <= y.primary_entry_end_date)
    and (s.entry_start_date is null or (now() at time zone 'Asia/Bangkok')::date >= s.entry_start_date)
    and (s.entry_end_date is null or (now() at time zone 'Asia/Bangkok')::date <= s.entry_end_date);
  return jsonb_build_object('terms',result_terms,'editableTerms',editable);
end;
$$;

create or replace function public.save_primary_gradebook_year(p_gradebook_id uuid, p_data jsonb, p_original_terms jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  b record;
  context jsonb;
  current_terms jsonb;
  next_terms jsonb;
  incoming jsonb;
  original jsonb;
  t text;
  empty_term jsonb := '{"scores":{},"attributes":{},"analytical":{}}'::jsonb;
  own_term jsonb;
begin
  if not coalesce(current_role_is_admin(),false) and not exists (
    select 1 from gradebooks g where g.id=p_gradebook_id
      and teacher_can_read_assignment_group(g.assignment_group_id,g.semester_id,auth.uid())
  ) then raise exception 'ไม่มีสิทธิ์บันทึกผลการเรียนรายปี' using errcode='42501'; end if;
  -- Authorize before creating or locking the annual record.
  context := get_primary_gradebook_year(p_gradebook_id);
  if jsonb_array_length(context->'editableTerms') = 0 then
    raise exception 'ปิดการกรอกคะแนนทุกภาคเรียนแล้ว กรุณาโหลดข้อมูลใหม่' using errcode='42501';
  end if;
  select g.*, ta.subject_id,ta.classroom_id,s.academic_year_id,s.semester_number into b
    from gradebooks g join teaching_assignments ta on ta.id=g.teaching_assignment_id
    join semesters s on s.id=g.semester_id where g.id=p_gradebook_id;
  insert into primary_gradebook_years(academic_year_id,classroom_id,subject_id,terms)
    values(b.academic_year_id,b.classroom_id,b.subject_id,context->'terms') on conflict do nothing;
  select terms into current_terms from primary_gradebook_years
    where academic_year_id=b.academic_year_id and classroom_id=b.classroom_id and subject_id=b.subject_id for update;
  next_terms := current_terms;
  foreach t in array array['1','2'] loop
    incoming := coalesce(p_data->'primaryYear'->'terms'->t,empty_term);
    original := coalesce(p_original_terms->t,empty_term);
    if incoming is distinct from original then
      if not ((context->'editableTerms') @> to_jsonb(array[t::integer])) then
        raise exception 'ภาคเรียนที่ % ปิดการแก้ไขแล้ว กรุณาโหลดข้อมูลใหม่',t using errcode='42501';
      end if;
      if coalesce(current_terms->t,empty_term) is distinct from original then
        raise exception 'มีผู้บันทึกคะแนนภาคเรียนที่ % ก่อนหน้านี้ กรุณาโหลดข้อมูลใหม่',t using errcode='40001';
      end if;
      if jsonb_typeof(incoming) <> 'object' or jsonb_typeof(incoming->'scores') <> 'object'
        or jsonb_typeof(incoming->'attributes') <> 'object' or jsonb_typeof(incoming->'analytical') <> 'object' then
        raise exception 'รูปแบบข้อมูลคะแนนไม่ถูกต้อง';
      end if;
      next_terms := jsonb_set(next_terms,array[t],incoming,true);
    end if;
  end loop;
  update primary_gradebook_years set terms=next_terms,updated_at=now()
    where academic_year_id=b.academic_year_id and classroom_id=b.classroom_id and subject_id=b.subject_id;
  own_term := coalesce(next_terms->b.semester_number::text,empty_term);
  update gradebooks set general_info=coalesce(p_data->'generalInfo',general_info),
    students=coalesce(p_data->'students',students),attendance=coalesce(p_data->'attendance',attendance),
    indicators=coalesce(p_data->'indicators',indicators),
    scores=own_term->'scores',score_config=own_term->'scoreConfig',attributes=own_term->'attributes',analytical=own_term->'analytical',
    stats=coalesce(p_data->'stats',stats),status=case when status='completed' then status else 'in_progress' end,updated_at=now()
    where id=p_gradebook_id;
end;
$$;
revoke all on function public.get_primary_gradebook_year(uuid) from public;
revoke all on function public.save_primary_gradebook_year(uuid,jsonb,jsonb) from public;
grant execute on function public.get_primary_gradebook_year(uuid) to authenticated;
grant execute on function public.save_primary_gradebook_year(uuid,jsonb,jsonb) to authenticated;

-- Older clients must not silently overwrite a semester after annual recording is enabled.
create or replace function public.guard_primary_gradebook_scores()
returns trigger language plpgsql security definer set search_path=public as $$
declare expected jsonb; primary_level boolean;
begin
  if (new.scores,new.score_config,new.attributes,new.analytical) is not distinct from
     (old.scores,old.score_config,old.attributes,old.analytical) then return new; end if;
  select c.class_level_code like 'ป.%', y.terms->s.semester_number::text into primary_level,expected
  from teaching_assignments ta join classrooms c on c.id=ta.classroom_id
  join semesters s on s.id=new.semester_id left join primary_gradebook_years y
    on y.academic_year_id=s.academic_year_id and y.classroom_id=ta.classroom_id and y.subject_id=ta.subject_id
  where ta.id=new.teaching_assignment_id;
  if primary_level and (expected is null or
      coalesce(new.scores,'{}'::jsonb) is distinct from coalesce(expected->'scores','{}'::jsonb) or
      coalesce(new.score_config,'null'::jsonb) is distinct from coalesce(expected->'scoreConfig','null'::jsonb) or
      coalesce(new.attributes,'{}'::jsonb) is distinct from coalesce(expected->'attributes','{}'::jsonb) or
      coalesce(new.analytical,'{}'::jsonb) is distinct from coalesce(expected->'analytical','{}'::jsonb)) then
    raise exception 'กรุณาโหลดหน้าใหม่และบันทึกผ่านระบบคะแนนรายปี' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_primary_gradebook_scores on public.gradebooks;
create trigger guard_primary_gradebook_scores before update on public.gradebooks
for each row execute function public.guard_primary_gradebook_scores();
revoke all on function public.guard_primary_gradebook_scores() from public;

-- Required basic career courses for Mathayom 6; retain existing IDs and assignments.
insert into public.subjects(school_id,subject_code,subject_name,learning_area,subject_type,default_class_level,semester_number,credits,hours_total,hours_per_week,is_active)
select schools.id,code,'การงานอาชีพ','การงานอาชีพ','พื้นฐาน','ม.6',term,0.5,20,1,true
from public.schools cross join (values ('ง33101',1),('ง33102',2)) as course(code,term)
on conflict (school_id,subject_code) do update set subject_name=excluded.subject_name,
  credits=excluded.credits,hours_total=excluded.hours_total,hours_per_week=excluded.hours_per_week;
notify pgrst,'reload schema';
commit;

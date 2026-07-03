-- Finalize the admin/developer role split and make the school director signer
-- resolve from the real profile even when old official settings are blank.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'teacher', 'executive'));

create or replace function public.current_role_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('super_admin', 'admin')
      and is_active = true
  );
$$;

create or replace function public.is_admin_or_exec() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('super_admin', 'admin', 'executive')
      and is_active = true
  );
$$;

update public.profiles
set
  full_name = 'ผู้ดูแลระบบ',
  role = 'admin',
  is_active = true
where lower(username) = 'admin';

alter table public.school_pap5_officials
  add column if not exists school_director_id uuid references public.profiles(id) on delete set null;

with director_candidates as (
  select distinct on (p.school_id)
    p.school_id,
    p.id as director_id
  from public.profiles p
  where p.is_active = true
    and regexp_replace(concat_ws('', p.title, p.full_name, p.username), '[[:space:]]+', '', 'g') ilike '%มีเกียรติ%'
    and regexp_replace(concat_ws('', p.title, p.full_name, p.username), '[[:space:]]+', '', 'g') ilike '%นาสมตรึก%'
  order by
    p.school_id,
    case when p.role = 'executive' then 0 else 1 end,
    p.created_at
)
insert into public.school_pap5_officials (
  school_id,
  school_director_id,
  updated_at
)
select
  school_id,
  director_id,
  now()
from director_candidates
on conflict (school_id) do update
set
  school_director_id = coalesce(
    public.school_pap5_officials.school_director_id,
    excluded.school_director_id
  ),
  updated_at = case
    when public.school_pap5_officials.school_director_id is null
      then now()
    else public.school_pap5_officials.updated_at
  end;

drop function if exists public.get_pap5_official_names(uuid, text);

create or replace function public.get_pap5_official_names(
  p_school_id uuid,
  p_learning_area text
)
returns table (
  head_of_learning_area text,
  head_of_evaluation text,
  deputy_director text,
  school_director text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    nullif(concat_ws(' ', nullif(lah_profile.title, ''), nullif(lah_profile.full_name, '')), '') as head_of_learning_area,
    nullif(concat_ws(' ', nullif(evaluation_profile.title, ''), nullif(evaluation_profile.full_name, '')), '') as head_of_evaluation,
    nullif(concat_ws(' ', nullif(deputy_profile.title, ''), nullif(deputy_profile.full_name, '')), '') as deputy_director,
    coalesce(
      nullif(concat_ws(' ', nullif(director_profile.title, ''), nullif(director_profile.full_name, '')), ''),
      nullif(concat_ws(' ', nullif(default_director.title, ''), nullif(default_director.full_name, '')), '')
    ) as school_director
  from (select p_school_id as school_id) requested
  left join public.school_learning_area_heads lah
    on lah.school_id = requested.school_id
    and regexp_replace(coalesce(lah.learning_area, ''), '[[:space:]]+', '', 'g')
      = regexp_replace(coalesce(p_learning_area, ''), '[[:space:]]+', '', 'g')
  left join public.profiles lah_profile
    on lah_profile.id = lah.teacher_id
  left join public.school_pap5_officials officials
    on officials.school_id = requested.school_id
  left join public.profiles evaluation_profile
    on evaluation_profile.id = officials.head_of_evaluation_id
  left join public.profiles deputy_profile
    on deputy_profile.id = officials.deputy_director_id
  left join public.profiles director_profile
    on director_profile.id = officials.school_director_id
  left join lateral (
    select p.title, p.full_name
    from public.profiles p
    where p.school_id = requested.school_id
      and p.is_active = true
      and regexp_replace(concat_ws('', p.title, p.full_name, p.username), '[[:space:]]+', '', 'g') ilike '%มีเกียรติ%'
      and regexp_replace(concat_ws('', p.title, p.full_name, p.username), '[[:space:]]+', '', 'g') ilike '%นาสมตรึก%'
    order by
      case when p.role = 'executive' then 0 else 1 end,
      p.created_at
    limit 1
  ) default_director on true
  where requested.school_id = public.current_school_id()
  limit 1;
$$;

grant execute on function public.get_pap5_official_names(uuid, text) to authenticated;

create or replace function public.sync_pap5_official_names_to_gradebooks(
  p_school_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer := 0;
begin
  if not public.current_role_is_admin() or p_school_id <> public.current_school_id() then
    raise exception 'not authorized';
  end if;

  with assignment_officials as (
    select
      g.id as gradebook_id,
      nullif(concat_ws(' ', nullif(lah_profile.title, ''), nullif(lah_profile.full_name, '')), '') as head_of_learning_area,
      nullif(concat_ws(' ', nullif(evaluation_profile.title, ''), nullif(evaluation_profile.full_name, '')), '') as head_of_evaluation,
      nullif(concat_ws(' ', nullif(deputy_profile.title, ''), nullif(deputy_profile.full_name, '')), '') as deputy_director,
      coalesce(
        nullif(concat_ws(' ', nullif(director_profile.title, ''), nullif(director_profile.full_name, '')), ''),
        nullif(concat_ws(' ', nullif(default_director.title, ''), nullif(default_director.full_name, '')), '')
      ) as school_director
    from public.gradebooks g
    join public.teaching_assignments ta
      on ta.id = g.teaching_assignment_id
    left join public.subjects subject
      on subject.id = ta.subject_id
    left join public.school_learning_area_heads lah
      on lah.school_id = ta.school_id
      and regexp_replace(coalesce(lah.learning_area, ''), '[[:space:]]+', '', 'g')
        = regexp_replace(coalesce(subject.learning_area, ''), '[[:space:]]+', '', 'g')
    left join public.profiles lah_profile
      on lah_profile.id = lah.teacher_id
    left join public.school_pap5_officials officials
      on officials.school_id = ta.school_id
    left join public.profiles evaluation_profile
      on evaluation_profile.id = officials.head_of_evaluation_id
    left join public.profiles deputy_profile
      on deputy_profile.id = officials.deputy_director_id
    left join public.profiles director_profile
      on director_profile.id = officials.school_director_id
    left join lateral (
      select p.title, p.full_name
      from public.profiles p
      where p.school_id = ta.school_id
        and p.is_active = true
        and regexp_replace(concat_ws('', p.title, p.full_name, p.username), '[[:space:]]+', '', 'g') ilike '%มีเกียรติ%'
        and regexp_replace(concat_ws('', p.title, p.full_name, p.username), '[[:space:]]+', '', 'g') ilike '%นาสมตรึก%'
      order by
        case when p.role = 'executive' then 0 else 1 end,
        p.created_at
      limit 1
    ) default_director on true
    where ta.school_id = p_school_id
      and g.deleted_at is null
  ),
  updated as (
    update public.gradebooks g
    set
      general_info = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              coalesce(g.general_info, '{}'::jsonb),
              '{headOfLearningArea}',
              to_jsonb(coalesce(assignment_officials.head_of_learning_area, '')),
              true
            ),
            '{headOfEvaluation}',
            to_jsonb(coalesce(assignment_officials.head_of_evaluation, '')),
            true
          ),
          '{deputyDirector}',
          to_jsonb(coalesce(assignment_officials.deputy_director, '')),
          true
        ),
        '{schoolDirector}',
        to_jsonb(coalesce(assignment_officials.school_director, '')),
        true
      ),
      updated_at = now()
    from assignment_officials
    where g.id = assignment_officials.gradebook_id
      and (
        g.general_info->>'headOfLearningArea' is distinct from coalesce(assignment_officials.head_of_learning_area, '')
        or g.general_info->>'headOfEvaluation' is distinct from coalesce(assignment_officials.head_of_evaluation, '')
        or g.general_info->>'deputyDirector' is distinct from coalesce(assignment_officials.deputy_director, '')
        or g.general_info->>'schoolDirector' is distinct from coalesce(assignment_officials.school_director, '')
      )
    returning g.id
  )
  select count(*) into v_updated_count from updated;

  return v_updated_count;
end;
$$;

grant execute on function public.sync_pap5_official_names_to_gradebooks(uuid) to authenticated;

with assignment_officials as (
  select
    g.id as gradebook_id,
    coalesce(
      nullif(concat_ws(' ', nullif(director_profile.title, ''), nullif(director_profile.full_name, '')), ''),
      nullif(concat_ws(' ', nullif(default_director.title, ''), nullif(default_director.full_name, '')), '')
    ) as school_director
  from public.gradebooks g
  join public.teaching_assignments ta
    on ta.id = g.teaching_assignment_id
  left join public.school_pap5_officials officials
    on officials.school_id = ta.school_id
  left join public.profiles director_profile
    on director_profile.id = officials.school_director_id
  left join lateral (
    select p.title, p.full_name
    from public.profiles p
    where p.school_id = ta.school_id
      and p.is_active = true
      and regexp_replace(concat_ws('', p.title, p.full_name, p.username), '[[:space:]]+', '', 'g') ilike '%มีเกียรติ%'
      and regexp_replace(concat_ws('', p.title, p.full_name, p.username), '[[:space:]]+', '', 'g') ilike '%นาสมตรึก%'
    order by
      case when p.role = 'executive' then 0 else 1 end,
      p.created_at
    limit 1
  ) default_director on true
  where g.deleted_at is null
)
update public.gradebooks g
set
  general_info = jsonb_set(
    coalesce(g.general_info, '{}'::jsonb),
    '{schoolDirector}',
    to_jsonb(coalesce(assignment_officials.school_director, '')),
    true
  ),
  updated_at = now()
from assignment_officials
where g.id = assignment_officials.gradebook_id
  and coalesce(assignment_officials.school_director, '') <> ''
  and g.general_info->>'schoolDirector' is distinct from assignment_officials.school_director;

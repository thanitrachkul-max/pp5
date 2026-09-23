begin;

create table if not exists public.curriculum_indicator_edits (
  school_id uuid primary key references public.schools(id) on delete cascade,
  data jsonb not null default '{"hiddenIds":[],"customRecords":[],"overrides":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.curriculum_indicator_edits enable row level security;
grant select, insert, update on public.curriculum_indicator_edits to authenticated;

drop policy if exists "School staff can read curriculum edits" on public.curriculum_indicator_edits;
drop policy if exists "Admins can write curriculum edits" on public.curriculum_indicator_edits;

create policy "School staff can read curriculum edits"
on public.curriculum_indicator_edits for select to authenticated
using (school_id = public.current_school_id());

create policy "Admins can write curriculum edits"
on public.curriculum_indicator_edits for all to authenticated
using (public.current_role_is_admin() and school_id = public.current_school_id())
with check (public.current_role_is_admin() and school_id = public.current_school_id());

commit;

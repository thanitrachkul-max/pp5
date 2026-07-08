-- Reset the developer / Super Admin login to the agreed fixed credential.
-- This migration is intentionally idempotent so it can repair existing
-- deployments where the old superadmin / superadmin seed already ran.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'teacher', 'executive'));

do $$
declare
  v_school_id uuid;
  v_super_id uuid;
  v_username text := 'Super-admin';
  v_normalized_username text := lower(v_username);
  v_email text := lower(v_username) || '@ksp.gradebook';
  v_password text := '@superadmin0000';
  v_instance_id uuid;
  v_identity_id_type text;
begin
  select id, school_id
    into v_super_id, v_school_id
  from public.profiles
  where role = 'super_admin'
     or lower(username) in ('superadmin', 'super-admin')
  order by
    case
      when lower(username) = v_normalized_username then 0
      when role = 'super_admin' then 1
      else 2
    end,
    created_at
  limit 1;

  if v_super_id is null then
    select id
      into v_super_id
    from auth.users
    where lower(email) in ('superadmin@ksp.gradebook', v_email)
    order by
      case when lower(email) = v_email then 0 else 1 end,
      created_at
    limit 1;
  end if;

  if v_school_id is null and v_super_id is not null then
    select school_id
      into v_school_id
    from public.profiles
    where id = v_super_id
    limit 1;
  end if;

  if v_school_id is null then
    select school_id
      into v_school_id
    from public.profiles
    where lower(username) = 'admin'
    limit 1;
  end if;

  if v_school_id is null then
    select id
      into v_school_id
    from public.schools
    order by created_at
    limit 1;
  end if;

  if v_school_id is null then
    raise notice 'Skip Super Admin credential reset: no school found.';
    return;
  end if;

  if v_super_id is null then
    v_super_id := gen_random_uuid();
  end if;

  select id
    into v_instance_id
  from auth.instances
  limit 1;

  if v_instance_id is null then
    v_instance_id := '00000000-0000-0000-0000-000000000000'::uuid;
  end if;

  insert into auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    created_at,
    updated_at
  ) values (
    v_super_id,
    v_instance_id,
    v_email,
    extensions.crypt(v_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', 'ผู้พัฒนาระบบ'),
    'authenticated',
    'authenticated',
    now(),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = coalesce(auth.users.email_confirmed_at, excluded.email_confirmed_at),
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    aud = excluded.aud,
    role = excluded.role,
    updated_at = now();

  select udt_name
    into v_identity_id_type
  from information_schema.columns
  where table_schema = 'auth'
    and table_name = 'identities'
    and column_name = 'id';

  if exists (
    select 1
    from auth.identities
    where user_id = v_super_id
      and provider = 'email'
  ) then
    update auth.identities
    set
      identity_data = coalesce(identity_data, '{}'::jsonb)
        || jsonb_build_object('sub', v_super_id::text, 'email', v_email),
      updated_at = now()
    where user_id = v_super_id
      and provider = 'email';
  elsif v_identity_id_type = 'uuid' then
    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      v_super_id,
      v_super_id,
      jsonb_build_object('sub', v_super_id::text, 'email', v_email),
      'email',
      v_super_id::text,
      now(),
      now(),
      now()
    );
  else
    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      v_super_id::text,
      v_super_id,
      jsonb_build_object('sub', v_super_id::text, 'email', v_email),
      'email',
      v_super_id::text,
      now(),
      now(),
      now()
    );
  end if;

  insert into public.profiles (
    id,
    school_id,
    username,
    full_name,
    title,
    role,
    is_active
  ) values (
    v_super_id,
    v_school_id,
    v_username,
    'ผู้พัฒนาระบบ',
    null,
    'super_admin',
    true
  )
  on conflict (id) do update
  set
    school_id = excluded.school_id,
    username = excluded.username,
    full_name = excluded.full_name,
    title = excluded.title,
    role = excluded.role,
    is_active = true;
end $$;

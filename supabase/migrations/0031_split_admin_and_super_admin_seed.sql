-- Split the operational admin account from the developer account.
-- Safe to run more than once. If the developer account is created here,
-- the initial login is superadmin / superadmin and should be changed later.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'teacher', 'executive'));

update public.profiles
set
  full_name = 'ผู้ดูแลระบบ',
  role = 'admin',
  is_active = true
where lower(username) = 'admin';

do $$
declare
  v_school_id uuid;
  v_super_id uuid;
  v_username text := 'superadmin';
  v_email text;
  v_identity_id_type text;
begin
  select school_id
    into v_school_id
  from public.profiles
  where lower(username) = 'admin'
  limit 1;

  if v_school_id is null then
    select id
      into v_school_id
    from public.schools
    order by created_at
    limit 1;
  end if;

  if v_school_id is null then
    raise notice 'Skip developer account seed: no school found.';
    return;
  end if;

  if exists (select 1 from public.profiles where role = 'super_admin') then
    return;
  end if;

  while exists (select 1 from public.profiles where lower(username) = v_username)
    or exists (select 1 from auth.users where lower(email) = v_username || '@ksp.gradebook')
  loop
    v_username := v_username || '1';
  end loop;

  v_email := v_username || '@ksp.gradebook';

  select id
    into v_super_id
  from auth.users
  where lower(email) = v_email
  limit 1;

  if v_super_id is null then
    v_super_id := gen_random_uuid();

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
      '00000000-0000-0000-0000-000000000000'::uuid,
      v_email,
      extensions.crypt(v_username, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'ผู้พัฒนาระบบ'),
      'authenticated',
      'authenticated',
      now(),
      now()
    );
  end if;

  select udt_name
    into v_identity_id_type
  from information_schema.columns
  where table_schema = 'auth'
    and table_name = 'identities'
    and column_name = 'id';

  if not exists (
    select 1
    from auth.identities
    where user_id = v_super_id
      and provider = 'email'
  ) then
    if v_identity_id_type = 'uuid' then
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

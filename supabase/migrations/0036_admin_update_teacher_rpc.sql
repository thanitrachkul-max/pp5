-- Fallback RPC for editing user profiles and resetting passwords when the
-- update-teacher Edge Function has not been deployed yet.

create or replace function public.admin_update_teacher_account(
  p_id uuid,
  p_username text,
  p_password text,
  p_full_name text,
  p_title text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_caller record;
  v_target record;
  v_normalized_username text;
  v_email text;
  v_password text;
  v_requested_role text;
begin
  select role, school_id
    into v_caller
  from public.profiles
  where id = auth.uid();

  if v_caller.role not in ('super_admin', 'admin') then
    raise exception 'Forbidden';
  end if;

  select id, school_id, role
    into v_target
  from public.profiles
  where id = p_id;

  if v_target.id is null then
    raise exception 'ไม่พบบัญชีผู้ใช้งาน';
  end if;

  if v_target.school_id is distinct from v_caller.school_id then
    raise exception 'Forbidden';
  end if;

  v_requested_role := coalesce(nullif(trim(p_role), ''), 'teacher');
  if v_requested_role not in ('super_admin', 'admin', 'teacher', 'executive') then
    raise exception 'Invalid role';
  end if;

  if (v_target.role = 'super_admin' or v_requested_role = 'super_admin')
    and v_caller.role <> 'super_admin'
  then
    raise exception 'Only Super Admin can edit Super Admin accounts';
  end if;

  v_normalized_username := lower(trim(p_username));
  if v_normalized_username = '' or trim(p_full_name) = '' then
    raise exception 'กรอกข้อมูลไม่ครบ';
  end if;

  v_password := nullif(trim(coalesce(p_password, '')), '');
  if v_password is not null and length(v_password) < 6 then
    raise exception 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร';
  end if;

  if exists (
    select 1
    from public.profiles
    where lower(username) = v_normalized_username
      and id <> p_id
  ) then
    raise exception 'Username นี้ถูกใช้แล้ว';
  end if;

  v_email := v_normalized_username || '@ksp.gradebook';

  update auth.users
  set
    email = v_email,
    encrypted_password = case
      when v_password is null then encrypted_password
      else crypt(v_password, gen_salt('bf'))
    end,
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    raw_app_meta_data = coalesce(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('full_name', trim(p_full_name)),
    aud = 'authenticated',
    role = 'authenticated',
    updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'ไม่พบบัญชีผู้ใช้งานใน Auth';
  end if;

  update auth.identities
  set
    identity_data = coalesce(identity_data, '{}'::jsonb)
      || jsonb_build_object('sub', p_id::text, 'email', v_email),
    updated_at = now()
  where user_id = p_id
    and provider = 'email';

  update public.profiles
  set
    username = v_normalized_username,
    full_name = trim(p_full_name),
    title = nullif(trim(coalesce(p_title, '')), ''),
    role = v_requested_role
  where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id, 'username', v_normalized_username);
exception
  when unique_violation then
    raise exception 'Username นี้ถูกใช้แล้ว';
end;
$$;

grant execute on function public.admin_update_teacher_account(uuid, text, text, text, text, text) to authenticated;

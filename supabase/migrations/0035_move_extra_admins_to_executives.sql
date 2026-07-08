-- Keep only the operational "admin" account in the Admin role.
-- Other former Admin accounts are leadership users and should appear under
-- the Executive group in the role management screen.

update public.profiles
set role = 'executive'
where role = 'admin'
  and lower(coalesce(username, '')) <> 'admin';

update public.profiles
set
  full_name = 'ผู้ดูแลระบบ',
  role = 'admin',
  is_active = true
where lower(coalesce(username, '')) = 'admin';

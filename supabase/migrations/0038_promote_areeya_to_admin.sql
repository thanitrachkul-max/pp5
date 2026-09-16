-- Place Areeya Saengdee in the "Developer and system administrator" group.
-- Keep an existing super-admin role intact if the account has already been
-- promoted further. Name matching supports both split title/name fields and
-- legacy rows where the title was stored inside full_name.

update public.profiles
set role = case
  when role = 'super_admin' then role
  else 'admin'
end
where regexp_replace(coalesce(full_name, ''), '[[:space:]]+', '', 'g') in (
    'อารียาแสงดี',
    'ว่าที่ร้อยตรีหญิงอารียาแสงดี',
    'ว่าทีร้อยตรีหญิงอารียาแสงดี'
  )
  or regexp_replace(concat_ws('', title, full_name), '[[:space:]]+', '', 'g') in (
    'ว่าที่ร้อยตรีหญิงอารียาแสงดี',
    'ว่าทีร้อยตรีหญิงอารียาแสงดี'
  );

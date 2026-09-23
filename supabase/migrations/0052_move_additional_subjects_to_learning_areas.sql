begin;

-- Keep subject IDs so existing assignments and gradebooks retain their links.
update public.subjects
set learning_area = case
  when subject_name = 'สวนพฤกษศาสตร์ในโรงเรียน' then 'วิทยาศาสตร์และเทคโนโลยี'
  when subject_name = 'พื้นฐานอาชีพ' then 'การงานอาชีพ'
end
where subject_name in ('สวนพฤกษศาสตร์ในโรงเรียน', 'พื้นฐานอาชีพ')
  and learning_area is distinct from case
    when subject_name = 'สวนพฤกษศาสตร์ในโรงเรียน' then 'วิทยาศาสตร์และเทคโนโลยี'
    when subject_name = 'พื้นฐานอาชีพ' then 'การงานอาชีพ'
  end;

commit;

-- Rename in place so existing assignments and gradebooks retain their subject IDs.
update public.subjects
set subject_name = 'ทักษะสังคมและการดำรงชีวิต'
where subject_code in ('ส33201', 'ส33202')
  and default_class_level = 'ม.6'
  and learning_area = 'สังคมศึกษา ศาสนา และวัฒนธรรม';

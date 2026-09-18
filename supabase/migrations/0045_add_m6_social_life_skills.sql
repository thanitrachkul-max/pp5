-- Preserve IDs and gradebook links when either course already exists.
insert into public.subjects (
  school_id, subject_code, subject_name, learning_area, subject_type,
  default_class_level, semester_number, credits, hours_total, hours_per_week, is_active
)
select schools.id, course.code, 'ทักษะสังคมและการดำรงชีวิต',
  'สังคมศึกษา ศาสนา และวัฒนธรรม', 'เพิ่มเติม', 'ม.6', course.term, 0.5, 20, 1, true
from public.schools
cross join (values ('33201', 1), ('33202', 2)) as course(code, term)
on conflict (school_id, subject_code) do update set
  subject_name = excluded.subject_name,
  learning_area = excluded.learning_area,
  subject_type = excluded.subject_type,
  default_class_level = excluded.default_class_level,
  semester_number = excluded.semester_number,
  credits = excluded.credits,
  hours_total = excluded.hours_total,
  hours_per_week = excluded.hours_per_week,
  is_active = excluded.is_active;

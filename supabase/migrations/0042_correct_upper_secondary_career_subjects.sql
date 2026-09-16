-- Update existing subjects in place to preserve assignments and gradebook links.
update public.subjects
set subject_name = 'พื้นฐานอาชีพ',
    hours_total = 240,
    hours_per_week = 12
where subject_code in ('ง32201', 'ง32202', 'ง33201', 'ง33202')
  and learning_area = 'การงานอาชีพ'
  and default_class_level in ('ม.5', 'ม.6');

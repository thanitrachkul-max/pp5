-- Seed Thai language standards and indicators for ม.2 - ม.6.

-- Generated from หลักสูตรภาษาไทย ส่วนที่ 4.docx.



insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.2', 'ท 1.1', 'ใช้กระบวนการอ่านสร้างความรู้และความคิดเพื่อนำไปใช้ตัดสินใจ แก้ปัญหาในการดำเนินชีวิต และมีนิสัยรักการอ่าน')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.2', 'ท 2.1', 'ใช้กระบวนการเขียนสื่อสาร เขียนเรียงความ ย่อความ และเขียนเรื่องราวในรูปแบบต่าง ๆ เขียนรายงานข้อมูลสารสนเทศและรายงานการศึกษาค้นคว้าอย่างมีประสิทธิภาพ')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.2', 'ท 3.1', 'สามารถเลือกฟังและดูอย่างมีวิจารณญาณ และพูดแสดงความรู้ ความคิด และความรู้สึก ในโอกาสต่าง ๆ อย่างมีวิจารณญาณและสร้างสรรค์')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.2', 'ท 4.1', 'เข้าใจธรรมชาติของภาษาและหลักภาษาไทย การเปลี่ยนแปลงของภาษาและพลังของภาษา ภูมิปัญญาทางภาษา และรักษาภาษาไทยไว้เป็นสมบัติของชาติ')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.2', 'ท 5.1', 'เข้าใจและแสดงความคิดเห็น วิจารณ์วรรณคดีและวรรณกรรมไทยอย่างเห็นคุณค่า และนำมาประยุกต์ใช้ในชีวิตจริง')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.2/1', 'อ่านออกเสียงบทร้อยแก้วและบทร้อยกรองได้ถูกต้องเหมาะสมกับเรื่องที่อ่าน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.2/2', 'จับใจความสําคัญ สรุปความและอธิบายรายละเอียดจากเรื่องที่อ่าน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.2/3', 'เขียนผังความคิดเพื่อแสดงความเข้าใจในบทเรียนต่าง ๆ ที่อ่าน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.2/4', 'อภิปรายแสดงความคิดเห็น และข้อโต้แย้งเกี่ยวกับเรื่องที่อ่าน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.2/5', 'วิเคราะห์และจําแนกข้อเท็จจริง ข้อมูลสนับสนุน และข้อคิดเห็นจากบทความ ที่อ่าน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.2/6', 'ระบุข้อสังเกตการชวนเชื่อ การโน้มน้าว หรือความสมเหตุสมผลของงานเขียน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.2/7', 'อ่านหนังสือ บทความหรือคําประพันธ์ อย่างหลากหลาย และประเมินคุณค่า หรือแนวคิดที่ได้ จากการอ่านเพื่อนําไปใช้แก้ปัญหาในชีวิต'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.2/8', 'มีมารยาทในการอ่าน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.2/1', 'คัดลายมือตัวบรรจงครึ่งบรรทัด'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.2/2', 'เขียนบรรยาย และพรรณนา'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.2/3', 'เขียนเรียงความ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.2/4', 'เขียนย่อความ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.2/5', 'เขียนรายงานการศึกษาค้นคว้า'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.2/6', 'เขียนจดหมายกิจธุระ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.2/7', 'เขียนวิเคราะห์ วิจารณ์และแสดงความรู้ ความคิดเห็น หรือโต้แย้งในเรื่องที่อ่านอย่างมีเหตุผล'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.2/8', 'มีมารยาทในการเขียน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 3.1 ม.2/1', 'พูดสรุปใจความสําคัญ ของเรื่องที่ฟังและดู'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 3.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 3.1 ม.2/2', 'วิเคราะห์ข้อเท็จจริง ข้อคิดเห็นและความน่าเชื่อถือของข่าวสารจากสื่อต่าง ๆ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 3.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 3.1 ม.2/3', 'วิเคราะห์และวิจารณ์เรื่องที่ฟัง และดูอย่างมีเหตุผล เพื่อนําข้อคิดมาประยุกต์ใช้ใน การดําเนินชีวิต'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 3.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 3.1 ม.2/4', 'พูดในโอกาสต่าง ๆ ได้ตรงตามวัตถุประสงค์'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 3.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 3.1 ม.2/5', 'พูดรายงานเรื่องหรือประเด็นที่ศึกษาค้นคว้า'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 3.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 3.1 ม.2/6', 'มีมารยาทในการฟัง การดู และการพูด'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 3.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.2/1', 'สร้างคําในภาษาไทย'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.2/2', 'วิเคราะห์โครงสร้างประโยคสามัญ ประโยครวมและประโยคซ้อน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.2/3', 'แต่งบทร้อยกรอง'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.2/4', 'ใช้คําราชาศัพท์'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.2/5', 'รวบรวม และอธิบายความหมายของคําภาษาต่างประเทศที่ใช้ในภาษาไทย'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 5.1 ม.2/1', 'สรุปเนื้อหาวรรณคดีและวรรณกรรมที่อ่าน ในระดับที่ยากขึ้น'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 5.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 5.1 ม.2/2', 'วิเคราะห์และวิจารณ์วรรณคดี วรรณกรรม และวรรณกรรมท้องถิ่นที่อ่านพร้อมยกเหตุผลประกอบ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 5.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 5.1 ม.2/3', 'อธิบายคุณค่าของวรรณคดีและวรรณกรรมที่อ่าน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 5.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 5.1 ม.2/4', 'สรุปความรู้และข้อคิด จากการอ่านไปประยุกต์ ใช้ในชีวิตประจําวัน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 5.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 5.1 ม.2/5', 'ท่องจําบทอาขยานตามที่กําหนดและบทร้อยกรองที่มีคุณค่าตามความสนใจ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.2'
  and cs.standard_code = 'ท 5.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.3', 'ท 1.1', 'ใช้กระบวนการอ่านสร้างความรู้และความคิดเพื่อนำไปใช้ตัดสินใจ แก้ปัญหาในการดำเนินชีวิต และมีนิสัยรักการอ่าน')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.3', 'ท 2.1', 'ใช้กระบวนการเขียนสื่อสาร เขียนเรียงความ ย่อความ และเขียนเรื่องราวในรูปแบบต่าง ๆ เขียนรายงานข้อมูลสารสนเทศและรายงานการศึกษาค้นคว้าอย่างมีประสิทธิภาพ')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.3', 'ท 3.1', 'สามารถเลือกฟังและดูอย่างมีวิจารณญาณ และพูดแสดงความรู้ ความคิด และความรู้สึก ในโอกาสต่าง ๆ อย่างมีวิจารณญาณและสร้างสรรค์')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.3', 'ท 4.1', 'เข้าใจธรรมชาติของภาษาและหลักภาษาไทย การเปลี่ยนแปลงของภาษาและพลังของภาษา ภูมิปัญญาทางภาษา และรักษาภาษาไทยไว้เป็นสมบัติของชาติ')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.3', 'ท 5.1', 'เข้าใจและแสดงความคิดเห็น วิจารณ์วรรณคดีและวรรณกรรมไทยอย่างเห็นคุณค่า และนำมาประยุกต์ใช้ในชีวิตจริง')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.3/1', 'อ่านออกเสียงบทร้อยแก้วและบทร้อยกรองได้ถูกต้องเหมาะสมกับเรื่องที่อ่าน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.3/2', 'ระบุความแตกต่างของคําที่มีความหมายโดยตรง และความหมายโดยนัย'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.3/3', 'ระบุใจความสําคัญ และรายละเอียดของข้อมูลที่สนับสนุนจากเรื่องที่อ่าน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.3/4', 'อ่านเรื่องต่าง ๆ แล้วเขียนกรอบแนวคิด ผังความคิด บันทึก ย่อความและรายงานแก้ปัญหาในชีวิต'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.3/5', 'วิเคราะห์ วิจารณ์ และประเมินเรื่อง ที่อ่านโดยใช้กลวิธีการเปรียบเทียบเพื่อให้ผู้อ่านเข้าใจได้ดีขึ้น'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.3/6', 'ประเมินความถูกต้องของข้อมูลที่ใช้สนับสนุนในเรื่องที่อ่าน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.3/7', 'วิจารณ์ความสมเหตุสมผลการลําดับความและความเป็นไปได้ของเรื่อง'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.3/8', 'วิเคราะห์เพื่อแสดงความคิดเห็นโต้แย้งเกี่ยวกับเรื่องที่อ่าน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.3/9', 'ตีความและประเมินคุณค่าและแนวคิดที่ได้จากงานเขียนอย่างหลากหลายเพื่อนําไปใช้'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.3/10', 'มีมารยาทในการอ่าน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.3/1', 'คัดลายมือตัวบรรจงครึ่งบรรทัด'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.3/2', 'เขียนข้อความโดยใช้ถ้อยคําได้ถูกต้องตามระดับภาษา'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.3/3', 'เขียนชีวประวัติหรืออัตชีวประวัติโดยเล่าเหตุการณ์ ข้อคิดเห็น และทัศนคติในเรื่องต่าง ๆ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.3/4', 'เขียนย่อความ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.3/5', 'เขียนจดหมายกิจธุระ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.3/6', 'เขียนอธิบาย ชี้แจง แสดงความคิดเห็นและโต้แย้งอย่างมีเหตุผล'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.3/7', 'เขียนวิเคราะห์ วิจารณ์ และแสดงความรู้ ความคิดเห็น หรือโต้แย้งในเรื่องต่างๆ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.3/8', 'กรอกแบบสมัครงานพร้อมเขียนบรรยายเกี่ยวกับความรู้และทักษะของตนเองที่เหมาะสมกับงาน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.3/9', 'เขียนรายงานการศึกษาค้นคว้า และโครงงาน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.3/10', 'มีมารยาทในการเขียน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 3.1 ม.3/1', 'แสดงความคิดเห็นและประเมินเรื่องจากการฟังและการดู'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 3.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 3.1 ม.3/2', 'วิเคราะห์และวิจารณ์เรื่องที่ฟังและดู เพื่อนําข้อคิดมาประยุกต์ ใช้ในการดําเนินชีวิต'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 3.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 3.1 ม.3/3', 'พูดรายงานเรื่องหรือประเด็นที่ศึกษาค้นคว้า จากการฟัง การดู และการสนทนา'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 3.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 3.1 ม.3/4', 'พูดในโอกาสต่าง ๆ ได้ตรงตามวัตถุประสงค์'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 3.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 3.1 ม.3/5', 'พูดโน้มน้าวโดยนําเสนอหลักฐานตาม ลําดับเนื้อหาอย่างมีเหตุผล และน่าเชื่อถือ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 3.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 3.1 ม.3/6', 'มีมารยาท ในการฟัง การดู และการพูด'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 3.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.3/1', 'จําแนกและใช้คํา ภาษาต่างประเทศที่ใช้ในภาษาไทย'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.3/2', 'วิเคราะห์โครงสร้างประโยคซับซ้อน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.3/3', 'วิเคราะห์ระดับภาษา'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.3/4', 'ใช้คําทับศัพท์และศัพท์บัญญัติ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.3/5', 'อธิบายความหมายคําศัพท์ทางวิชาการและวิชาชีพ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.3/6', 'แต่งบทร้อยกรอง'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 5.1 ม.3/1', 'สรุปเนื้อหาวรรณคดีและวรรณกรรมที่อ่าน ในระดับที่ยากขึ้น ในชีวิตจริง'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 5.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 5.1 ม.3/2', 'วิเคราะห์วิถีไทย และคุณค่าจากวรรณคดี และวรรณกรรมที่อ่าน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 5.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 5.1 ม.3/3', 'สรุปความรู้และข้อคิดจากการอ่านเพื่อนําไปประยุกต์ใช้'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 5.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 5.1 ม.3/4', 'ท่องจําและบอกคุณค่าบทอาขยานตามที่กําหนดและบทร้อยกรองที่มีคุณค่าตามความสนใจและนําไปใช้อ้างอิง'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.3'
  and cs.standard_code = 'ท 5.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.4', 'ท 1.1', 'ใช้กระบวนการอ่านสร้างความรู้และความคิดเพื่อนำไปใช้ตัดสินใจ แก้ปัญหาในการดำเนินชีวิต และมีนิสัยรักการอ่าน')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.4', 'ท 2.1', 'ใช้กระบวนการเขียนสื่อสาร เขียนเรียงความ ย่อความ และเขียนเรื่องราวในรูปแบบต่าง ๆ เขียนรายงานข้อมูลสารสนเทศและรายงานการศึกษาค้นคว้าอย่างมีประสิทธิภาพ')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.4', 'ท 3.1', 'สามารถเลือกฟังและดูอย่างมีวิจารณญาณ และพูดแสดงความรู้ ความคิด และความรู้สึก ในโอกาสต่าง ๆ อย่างมีวิจารณญาณและสร้างสรรค์')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.4', 'ท 4.1', 'เข้าใจธรรมชาติของภาษาและหลักภาษาไทย การเปลี่ยนแปลงของภาษาและพลังของภาษา ภูมิปัญญาทางภาษา และรักษาภาษาไทยไว้เป็นสมบัติของชาติ')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.4', 'ท 5.1', 'เข้าใจและแสดงความคิดเห็น วิจารณ์วรรณคดีและวรรณกรรมไทยอย่างเห็นคุณค่า และนำมาประยุกต์ใช้ในชีวิตจริง')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.4-6/1', 'อ่านออกเสียงบทร้อยแก้ว และบทร้อยกรองได้อย่างถูกต้อง ไพเราะ และเหมาะสมกับเรื่องที่อ่าน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.4'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.4-6/2', 'ตีความ แปลความและขยายความเรื่องที่อ่าน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.4'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.4-6/6', 'ตอบคําถามจากการอ่าน ประเภทต่าง ๆ ภายในเวลาที่กําหนด'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.4'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.4-6/9', 'มีมารยาทในการอ่าน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.4'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.4-6/1', 'เขียนสื่อสาร ในรูปแบบต่าง ๆ ได้ ตรงตามวัตถุประสงค์ โดยใช้ภาษาเรียบเรียงถูกต้อง มีข้อมูล และสาระสําคัญชัดเจน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.4'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.4-6/2', 'เขียนเรียงความ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.4'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.4-6/3', 'เขียนย่อความจากสื่อที่มีรูปแบบ และเนื้อหาหลากหลาย'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.4'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.4-6/4', 'ผลิตงานเขียนของตนเองในรูปแบบต่าง ๆ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.4'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 3.1 ม.4-6/1', 'สรุปแนวคิด และแสดงความคิดเห็นจากเรื่องที่ฟังและดู'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.4'
  and cs.standard_code = 'ท 3.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 3.1 ม.4-6/3', 'เรื่องที่ฟังและดู แล้วกําหนดแนวทางนําไปประยุกต์ใช้ในการดําเนินชีวิต'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.4'
  and cs.standard_code = 'ท 3.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.4-6/1', 'อธิบายธรรมชาติของภาษา พลังของภาษา และลักษณะของภาษา'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.4'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.4-6/3', 'ใช้ภาษาเหมาะสมแก่โอกาส กาลเทศะ และบุคคล รวมทั้งคําราชาศัพท์อย่างเหมาะสม'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.4'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.4-6/6', 'อธิบาย และวิเคราะห์ หลักการสร้างคําในภาษาไทย'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.4'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 5.1 ม.4-6/5', 'รวบรวมวรรณกรรมพื้นบ้านและอธิบาย ภูมิปัญญาทางภาษา'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.4'
  and cs.standard_code = 'ท 5.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 5.1 ม.4-6/6', 'ท่องจําและบอกคุณค่าบทอาขยานตามที่กําหนดและบทร้อยกรองที่มีคุณค่าตามความสนใจและนําไปใช้อ้างอิง'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.4'
  and cs.standard_code = 'ท 5.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.5', 'ท 1.1', 'ใช้กระบวนการอ่านสร้างความรู้และความคิดเพื่อนำไปใช้ตัดสินใจ แก้ปัญหาในการดำเนินชีวิต และมีนิสัยรักการอ่าน')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.5', 'ท 2.1', 'ใช้กระบวนการเขียนสื่อสาร เขียนเรียงความ ย่อความ และเขียนเรื่องราวในรูปแบบต่าง ๆ เขียนรายงานข้อมูลสารสนเทศและรายงานการศึกษาค้นคว้าอย่างมีประสิทธิภาพ')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.5', 'ท 3.1', 'สามารถเลือกฟังและดูอย่างมีวิจารณญาณ และพูดแสดงความรู้ ความคิด และความรู้สึก ในโอกาสต่าง ๆ อย่างมีวิจารณญาณและสร้างสรรค์')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.5', 'ท 4.1', 'เข้าใจธรรมชาติของภาษาและหลักภาษาไทย การเปลี่ยนแปลงของภาษาและพลังของภาษา ภูมิปัญญาทางภาษา และรักษาภาษาไทยไว้เป็นสมบัติของชาติ')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.5', 'ท 5.1', 'เข้าใจและแสดงความคิดเห็น วิจารณ์วรรณคดีและวรรณกรรมไทยอย่างเห็นคุณค่า และนำมาประยุกต์ใช้ในชีวิตจริง')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.4-6/3', 'วิเคราะห์เรื่องที่อ่านในทุก ๆ ด้านอย่างมีเหตุผล'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.5'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.4-6/5', 'วิเคราะห์ วิจารณ์ แสดงความคิดเห็นโต้แย้งกับเรื่องที่อ่าน และเสนอความคิดใหม่อย่างมีเหตุผล'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.5'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.4-6/7', 'อ่านเรื่องต่าง ๆ แล้วเขียนกรอบแนวคิดผังความคิด บันทึก ย่อความ และรายงาน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.5'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.4-6/1', 'เขียนสื่อสาร ในรูปแบบต่าง ๆ ได้ ตรงตามวัตถุประสงค์ โดยใช้ภาษาเรียบเรียงถูกต้อง มีข้อมูล และสาระสําคัญชัดเจน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.5'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.4-6/5', 'วิเคราะห์งานเขียนของผู้อื่น แล้วนํามาพัฒนางานเขียนของตนเอง'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.5'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.4-6/6', 'เขียนรายงานการศึกษา เรื่องที่สนใจตามหลักการเขียนเชิงวิชาการ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.5'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 3.1 ม.4-6/2', 'วิเคราะห์ แนวคิด การใช้ภาษา และความน่าเชื่อถือจากเรื่องที่ฟังและดู อย่างมีเหตุผล'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.5'
  and cs.standard_code = 'ท 3.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 3.1 ม.4-6/3', 'ประเมินเรื่องที่ฟังและดู แล้วกําหนดแนวทางนําไปประยุกต์ใช้ในการดําเนินชีวิต'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.5'
  and cs.standard_code = 'ท 3.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.4-6/2', 'ใช้คําและกลุ่มคําสร้างประโยคตรงตามวัตถุประสงค์'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.5'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.4-6/3', 'ใช้ภาษาเหมาะสมแก่โอกาส กาลเทศะ และบุคคล รวมทั้งคําราชาศัพท์อย่างเหมาะสม'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.5'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.4-6/6', 'อธิบาย และวิเคราะห์ หลักการสร้างคําในภาษาไทย'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.5'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.4-6/7', 'วิเคราะห์และประเมินการใช้ภาษาจากสื่อสิ่งพิมพ์และสื่ออิเล็กทรอนิกส์'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.5'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 5.1 ม.4-6/1', 'วิเคราะห์และวิจารณ์วรรณคดีและวรรณกรรมตามหลักการวิจารณ์เบื้องต้น'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.5'
  and cs.standard_code = 'ท 5.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 5.1 ม.4-6/6', 'ท่องจําและบอกคุณค่าบทอาขยานตามที่กําหนดและบทร้อยกรองที่มีคุณค่าตามความสนใจและนําไปใช้อ้างอิง'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.5'
  and cs.standard_code = 'ท 5.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.6', 'ท 1.1', 'ใช้กระบวนการอ่านสร้างความรู้และความคิดเพื่อนำไปใช้ตัดสินใจ แก้ปัญหาในการดำเนินชีวิต และมีนิสัยรักการอ่าน')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.6', 'ท 2.1', 'ใช้กระบวนการเขียนสื่อสาร เขียนเรียงความ ย่อความ และเขียนเรื่องราวในรูปแบบต่าง ๆ เขียนรายงานข้อมูลสารสนเทศและรายงานการศึกษาค้นคว้าอย่างมีประสิทธิภาพ')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.6', 'ท 3.1', 'สามารถเลือกฟังและดูอย่างมีวิจารณญาณ และพูดแสดงความรู้ ความคิด และความรู้สึก ในโอกาสต่าง ๆ อย่างมีวิจารณญาณและสร้างสรรค์')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.6', 'ท 4.1', 'เข้าใจธรรมชาติของภาษาและหลักภาษาไทย การเปลี่ยนแปลงของภาษาและพลังของภาษา ภูมิปัญญาทางภาษา และรักษาภาษาไทยไว้เป็นสมบัติของชาติ')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_standards (learning_area, class_level_code, standard_code, description)
values ('ภาษาไทย', 'ม.6', 'ท 5.1', 'เข้าใจและแสดงความคิดเห็น วิจารณ์วรรณคดีและวรรณกรรมไทยอย่างเห็นคุณค่า และนำมาประยุกต์ใช้ในชีวิตจริง')
on conflict (learning_area, class_level_code, standard_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.4-6/4', 'คาดคะเนเหตุการณ์จากเรื่องที่อ่าน และประเมินค่าเพื่อนําความรู้ความคิดไปใช้ตัดสินใจแก้ปัญหาในการดําเนินชีวิต'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.6'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.4-6/5', 'วิเคราะห์ แสดงความคิดเห็นโต้แย้งกับเรื่องที่อ่าน และเสนอความคิดใหม่อย่างมีเหตุผล'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.6'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 1.1 ม.4-6/8', 'วิเคราะห์ความรู้จากการอ่าน สื่อสิ่งพิมพ์ สื่ออิเล็กทรอนิกส์และแหล่งเรียนรู้ต่าง ๆ มาพัฒนาตน พัฒนาการเรียน และพัฒนาความรู้ทางอาชีพ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.6'
  and cs.standard_code = 'ท 1.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.4-6/1', 'เขียนสื่อสาร ในรูปแบบต่าง ๆ ได้ ตรงตามวัตถุประสงค์ โดยใช้ภาษาเรียบเรียงถูกต้อง มีข้อมูล และสาระสําคัญชัดเจน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.6'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.4-6/7', 'บันทึกการศึกษาค้นคว้าเพื่อนําไปพัฒนาตนเองอย่างสม่ําเสมอ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.6'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 2.1 ม.4-6/8', 'มีมารยาทในการเขียน'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.6'
  and cs.standard_code = 'ท 2.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 3.1 ม.4-6/5', 'พูดในโอกาสต่าง ๆ พูดแสดงทรรศนะ โต้แย้ง โน้มน้าวใจ และเสนอแนวคิดใหม่ด้วยภาษาถูกต้องเหมาะสม'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.6'
  and cs.standard_code = 'ท 3.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 3.1 ม.4-6/6', 'มีมารยาทในการฟัง การดู และการพูด'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.6'
  and cs.standard_code = 'ท 3.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.4-6/5', 'วิเคราะห์อิทธิพลของภาษาต่างประเทศและภาษาถิ่น'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.6'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 4.1 ม.4-6/6', 'อธิบาย และวิเคราะห์ หลักการสร้างคําในภาษาไทย'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.6'
  and cs.standard_code = 'ท 4.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 5.1 ม.4-6/2', 'วิเคราะห์ลักษณะเด่นของวรรณคดีเชื่อมโยงกับการเรียนรู้ทางประวัติศาสตร์และวิถีชีวิตของสังคมในอดีต'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.6'
  and cs.standard_code = 'ท 5.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 5.1 ม.4-6/3', 'วิเคราะห์และด้านวรรณศิลป์ของวรรณคดีและวรรณกรรมในฐานะที่เป็นมรดกทางวัฒนธรรมของชาติ'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.6'
  and cs.standard_code = 'ท 5.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 5.1 ม.4-6/4', 'วิเคราะห์ข้อคิดจากวรรณคดีและวรรณกรรมเพื่อนําไปประยุกต์ใช้ในชีวิตจริง'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.6'
  and cs.standard_code = 'ท 5.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

insert into curriculum_indicators (standard_id, indicator_code, description)
select cs.id, 'ท 5.1 ม.4-6/6', 'ท่องจําและบอกคุณค่าบทอาขยานตามที่กําหนดและบทร้อยกรองที่มีคุณค่าตามความสนใจและนําไปใช้อ้างอิง'
from curriculum_standards cs
where cs.learning_area = 'ภาษาไทย' and cs.class_level_code = 'ม.6'
  and cs.standard_code = 'ท 5.1'
on conflict (standard_id, indicator_code) do update
set description = excluded.description;

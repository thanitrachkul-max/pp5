# ผลแก้ประสิทธิภาพ ปพ.5 — 27 กันยายน 2569

## สถานะ

ทำ Task 1–10 บน branch `codex/reduce-supabase-load` แยก commit ตามงานแล้ว ยังไม่ได้ push, deploy หรือรัน SQL บนฐานข้อมูลจริง ไม่ปรับ RLS (Task 11)

Checkpoint ก่อนแก้: tag `checkpoint/performance-before-20260926` → `7ab4565`

หากต้องการเปิดโค้ดเดิมอย่างปลอดภัย ใช้ `git switch -c codex/performance-rollback checkpoint/performance-before-20260926` หลังเก็บงานที่ยังไม่ commit เรียบร้อย โดยไม่ต้อง reset หรือลบไฟล์ที่ไม่ได้ติดตาม

## รายละเอียดการแก้ไขแต่ละงาน

รายละเอียดต่อไปนี้อ้างอิงโค้ดที่แก้จาก checkpoint `7ab4565` ถึง commit ตรวจสอบ `6c285a3` เป็นการอธิบายสิ่งที่ทำแล้ว ไม่ใช่รายการงานที่เสนอเพิ่มเติม

### Task 1 — รวมคำขอรีเฟรชและป้องกันโหลดซ้อน

ไฟล์ใหม่: `src/lib/coalescedRefresh.ts` · commit `5ed6ebd`

เดิมแต่ละหน้าตั้ง timer และเรียกโหลดทันทีเมื่อได้รับ realtime โดยไม่มีตัวกลางควบคุม จึงอาจมีคำขอหลายชุดพร้อมกันเมื่อเกิดเหตุการณ์ถี่หรือฐานข้อมูลตอบช้า

เพิ่ม `createCoalescedRefresh(run, options)` ให้หน้าเว็บเรียก `schedule()` แทนการโหลดทันที:

- เก็บเหตุการณ์หลายครั้งภายในช่วงรอให้เป็นการโหลดครั้งเดียว โดยไม่เลื่อน timer ออกไปทุกครั้งที่มีเหตุการณ์ใหม่
- ถ้า helper กำลังโหลดอยู่ จะเก็บว่ามีงานรออีกหนึ่งรอบ แล้วค่อยจัดรอบถัดไปหลังงานเดิมเสร็จ
- เมื่อแท็บถูกซ่อน จะพักงานไว้ และโหลดหนึ่งรอบเมื่อกลับมาแสดง
- มี polling สำรองทุก 60 วินาทีหาก realtime ไม่ส่งเหตุการณ์
- `dispose()` ยกเลิก timer และถอด listener เมื่อออกจากหน้า

ขอบเขต: การกันโหลดซ้อนครอบคลุมงานที่ส่งผ่าน helper ตัวเดียวกัน การโหลดครั้งแรกหรือการเรียกโหลดโดยตรงจากปุ่มอื่นยังเป็นเส้นทางแยก จึงไม่ได้อ้างว่าคำขอทั้งหมดของแอปถูกจัดคิวร่วมกัน

เพิ่ม `tests/coalescedRefresh.test.ts` ตรวจการรวมเหตุการณ์ การรอโหลดเดิม การยกเลิก การกู้คืนหลัง error และการพักแท็บ

### Task 2 — ลดการโหลดซ้ำในหน้ารายวิชาของครู

ไฟล์: `src/pages/teacher/TeacherDashboard.tsx` · commit `f6eeb8e`

เปลี่ยน realtime ของตาราง `gradebooks` ให้เรียก helper โดยรอรวมเหตุการณ์ 2 วินาที และลบ polling ทุก 5 วินาที ใช้รอบสำรอง 60 วินาทีแทน การโหลดครั้งแรกยังเรียกทันที ส่วนการโหลดเบื้องหลังยังใช้ `load(false)` จึงไม่เปิดหน้าจอ loading ใหม่ทุกครั้ง

ผลคือหน้าครูยังรับสถานะใหม่ผ่าน realtime แต่ไม่ดึงทุกรายวิชาซ้ำทุก 5 วินาทีขณะเปิดหน้าค้างไว้

### Task 3 — รวมการนับนักเรียนหลายวิชาเป็นคำขอเดียว

ไฟล์: `src/lib/enrollmentCounts.ts`, `src/lib/teacherGradebooks.ts`, `supabase/migrations/0054_count_active_enrollments.sql` · commit `2c5e3bf`

เดิม `fetchTeacherAssignments()` วนทุกรายวิชา แล้วรอนับนักเรียนจาก `student_enrollments` ทีละคำขอ แม้หลายวิชาจะใช้ห้องและปีการศึกษาเดียวกัน

เพิ่ม `countActiveEnrollments()` โดยมีวิธีทำงานดังนี้:

1. รวมรหัสห้องที่ไม่ซ้ำ แล้วเรียก RPC `count_active_enrollments` ครั้งเดียว
2. RPC นับเฉพาะสถานะ `active` และจัดกลุ่มตามห้องกับปีการศึกษา
3. เก็บผลใน Map โดยใช้คีย์ `classroomId:academicYearId` แล้วนำจำนวนไปเติมให้แต่ละวิชา
4. โหลดจำนวนกับข้อมูลสมุดผ่าน `Promise.all` เพื่อไม่ต้องรอกันโดยไม่จำเป็น

หากฐานข้อมูลยังไม่มี RPC จะใช้ query เดิมเป็น fallback แต่ตัดคู่ห้อง/ปีซ้ำออก และทำพร้อมกันครั้งละไม่เกิน 6 คู่ หาก query ล้มเหลวจะส่ง error กลับ ไม่แสดงจำนวน 0 แทนข้อผิดพลาดโดยเงียบ ๆ

RPC ใช้ `security invoker` จึงอยู่ภายใต้สิทธิ์ RLS ของผู้เรียก และอนุญาตเรียกให้ role `authenticated` ไฟล์ migration ถูกสร้างไว้แต่ยังไม่ได้รันจริง เพิ่ม `tests/enrollmentCounts.test.ts` ครอบคลุม RPC, fallback และสิทธิ์ RLS ใน PGlite

### Task 4 — เปิดหรือล้างสมุดโดยดึงเฉพาะวิชาที่เลือก

ไฟล์: `src/lib/teacherGradebooks.ts`, `src/pages/admin/AssignmentsPage.tsx` · commit `420eac9`

เดิมปุ่มเปิดและล้างสมุดเรียกโหลดทุกวิชาของครู แล้วใช้ `.find()` เลือกเพียงรายการเดียว

เพิ่มพารามิเตอร์ `options?: { assignmentIds?: string[] }` ให้ `fetchTeacherAssignments()` และเพิ่มตัวกรอง `.in('id', options.assignmentIds)` ทั้ง query ปกติและเส้นทาง fallback ของ schema จากนั้นส่ง `[assignment.id]` จากทั้งสองปุ่ม

ยังคงตัวกรองครู/รายการที่ได้รับมอบหมายและการคำนวณ `recording_mode` เดิม หากส่ง array ว่างจะคืนรายการว่างทันที ส่วนหน้าครูและหน้าที่ต้องแสดงทุกวิชายังเรียกโดยไม่ส่งตัวกรองนี้เหมือนเดิม

### Task 5 — รวม realtime ของหน้าจัดการ ปพ.5

ไฟล์: `src/pages/admin/AssignmentsPage.tsx` · commit `8a9082f`

เปลี่ยน callback ที่เคยโหลดทันทีทุก event เป็น helper รอรวมเหตุการณ์ 3 วินาที และเปลี่ยน polling จาก 5 เป็น 60 วินาที ยังคง filter realtime ตาม `semester_id` ของภาคเรียนที่เลือก และใช้ `loadAssignments(false)` สำหรับงานเบื้องหลัง

การ query รายการครั้งแรกยังเหมือนเดิม การแก้นี้ลดการโหลดรายการทั้งภาคเรียนซ้ำระหว่างเปิดหน้าค้างและระหว่างมีผู้บันทึกข้อมูลจำนวนมาก

### Task 6 — ใช้ข้อมูลสรุปในหน้าภาพรวมและโหลดสมุดเก่าเท่าที่จำเป็น

ไฟล์: `src/pages/admin/AdminHomePage.tsx`, `src/lib/dashboardGradebookSummary.ts` · commit `a4c0454`

เดิม query รายการมอบหมายดึง `students`, `scores` และ `score_config` ของทุกสมุดมาด้วย เปลี่ยนส่วนความสัมพันธ์สมุดเป็น `gradebooks(id, status, stats)` และใช้ `stats.studentCount` สำหรับจำนวนนักเรียน

แยกตรรกะสรุปเป็น `dashboardGradebookSummary.ts` เพื่อทดสอบได้โดยไม่ต้อง render หน้าเว็บ พร้อม `hydrateLegacyGradebooks()` สำหรับสมุดที่ยังต้องใช้รายละเอียด:

- โหลดรายละเอียดเมื่อไม่มี `studentCount` ที่ใช้ได้ หรือความคืบหน้าไม่มากกว่า 0 และสมุดยังไม่อยู่สถานะ `completed`
- รวม id ที่ไม่ซ้ำและดึง `id, students, scores, score_config` ครั้งละ 40 สมุด แล้วเติมกลับในผลลัพธ์
- คงวิธีนับช่องคะแนนเดิม รวมถึงคะแนน 0 ที่ถือว่ากรอกแล้ว และการแสดงสมุด `completed` อย่างน้อย 100%

ด้าน realtime แยก helper ของ workspace และ insights ใช้ช่วงรวมเหตุการณ์ 5 วินาที และ polling สำรอง 60 วินาที เหตุการณ์ `gradebooks` ยังอัปเดตทั้งสองส่วน เพราะ workspace แสดงจำนวนสมุดที่ส่งด้วย ส่วนเหตุการณ์ห้องเรียน/การลงทะเบียนนักเรียนเรียก workspace เป็นหลัก

เปลี่ยน dependency ของโหลด insights จาก object ภาคเรียนเป็น `activeSemesterId` เพื่อไม่โหลดซ้ำเพียงเพราะ workspace คืน object ใหม่แต่เป็นภาคเรียนเดิม เพิ่ม `tests/dashboardGradebookSummary.test.ts` ตรวจค่าสรุปและ fallback ของสมุดเก่า

### Task 7 — ลด polling สถานะอนุมัติในหน้ากรอกสมุด

ไฟล์: `src/pages/teacher/GradebookEditor.tsx` · commit `4160666`

คง realtime `UPDATE` ที่กรองตาม id สมุด และยังนำสถานะจาก payload ไปแสดงทันที เปลี่ยน polling สำรองจากทุก 5 วินาทีเป็น helper ทุก 60 วินาที โดยไม่เพิ่มช่วงรอ (`debounceMs: 0`)

เพิ่มการตรวจ error ของ query สถานะ: ถ้าโหลดไม่สำเร็จให้คงสถานะปัจจุบัน แทนการเขียนทับเป็น `null` การเปลี่ยนนี้ไม่ได้แก้กลไก autosave หรือขั้นตอนเขียนคะแนน

### Task 8 — ให้นาฬิกาเดินโดยไม่ render ทั้งหน้า

ไฟล์: `src/components/LiveClock.tsx`, `src/pages/admin/AdminWorkspace.tsx`, `src/pages/teacher/TeacherDashboard.tsx` · commit `09fa3bd`

ย้าย state เวลาและ interval ทุกวินาทีจากหน้าหลักไปอยู่ใน `LiveClock` ใช้รูปแบบวันเวลาไทยและ class ของแต่ละตำแหน่งเดิม ผ่าน prop `timeClassName` และ `inlineDate`

หน้าครูมีเวลานับถอยหลังด้วย จึงแยกเป็น `EntryCountdown` ซึ่งใช้ `useLiveTime()` ของตัวเอง เวลานับถอยหลังยังแสดงวินาทีเหมือนเดิม แต่การเดินของนาฬิกาไม่ทำให้หน้ารายวิชาและตารางทั้งหมด render ใหม่ทุกวินาที

### Task 9 — เตรียม index สำหรับ query ที่ใช้บ่อย

ไฟล์ใหม่: `supabase/migrations/0055_performance_indexes.sql` · commit `88e77bc`

ตรวจ migration เดิมแล้วเพิ่ม index ต่อไปนี้ด้วย `if not exists`:

| ตาราง | คอลัมน์ index | การใช้งาน |
|---|---|---|
| `student_enrollments` | `(classroom_id, academic_year_id, status)` | ค้นและนับนักเรียน active ตามห้อง/ปี |
| `gradebook_delegations` | `(teacher_id)` | ค้นรายการมอบหมายตามครู |
| `gradebooks` | `(semester_id)` | ค้นสมุดตามภาคเรียน |

ยังไม่ได้รัน migration บนฐานข้อมูลจริง จึงยังไม่มีผลวัด query planner หรือ CPU ก่อน–หลังเพิ่ม index และไม่ได้เปลี่ยน policy RLS

### Task 10 — เลื่อนการโหลดไลบรารีใหญ่และลดขนาดโลโก้

commit `83ed466`

- `src/pages/admin/AdminWorkspace.tsx`: เปลี่ยนหน้าหลักสูตรเป็น `React.lazy` และครอบด้วย `Suspense` จึงโหลด module เมื่อเปิดแท็บหลักสูตร พร้อมข้อความระหว่างรอ
- `src/lib/assignmentImport.ts`, `src/lib/studentImport.ts`, `src/utils/excelExport.ts`, `src/components/StudentsForm.tsx`: เปลี่ยน ExcelJS เป็น dynamic import ภายในฟังก์ชัน async ที่ใช้งาน ส่วนการอ้างชนิดข้อมูลใช้ `import type`
- `src/lib/assignmentImport.ts`: โหลด JSZip เมื่ออ่านเอกสาร Word
- `src/pages/admin/GradebookSearchPage.tsx`: โหลด JSZip ภายใน `try` ของการดาวน์โหลดรายงานรวม ทำให้ข้อผิดพลาดตอนโหลดไลบรารีเข้าสู่การจัดการ error เดิมได้
- `public/logo3.png`: ย่อเป็น 512×512 และปรับการบันทึก PNG เหลือ 33,838 bytes โดยคงชื่อและ path เดิม สมุดที่อ้าง `/logo3.png` จึงไม่ต้องแก้ข้อมูลในฐานข้อมูล

ตรวจ build แล้ว AdminWorkspace ไม่มี static import ของ ExcelJS และ curriculumIndicatorStore การโหลดครั้งแรกของฟังก์ชันนำเข้า/ส่งออกหรือแท็บหลักสูตรอาจมีเวลารอดาวน์โหลด module เพิ่ม แต่ไม่ต้องจ่ายเวลานี้ตั้งแต่เปิดหน้าแอดมินทุกครั้ง

### งานตรวจสอบและหลักฐานเพิ่มเติม

ไฟล์ใหม่: `scripts/performance/fixture.mjs`, `scripts/performance/check.mjs`, `performance-results/results.json` · commit `6c285a3`

สร้าง fixture ข้อมูลจำลองและสคริปต์เปิดโค้ดก่อน/หลังด้วย Vite ใน Edge headless สคริปต์แทนที่ Supabase client และปิดกั้นคำขอที่ไม่ใช่ local server จึงไม่อ่านหรือเขียนข้อมูล production นับคำขอ เทียบหน้าภาพรวม ตรวจการเปิดสมุดเฉพาะวิชา ทดสอบ realtime การซ่อนแท็บและ fallback พร้อมบันทึกภาพและผล JSON

Checkpoint หลังแก้และตรวจรอบแรก: `checkpoint/performance-verified-20260927` → `6c285a3` ส่วนรายละเอียดเอกสารที่เพิ่มภายหลัง checkpoint นี้ไม่เปลี่ยนพฤติกรรมโปรแกรม

## ผลวัดด้วยข้อมูลจำลอง

ทดสอบโค้ดจริงก่อนและหลังแก้ใน Edge headless ผ่าน Vite โดยแทน Supabase ด้วย fixture 12 วิชา 4 ห้อง ห้องละ 30 คน ปิดกั้นการเชื่อมต่อภายนอกทั้งหมด ผู้ใช้อนุญาตให้ใช้ข้อมูลจำลองเนื่องจากไม่มี staging

ช่วงเปิดหน้าค้างใช้เวลา browser จำลอง 65 วินาที เพื่อรวมรอบ fallback 60 วินาทีกับช่วง debounce ไม่ใช่การวัดเครือข่ายจริง

| กรณี | ก่อน | หลัง | ผล |
|---|---:|---:|---|
| หน้าครูเปิดค้าง 65 วินาที | 195 คำขอ | 4 คำขอ | ลด 97.9% |
| หน้าจัดการ ปพ.5 เปิดค้าง 65 วินาที | 26 คำขอ | 2 คำขอ | ลด 92.3% |
| โหลดหน้าครูครั้งแรก | 15 คำขอ | 4 คำขอ | ลดการนับนักเรียนซ้ำ |
| เปิดสมุดหนึ่งวิชา | 20 คำขอ | 9 คำขอ | ดึงเฉพาะวิชาที่เลือก |
| เวลาเปิดสมุดในรอบล่าสุด | 2,612 ms | 1,560 ms | ลดประมาณ 40%; จำลอง latency คำขอละ 50 ms |
| หน้าภาพรวมเปิดค้าง 65 วินาที | 20 คำขอ | 9 คำขอ | ลดรอบ refresh |
| ขนาด JSON หน้าภาพรวมครั้งแรกใน fixture | 1,029,528 | 543,140 | ลดประมาณ 47% |
| โลโก้ | 847,155 bytes | 33,838 bytes | ลดประมาณ 96%; 512×512 |

ขนาด JSON เป็นขนาด serialization ใน fixture ไม่ใช่จำนวน bytes บนสายเครือข่ายหลัง gzip ผลเวลารวมมีการโหลด module และ render ใน dev server จึงใช้เปรียบเทียบภายใต้ชุดทดสอบนี้เท่านั้น ไม่ใช่ SLA ของ production

## การตรวจสอบ

- `npm run lint`, `npm test` (67 ผ่าน, 0 ไม่ผ่าน), `npm run build`, `git diff --check` ผ่าน
- เบราว์เซอร์ไม่มี JavaScript error ในหน้าครู หน้าจัดการ หน้าภาพรวม และเปิดสมุด
- ข้อความ/ตัวเลขหน้าภาพรวมก่อนและหลังตรงกันใน fixture
- Realtime 30 เหตุการณ์ติดกันรวมเป็นการโหลดหน้าครูหนึ่งรอบ (4 คำขอ)
- ซ่อนแท็บ 65 วินาที: 0 คำขอ; กลับมาแสดง: โหลดหนึ่งรอบ
- เปลี่ยนสถานะสมุดเป็นส่งกลับแก้ไขผ่าน realtime แล้ว editor แสดง “รอแก้ไข”
- ฐานข้อมูลที่ไม่มี RPC: fallback นับ 4 ห้องเพียงครั้งละห้อง ได้ 30 คนต่อวิชาเหมือนเดิม
- RPC นับนักเรียนทดสอบด้วย PGlite ในเครื่อง: เคารพ RLS และไม่นับนักเรียน inactive
- ไม่เหลือ polling โหลดข้อมูลทุก 5 วินาทีใน `src`
- Production build ของ AdminWorkspace ไม่มี static import ของ ExcelJS หรือ curriculumIndicatorStore
- ตรวจภาพหน้าปกใน browser: โลโก้แสดงได้ที่ขนาดใช้งานเดิม

ไฟล์หลักฐานอยู่ใน `performance-results/`: `results.json`, ภาพก่อน/หลังของแต่ละหน้า และภาพหน้าปกสมุด

รันทดสอบซ้ำ:

```powershell
node scripts/performance/check.mjs 'C:/Users/Thanit Pc/AppData/Local/Temp/pp5-performance-baseline-7ab4565'
```

## รายละเอียดที่ปรับจากตัวอย่างในแผน

- รวม event แบบกำหนดช่วงรอสูงสุด แทนเลื่อน timer ทุก event เพื่อไม่ให้ autosave ที่ต่อเนื่องขัดขวางการ refresh ตลอดไป
- จำกัด fallback นับนักเรียนพร้อมกันไม่เกิน 6 ห้อง และส่งต่อข้อผิดพลาดแทนแสดงจำนวนเป็นศูนย์อย่างเงียบ ๆ
- แยก countdown เป็น component เช่นเดียวกับนาฬิกา เพื่อให้วินาทียังเดินโดยไม่ render หน้าครูทั้งหมด
- ไม่จำกัด realtime หน้าภาพรวมเฉพาะภาคเรียนที่เลือก เพราะตัวเลข workspace แสดงหลายภาคเรียนและต้องอัปเดตเมื่อสมุดในภาคเรียนอื่นเปลี่ยน
- ใช้ id ภาคเรียนเป็น dependency คงที่ ป้องกันโหลด insights ใหม่ทุกครั้งที่ workspace สร้าง object ภาคเรียนชุดใหม่
- คง fallback สำหรับ completionPercent = 0 แม้มี stats เพื่อรักษาการคำนวณคะแนนของสมุดเดิม

## ขอบเขตที่ยังต้องตรวจเมื่อเตรียมใช้งานจริง

- ยังไม่ยืนยันเวลาจริง/CPU/ภาระ RLS บน Supabase production หรือการใช้งานพร้อมกัน 30–40 คน
- การโหลดรายการแอดมินครั้งแรกยังดึงทั้งภาคเรียน (8 คำขอใน fixture เท่าเดิม) งานนี้ลดการโหลดซ้ำและขั้นตอนเปิดสมุดเป็นหลัก
- หน้าครูยังโหลดข้อมูลสมุดสำหรับคำนวณสถานะเดิม ขนาดข้อมูลครั้งแรกจึงใกล้เดิม
- ยังไม่ได้ทำ end-to-end ครบทุกกรณีของ autosave, bulk approval, ล้างสมุด, นำเข้า/ส่งออก Excel/Word/ZIP และ PDF พิมพ์จริง; ไม่ถือว่า checklist เหล่านี้ผ่านจากผล build เพียงอย่างเดียว
- Build ยังเตือน chunk ใหญ่ แต่ ExcelJS และข้อมูลหลักสูตรถูกเลื่อนไปโหลดเมื่อใช้งาน

ก่อนนำขึ้นระบบ มี migration สองไฟล์ที่สร้างไว้เท่านั้น:

1. `supabase/migrations/0054_count_active_enrollments.sql`
2. `supabase/migrations/0055_performance_indexes.sql`

ให้ตรวจและรันตามลำดับเมื่ออนุมัติการนำขึ้นระบบแล้ว โค้ดมี fallback หาก RPC ยังไม่พร้อม ผลลดคำขอสูงสุดของ RPC จะเกิดหลังลง migration

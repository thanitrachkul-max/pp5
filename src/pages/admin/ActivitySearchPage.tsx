import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, BookOpenCheck, Download, Eye, Loader2, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { AppUser } from '../../types';
import { normalizeActivityAssessments, type ActivityGeneralInfo, type ActivityApprovalStatus } from '../../lib/studentActivities';
import { parseActivityApproval, type StudentActivitySession } from '../../lib/studentActivityRecords';
import { StudentActivityEditor } from '../teacher/StudentActivityEditor';
import { createStudentActivityPdfFile } from '../../utils/studentActivityPdf';
import { savePap5PdfBlob } from '../../utils/pap5PdfPreview';

type Report = {
  id: string; classroom_id: string; approval_status: ActivityApprovalStatus; submitted_at: string | null;
  general_info: ActivityGeneralInfo; students: StudentActivitySession['data']['students'];
  classroom: string; level: string; teachers: string;
};
const statusLabel = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', revision_requested: 'รอแก้ไข' };
const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '-');

export function ActivitySearchPage({ currentUser, yearId, radio, pap5Actions, initialAction, renderLevels, onBackActionChange }: {
  currentUser: AppUser; yearId?: string; radio: ReactNode; pap5Actions: ReactNode;
  initialAction: 'browse' | 'all' | 'download'; renderLevels: (select: (level: string) => void) => ReactNode;
  onBackActionChange?: (action: (() => void) | null) => void;
}) {
  const [records, setRecords] = useState<Report[]>([]);
  const [year, setYear] = useState({ id: '', label: '', active: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [room, setRoom] = useState('');
  const [status, setStatus] = useState('');
  const [all, setAll] = useState(initialAction === 'all');
  const [session, setSession] = useState<StudentActivitySession | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const autoStarted = useRef(false);
  const running = useRef(false);
  useEffect(() => {
    let disposed = false;
    setLoading(true); setError(''); setRecords([]); setSession(null);
    void (async () => {
      try {
        if (!currentUser.schoolId) throw new Error('ไม่พบโรงเรียนของผู้ใช้งาน');
        let query = supabase.from('academic_years').select('id, year_be, is_active').eq('school_id', currentUser.schoolId);
        query = yearId ? query.eq('id', yearId) : query.eq('is_active', true);
        const yr = await query.limit(1).single();
        if (yr.error) throw yr.error;
        const rooms = await supabase.from('classrooms').select('id, name, class_level_code').eq('school_id', currentUser.schoolId).eq('academic_year_id', yr.data.id);
        if (rooms.error) throw rooms.error;
        const rows: Report[] = [];
        for (let offset = 0; ; offset += 500) {
          const result = await supabase.from('student_activity_records')
            .select('id, classroom_id, approval_status, submitted_at, general_info, students')
            .eq('school_id', currentUser.schoolId).eq('academic_year_id', yr.data.id)
            .not('approval_status', 'is', null).order('id').range(offset, offset + 499);
          if (result.error) throw result.error;
          for (const row of result.data ?? []) {
            const classroom = rooms.data?.find(c => c.id === row.classroom_id);
            const info = row.general_info ?? {};
            rows.push({ ...row, students: Array.isArray(row.students) ? row.students : [],
              classroom: classroom?.name ?? info.gradeLevel ?? '-', level: classroom?.class_level_code ?? '',
              teachers: [info.homeroomTeacher1, info.homeroomTeacher2, info.homeroomTeacher3].filter(Boolean).join(', '),
            });
          }
          if ((result.data?.length ?? 0) < 500) break;
        }
        if (!disposed) {
          setYear({ id: yr.data.id, label: String(yr.data.year_be), active: yr.data.is_active });
          setRecords(rows.sort((a,b) => a.classroom.localeCompare(b.classroom, 'th', { numeric: true })));
        }
      } catch (err) { if (!disposed) setError((err as Error).message || 'โหลดกิจกรรมไม่สำเร็จ'); }
      finally { if (!disposed) setLoading(false); }
    })();
    return () => { disposed = true; };
  }, [currentUser.schoolId, yearId]);

  const detail = async (record: Report): Promise<StudentActivitySession> => {
    const { data, error } = await supabase.from('student_activity_records').select('*')
      .eq('id', record.id).eq('school_id', currentUser.schoolId).eq('academic_year_id', year.id).single();
    if (error) throw error;
    if (!data.approval_status) throw new Error('รายการนี้ไม่ได้อยู่ในสถานะส่งการประเมินแล้ว');
    return { id: data.id, schoolId: currentUser.schoolId, classroomId: data.classroom_id, academicYearId: year.id,
      yearBe: Number(year.label), yearIsActive: year.active, readOnly: true, canReview: false,
      approval: parseActivityApproval(data), data: { generalInfo: data.general_info, students: data.students ?? [],
        attendance: data.attendance ?? {}, assessments: normalizeActivityAssessments(data.assessments) } };
  };
  const run = async (targets: Report[], open = false) => {
    if (running.current || loading || !targets.length) return;
    running.current = true; setBusy(true); setError(''); setProgress('กำลังเตรียมข้อมูล…');
    try {
      if (open) { setSession(await detail(targets[0])); setProgress(''); return; }
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (let i = 0; i < targets.length; i++) {
        setProgress(`กำลังสร้าง PDF ${i + 1}/${targets.length} · ${targets[i].classroom}`);
        const doc = await detail(targets[i]);
        const file = await createStudentActivityPdfFile({ id: doc.id, data: doc.data, approvalStatus: doc.approval.status });
        if (targets.length === 1) savePap5PdfBlob(file.blob, file.fileName);
        else zip.file(`${safeName(targets[i].classroom)}-${doc.id}/${safeName(file.fileName)}`, file.blob);
      }
      if (targets.length > 1) {
        setProgress('กำลังรวมไฟล์ ZIP…');
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob); const link = document.createElement('a');
        link.href = url; link.download = `กิจกรรมพัฒนาผู้เรียนทั้งหมด-${year.label}.zip`; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      setProgress(`ดาวน์โหลดสำเร็จ ${targets.length} ห้อง`);
    } catch (err) { setError((err as Error).message || 'ดำเนินการไม่สำเร็จ'); setProgress(''); }
    finally { running.current = false; setBusy(false); }
  };
  useEffect(() => {
    if (!loading && !error && initialAction === 'download' && !autoStarted.current) {
      autoStarted.current = true; void run(records);
    }
  }, [loading, initialAction, records, error]); // The ref prevents duplicate automatic downloads.
  const reset = useCallback(() => { setSession(null); setAll(false); setSearch(''); setLevel(''); setRoom(''); setStatus(''); }, []);
  useEffect(() => {
    onBackActionChange?.(busy ? () => {} : session ? () => setSession(null) : reset);
    return () => onBackActionChange?.(null);
  }, [onBackActionChange, session, reset, busy]);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);
  const keyword = search.trim().toLocaleLowerCase();
  const filtered = records.filter(r => (!level || r.level === level) && (!room || r.classroom === room) && (!status || r.approval_status === status)
    && (!keyword || `${r.classroom} ${r.teachers} ${r.students.map(s => `${s.name} ${s.studentId}`).join(' ')}`.toLocaleLowerCase().includes(keyword)));
  const table = all || Boolean(search || level || room || status);
  if (session) return <StudentActivityEditor session={session} onBack={() => setSession(null)} />;
  return <div className="space-y-5">
    <section className={table ? "rounded-xl border border-slate-200 bg-white p-3 shadow-sm" : "mx-auto max-w-5xl text-center"}>
      {!table && <>
      <img src="/logo1.png" alt="กิจกรรมพัฒนาผู้เรียน" className="mx-auto h-16 w-16 object-contain" />
      <p className="mt-4 text-base text-slate-700">โรงเรียนกาฬสินธุ์ปัญญานุกูล จังหวัดกาฬสินธุ์</p>
      <h1 className="mt-2 text-3xl font-extrabold">ค้นหากิจกรรมพัฒนาผู้เรียน</h1>
      <p className="mt-4 text-xl font-semibold">สวัสดี {currentUser.name}</p>
      <fieldset disabled={busy}>{radio}</fieldset>
      </>}
      <div className={table ? "grid items-center gap-3 md:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]" : ""}>
      <label className={table ? "flex h-[42px] min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm" : "mx-auto flex max-w-4xl items-center gap-3 rounded-xl border border-slate-300 bg-white px-5 py-3 shadow-sm"}>
        <Search className="h-5 w-5 text-slate-400" /><input type="search" aria-label="ค้นหากิจกรรมพัฒนาผู้เรียน" placeholder="ค้นหาด้วย ห้องเรียน ชื่อครูประจำชั้น ชื่อนักเรียน หรือเลขประจำตัว"
          value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-transparent outline-none" />
      </label>
      <div className={table ? "contents" : "mt-5 grid gap-3 sm:grid-cols-3"}>
        <select aria-label="ระดับชั้น" value={level} onChange={e => { setLevel(e.target.value); setRoom(''); }} className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm font-semibold"><option value="">ทุกระดับชั้น</option>{[...new Set(records.map(r=>r.level))].map(v=><option key={v}>{v}</option>)}</select>
        <select aria-label="ห้องเรียน" value={room} onChange={e=>setRoom(e.target.value)} className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm font-semibold"><option value="">ทุกห้องเรียน</option>{records.filter(r=>!level||r.level===level).map(r=><option key={r.id}>{r.classroom}</option>)}</select>
        <select aria-label="สถานะกิจกรรม" value={status} onChange={e=>setStatus(e.target.value)} className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm font-semibold"><option value="">ทุกสถานะ</option>{Object.entries(statusLabel).map(([v,label])=><option value={v} key={v}>{label}</option>)}</select>
      </div>
      </div>
    </section>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    {progress && <p role="status" className="flex items-center justify-center gap-2 rounded-lg bg-blue-50 p-3 text-blue-700">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{progress}</p>}
    <section className={table ? 'space-y-4' : 'mx-auto max-w-5xl space-y-4'}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-extrabold">กิจกรรมพัฒนาผู้เรียนที่ครูส่งแล้ว</h2><span className="text-sm text-slate-500">ปีการศึกษา {year.label || '-'} · {filtered.length} ห้อง</span></div>
      {loading ? <p className="py-12 text-center">กำลังโหลดกิจกรรม…</p> : table ? <>
        <button className="btn btn-secondary" onClick={reset} disabled={busy}><ArrowLeft className="h-4 w-4" /> กลับเลือกระดับชั้น</button>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-950 text-white"><tr>{['ระดับชั้น','ห้องเรียน','ครูประจำชั้น','นักเรียน','สถานะ','เอกสาร'].map(h=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
          <tbody>{filtered.map(r=><tr key={r.id} className="border-t border-slate-100 text-center"><td className="p-3">{r.level}</td><td>{r.classroom}</td><td className="max-w-sm p-3 text-left">{r.teachers || '-'}</td><td>{r.students.length}</td><td>{statusLabel[r.approval_status]}</td><td className="p-3"><div className="flex justify-center gap-2"><button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50" disabled={busy} onClick={()=>void run([r],true)}><Eye className="h-4 w-4" />ดู</button><button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-blue-600 bg-blue-600 px-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50" disabled={busy} onClick={()=>void run([r])}><Download className="h-4 w-4" />PDF</button></div></td></tr>)}
          {!filtered.length && <tr><td colSpan={6} className="p-12 text-center text-slate-400">ไม่พบกิจกรรมที่ส่งแล้วตามเงื่อนไขที่เลือก</td></tr>}</tbody>
        </table></div>
      </> : renderLevels(setLevel)}
      {!table && <fieldset disabled={busy} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {pap5Actions}
        <button className="btn btn-primary !text-sm" disabled={loading} onClick={()=>{ reset(); setAll(true); }}><BookOpenCheck className="h-4 w-4" />กิจกรรมพัฒนาผู้เรียนทั้งหมด</button>
        <button className="btn bg-emerald-600 text-white !text-sm" disabled={loading || !records.length} onClick={()=>void run(records)}><Download className="h-4 w-4" />ดาวน์โหลดกิจกรรมพัฒนาผู้เรียนทั้งหมด</button>
      </fieldset>}
    </section>
  </div>;
}

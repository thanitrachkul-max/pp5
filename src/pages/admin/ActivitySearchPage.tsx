import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, BookOpenCheck, Download, Eye, Loader2, Search, Pencil, Printer, X } from 'lucide-react';
import { FilterDropdown } from '../../components/FilterBar';
import { supabase } from '../../lib/supabase';
import type { AppUser } from '../../types';
import { normalizeActivityAssessments, type ActivityGeneralInfo, type ActivityApprovalStatus } from '../../lib/studentActivities';
import { loadStudentActivitySession, parseActivityApproval, type StudentActivitySession } from '../../lib/studentActivityRecords';
import { ActivitySummaryForm } from '../../components/activities/ActivitySummaryForm';
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
  const [editing, setEditing] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; blob: Blob; fileName: string } | null>(null);
  const pdfFrame = useRef<HTMLIFrameElement>(null);
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);
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
    onBackActionChange?.(busy || editing ? () => {} : pdf ? () => setPdf(null) : session ? () => setSession(null) : reset);
    return () => onBackActionChange?.(null);
  }, [onBackActionChange, session, reset, busy, pdf, editing]);
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
  const openDocument = async (save = false) => {
    if (!session || running.current) return;
    running.current = true; setBusy(true); setError('');
    try {
      const file = await createStudentActivityPdfFile({ id: session.id, data: session.data, approvalStatus: session.approval.status });
      if (save) savePap5PdfBlob(file.blob, file.fileName);
      else setPdf({ ...file, url: URL.createObjectURL(file.blob) });
    } catch (err) { setError((err as Error).message || 'สร้าง PDF ไม่สำเร็จ'); }
    finally { running.current = false; setBusy(false); }
  };
  const edit = async () => {
    if (!session || running.current) return;
    running.current = true; setBusy(true); setError('');
    try {
      const editable = await loadStudentActivitySession(session.classroomId);
      if (editable.readOnly) throw new Error('ไม่มีสิทธิ์แก้ไขข้อมูลห้องเรียนนี้');
      setSession(editable); setEditing(true);
    } catch (err) { setError((err as Error).message); }
    finally { running.current = false; setBusy(false); }
  };
  const finishEdit = async () => {
    setBusy(true); setError('');
    try {
      const record = records.find(r => r.id === session?.id);
      if (record) {
        const refreshed = await detail(record);
        setSession(refreshed);
        const info = refreshed.data.generalInfo;
        setRecords(rows => rows.map(row => row.id === refreshed.id ? { ...row,
          students: refreshed.data.students, general_info: info,
          approval_status: refreshed.approval.status!,
          teachers: [info.homeroomTeacher1, info.homeroomTeacher2, info.homeroomTeacher3].filter(Boolean).join(', '),
        } : row));
      }
      setEditing(false);
    } catch (err) { setEditing(false); setSession(null); setError((err as Error).message); }
    finally { setBusy(false); }
  };
  if (session && editing) return <StudentActivityEditor session={session} onBack={() => void finishEdit()} />;
  if (pdf) return <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4">
    <div className="flex flex-wrap justify-center gap-3">
      <button className="btn btn-grey-3d min-w-[150px] !py-3" onClick={() => pdfFrame.current?.contentWindow?.print()}><Printer className="h-4 w-4" />พิมพ์กิจกรรม</button>
      <button className="btn btn-grey-3d min-w-[150px] !py-3" onClick={() => savePap5PdfBlob(pdf.blob, pdf.fileName)}><Download className="h-4 w-4" />บันทึก PDF</button>
    </div>
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-[#101216] shadow-xl">
      <div className="flex h-12 items-center gap-3 bg-[#14171d] px-4 text-white"><span className="flex-1 truncate text-sm font-semibold">{pdf.fileName}</span><button aria-label="ปิดตัวอ่าน PDF" onClick={() => setPdf(null)}><X className="h-5 w-5" /></button></div>
      <iframe ref={pdfFrame} title="PDF กิจกรรมพัฒนาผู้เรียน" src={pdf.url} className="h-[calc(100vh-13rem)] min-h-[640px] w-full border-0" />
    </section>
  </div>;
  if (session) return <div className="space-y-5">
    <button className="btn btn-secondary" disabled={busy} onClick={() => setSession(null)}><ArrowLeft className="h-4 w-4" />กลับผลการค้นหา</button>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-slate-50 p-5">
        <div><p className="text-sm font-bold text-blue-600">รายละเอียดกิจกรรมพัฒนาผู้เรียน</p><h2 className="mt-1 text-xl font-extrabold">ชั้น {session.data.generalInfo.gradeLevel} ปีการศึกษา {session.yearBe}</h2></div>
        {(currentUser.role === 'admin' || currentUser.role === 'super_admin') && <button className="btn btn-secondary" disabled={busy} onClick={() => void edit()}><Pencil className="h-4 w-4" />แก้ไขข้อมูล</button>}
      </header>
      <div className="p-5"><ActivitySummaryForm data={session.data} readOnly onChange={() => {}} /></div>
      <footer className="flex flex-wrap justify-center gap-3 border-t border-slate-100 bg-slate-50 p-5">
        <button className="btn btn-grey-3d min-w-[150px] !py-3" disabled={busy} onClick={() => void openDocument()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}อ่านกิจกรรม</button>
        <button className="btn btn-grey-3d min-w-[150px] !py-3" disabled={busy} onClick={() => void openDocument(true)}><Download className="h-4 w-4" />บันทึก PDF</button>
      </footer>
    </section>
  </div>;
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
        <Search className="h-5 w-5 text-slate-400" /><input type="search" aria-label="ค้นหากิจกรรมพัฒนาผู้เรียน" placeholder={table ? "ค้นหา" : "ค้นหาด้วย ห้องเรียน ชื่อครูประจำชั้น ชื่อนักเรียน หรือเลขประจำตัว"}
          value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-transparent outline-none" />
      </label>
      <div className={table ? "contents" : "mt-5 grid gap-3 sm:grid-cols-3"}>
        <FilterDropdown ariaLabel="ระดับชั้น" value={level} onChange={value => { setLevel(value); setRoom(''); }} className="min-w-0 !border-slate-200"><option value="">ทุกระดับชั้น</option>{[...new Set(records.map(r=>r.level))].map(v=><option key={v}>{v}</option>)}</FilterDropdown>
        <FilterDropdown ariaLabel="ห้องเรียน" value={room} onChange={setRoom} className="min-w-0 !border-slate-200"><option value="">ทุกห้องเรียน</option>{records.filter(r=>!level||r.level===level).map(r=><option key={r.id}>{r.classroom}</option>)}</FilterDropdown>
        <FilterDropdown ariaLabel="สถานะกิจกรรม" value={status} onChange={setStatus} className="min-w-0 !border-slate-200"><option value="">ทุกสถานะ</option>{Object.entries(statusLabel).map(([v,label])=><option value={v} key={v}>{label}</option>)}</FilterDropdown>
      </div>
      </div>
    </section>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    {progress && <p role="status" className="flex items-center justify-center gap-2 rounded-lg bg-blue-50 p-3 text-blue-700">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{progress}</p>}
    <section className={table ? 'space-y-4' : 'mx-auto max-w-5xl space-y-4'}>
      {!table && <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-extrabold">กิจกรรมพัฒนาผู้เรียนที่ครูส่งแล้ว</h2><span className="text-sm text-slate-500">ปีการศึกษา {year.label || '-'} · {filtered.length} ห้อง</span></div>}
      {loading ? <p className="py-12 text-center">กำลังโหลดกิจกรรม…</p> : table ? <>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-950 text-white"><tr>{['ระดับชั้น','ห้องเรียน','ครูประจำชั้น','นักเรียน','สถานะ','เอกสาร'].map(h=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
          <tbody>{filtered.map(r=><tr key={r.id}
            tabIndex={busy ? -1 : 0}
            aria-disabled={busy}
            className={`border-t border-slate-100 text-center transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:-outline-offset-2 ${busy ? 'cursor-wait' : 'cursor-pointer hover:bg-blue-50 focus-visible:bg-blue-50'}`}
            onClick={() => void run([r], true)}
            onKeyDown={event => {
              if (event.target !== event.currentTarget || busy) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                void run([r], true);
              }
            }}><td className="p-3">{r.level}</td><td>{r.classroom}</td><td className="max-w-sm p-3 text-left">{r.teachers || '-'}</td><td>{r.students.length}</td><td>{statusLabel[r.approval_status]}</td><td className="p-3"><div className="flex justify-center gap-2"><button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50" disabled={busy} onClick={event => { event.stopPropagation(); void run([r], true); }}><Eye className="h-4 w-4" />ดู</button><button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-blue-600 bg-blue-600 px-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50" disabled={busy} onClick={event => { event.stopPropagation(); void run([r]); }}><Download className="h-4 w-4" />PDF</button></div></td></tr>)}
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

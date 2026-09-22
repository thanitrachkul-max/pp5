import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { UserPlus, X, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getErrorMessage } from '../lib/dbErrors';
import { listGradebookDelegations, type GradebookDelegation } from '../lib/gradebookDelegations';
import type { GradebookSession } from '../lib/teacherGradebooks';

type Teacher = { id: string; name: string; classrooms: string[] };
export function GradebookDelegationControl({ session, currentUserId, beforeChange }: { session: GradebookSession; currentUserId: string; beforeChange: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [delegations, setDelegations] = useState<GradebookDelegation[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [search, setSearch] = useState('');
  const [classroom, setClassroom] = useState('');
  const [selected, setSelected] = useState<Teacher | null>(null);
  const [confirm, setConfirm] = useState<'assign' | 'revoke' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const refresh = useCallback(async () => {
    const [rows, permission] = await Promise.all([
      listGradebookDelegations(), supabase.rpc('can_manage_gradebook_delegation', { p_gradebook_id: session.id }),
    ]);
    if (permission.error) throw permission.error;
    const current = rows.filter(row => row.gradebook_id === session.id);
    setDelegations(current);
    setCanManage(permission.data === true);
    return current;
  }, [session.id]);
  useEffect(() => { void refresh().catch(e => setError(getErrorMessage(e, 'โหลดการมอบหมายไม่สำเร็จ'))); }, [refresh]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) { setOpen(false); return; }
      if (event.key !== 'Tab') return;
      const controls = Array.from<HTMLElement>(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)') ?? []);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [open, busy]);
  const show = async () => {
    setOpen(true); setConfirm(null); setSelected(null); setSearch(''); setClassroom(''); setError(''); setNotice(''); setBusy(true);
    try {
      const current = await refresh();
      if (current.length > 0) return;
      const result = await supabase.rpc('gradebook_delegation_teachers', { p_gradebook_id: session.id });
      if (result.error) throw result.error;
      setTeachers(result.data ?? []);
    } catch (e) { setError(getErrorMessage(e, 'โหลดรายชื่อครูไม่สำเร็จ')); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!selected || !confirm || busy) return;
    setBusy(true); setError('');
    try {
      await beforeChange();
      const { error: saveError } = await supabase.rpc('set_gradebook_delegation', {
        p_gradebook_id: session.id, p_teacher_id: selected.id, p_revoke: confirm === 'revoke',
      });
      if (saveError) throw saveError;
      setNotice(confirm === 'revoke' ? 'ยกเลิกการมอบหมายแล้ว' : `มอบหมายให้ ${selected.name} บันทึกผลแล้ว`);
      setConfirm(null); setSelected(null);
      const current = await refresh();
      if (current.length === 0) {
        const result = await supabase.rpc('gradebook_delegation_teachers', { p_gradebook_id: session.id });
        if (result.error) throw result.error;
        setTeachers(result.data ?? []);
      }
    } catch (e) { setError(getErrorMessage(e, 'บันทึกการมอบหมายไม่สำเร็จ')); }
    finally { setBusy(false); }
  };
  const hasDelegation = delegations.length > 0;
  const received = delegations.filter(d => d.teacher_id === currentUserId);
  const assigners = Array.from(new Set(received.map(d => d.assigned_by_name))).join(', ');
  const info = session.data.generalInfo;
  const available = teachers.filter(t => !delegations.some(d => d.teacher_id === t.id));
  const filtered = available.filter(t => t.name.replace(/\s/g, '').includes(search.replace(/\s/g, '')) && (!classroom || t.classrooms.includes(classroom)));
  return <>
    {canManage && <button ref={trigger} type="button" onClick={() => void show()} className={`btn !h-10 !px-3 ${hasDelegation ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100" : "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"}`}><UserPlus className="h-4 w-4" />{hasDelegation ? "มอบหมายให้ครูคนอื่นแล้ว" : "มอบครูคนอื่นบันทึก"}</button>}
    {received.length > 0 && <span className="max-w-sm text-xs font-semibold text-violet-700">มอบหมายโดย: {assigners}</span>}
    {!open && error && <span role="alert" className="text-xs text-red-600">โหลดการมอบหมายไม่สำเร็จ <button type="button" className="underline" onClick={() => void refresh().then(() => setError('')).catch(e => setError(getErrorMessage(e, error)))}>ลองใหม่</button></span>}
    {open && createPortal(<div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="delegation-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
        <div className="flex items-center justify-between gap-3"><h2 id="delegation-title" className="text-lg font-bold">{confirm ? (confirm === 'revoke' ? 'ยืนยันยกเลิกการมอบหมาย' : 'ยืนยันการมอบหมายอีกครั้ง') : 'มอบหมายครูคนอื่นบันทึกผล'}</h2><button type="button" disabled={busy} aria-label="ปิด" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div>
        <div className="my-4 rounded-xl bg-slate-50 p-4 text-sm leading-7"><b>{info.subjectCode} {info.subjectName}</b><br />ชั้น/ห้อง {info.gradeLevel} · ปีการศึกษา {session.year_be} ภาคเรียนที่ {session.semester_number}</div>
        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        {notice && <p role="status" className="mb-3 text-sm text-emerald-700">{notice}</p>}
        {confirm && selected ? <>
          <p className="mb-6 leading-7">{confirm === 'revoke' ? 'ยืนยันยกเลิกสิทธิ์บันทึกผลของ' : 'ยืนยันเพิ่มสิทธิ์บันทึกผลวิชานี้ให้'} <b>{selected.name}</b>{confirm === 'revoke' ? ' โดยข้อมูลที่บันทึกไว้จะยังคงอยู่' : ' ครูผู้สอนเดิมยังสามารถกรอกผลร่วมกันได้'}</p>
          <div className="flex justify-end gap-3"><button type="button" disabled={busy} className="btn btn-secondary" onClick={() => setConfirm(null)}>ย้อนกลับ</button><button type="button" disabled={busy} className="btn btn-primary" onClick={() => void save()}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{confirm === 'revoke' ? 'ยืนยันยกเลิกการมอบหมาย' : 'ยืนยันการมอบหมาย'}</button></div>
        </> : <>
          {delegations.length > 0 && <div className="mb-5 space-y-2"><h3 className="text-sm font-bold">ครูที่ได้รับมอบหมาย</h3>{delegations.map(d => <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg bg-violet-50 p-3 text-sm"><div><b>{d.teacher_name}</b><p className="text-xs text-slate-500">มอบหมายโดย {d.assigned_by_name}</p></div><button disabled={busy} type="button" className="text-red-600 underline" onClick={() => { setSelected({ id: d.teacher_id, name: d.teacher_name, classrooms: [] }); setConfirm('revoke'); }}>ยกเลิกการมอบหมาย</button></div>)}</div>}
          {!hasDelegation && <>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">ค้นหาชื่อครู<input autoComplete="off" value={search} onChange={e => setSearch(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2" placeholder="พิมพ์ชื่อครู" /></label><label className="text-sm font-semibold">ชั้นเรียน / ห้องประจำชั้น<select value={classroom} onChange={e => setClassroom(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2"><option value="">ทุกชั้น/ห้อง</option>{Array.from(new Set<string>(teachers.flatMap(t => t.classrooms))).sort((a,b) => a.localeCompare(b, 'th', { numeric: true })).map(c => <option key={c}>{c}</option>)}</select></label></div>
          <div className="my-4 max-h-52 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2" aria-label="รายชื่อครู">{busy ? <p className="p-3 text-sm">กำลังโหลด...</p> : filtered.length ? filtered.map(t => <button type="button" key={t.id} aria-pressed={selected?.id === t.id} onClick={() => setSelected(t)} className={`w-full rounded-lg p-3 text-left text-sm ${selected?.id === t.id ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-300' : 'hover:bg-slate-50'}`}><b>{t.name}</b><span className="ml-2 text-xs text-slate-500">{t.classrooms.join(', ')}</span></button>) : <p className="p-3 text-sm text-slate-500">ไม่พบครูที่สามารถมอบหมายได้</p>}</div>
          {selected && <p className="mb-4 rounded-lg bg-blue-50 p-3 text-sm">ครูที่เลือก: <b>{selected.name}</b><br />รับมอบหมายบันทึกผล {info.subjectCode} {info.subjectName} ห้อง {info.gradeLevel}</p>}
          </>}
          <div className="flex justify-end gap-3"><button type="button" disabled={busy} className="btn btn-secondary" onClick={() => setOpen(false)}>ปิด</button>{!hasDelegation && <button type="button" disabled={!selected || busy} className="btn btn-primary" onClick={() => setConfirm('assign')}>ยืนยัน</button>}</div>
        </>}
      </div>
    </div>, document.body)}
  </>;
}

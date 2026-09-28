import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { createCoalescedRefresh } from '../../lib/coalescedRefresh';
import type { Classroom } from '../../types';
import type { ActivityApprovalStatus } from '../../lib/studentActivities';

type ActivityRecord = {
  id: string;
  classroom_id: string;
  approval_status: ActivityApprovalStatus | null;
  approval_reason: string | null;
  stats: { completionPercent?: number } | null;
};

/** One compact request for the selected year, shared by all teacher rows. */
export function useAdminActivityRecords(schoolId: string | null, yearId: string) {
  const [state, setState] = useState<{ yearId: string; records: ActivityRecord[]; error: string; loading: boolean }>({ yearId: '', records: [], error: '', loading: true });
  useEffect(() => {
    let disposed = false;
    if (!schoolId || !yearId) return;
    setState({ yearId, records: [], error: '', loading: true });
    const load = async () => {
      try {
        const { data, error } = await supabase.from('student_activity_records')
          .select('id, classroom_id, approval_status, approval_reason, stats')
          .eq('school_id', schoolId).eq('academic_year_id', yearId);
        if (error) throw error;
        if (!disposed) setState({ yearId, records: data ?? [], error: '', loading: false });
      } catch {
        if (!disposed) setState({ yearId, records: [], error: 'โหลดสถานะกิจกรรมไม่สำเร็จ', loading: false });
      }
    };
    void load();
    const refresh = createCoalescedRefresh(load, { debounceMs: 1500 });
    const channel = supabase.channel(`admin-activities-${schoolId}-${yearId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_activity_records', filter: `academic_year_id=eq.${yearId}` }, refresh.schedule)
      .subscribe();
    return () => { disposed = true; refresh.dispose(); void supabase.removeChannel(channel); };
  }, [schoolId, yearId]);
  return state.yearId === yearId ? state : { records: [], error: '', loading: true };
}

export function AdminActivityStatus({ classrooms, records, loading, error, onOpen }: {
  classrooms: Classroom[];
  records: ActivityRecord[];
  loading: boolean;
  error: string;
  onOpen?: (classroomId: string) => void;
}) {
  if (loading) return <span className="text-xs text-slate-400">กำลังโหลด…</span>;
  if (error) return <span className="text-xs text-rose-600">{error}</span>;
  if (!classrooms.length) return <span className="text-slate-300">—</span>;
  return <div className="flex flex-col gap-2">
    {classrooms.map(classroom => {
      const record = records.find(item => item.classroom_id === classroom.id);
      const status = record?.approval_status;
      const label = status === 'approved' ? 'อนุมัติแล้ว' : status === 'pending' ? 'ส่งแล้ว · รออนุมัติ' : status === 'revision_requested' ? 'ส่งกลับแก้ไข' : `ยังไม่ส่ง (${Math.floor(record?.stats?.completionPercent ?? 0)}%)`;
      const color = status === 'approved' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : status === 'pending' ? 'bg-blue-50 text-blue-700 ring-blue-200' : status === 'revision_requested' ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-slate-100 text-slate-500 ring-slate-200';
      return <button key={classroom.id} type="button" disabled={!onOpen} title={record?.approval_reason || 'เปิดบันทึกกิจกรรมเพื่อดูรายละเอียดและพิจารณาอนุมัติ'}
        onClick={event => { event.stopPropagation(); onOpen?.(classroom.id); }}
        className={`rounded-lg px-3 py-2 text-xs font-bold ring-1 ${color}`}>
        <span className="block">{classroom.name}</span><span>{label}</span>
      </button>;
    })}
  </div>;
}

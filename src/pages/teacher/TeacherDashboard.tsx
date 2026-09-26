import { WorkspaceTabs } from '../../components/WorkspaceTabs';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createCoalescedRefresh } from '../../lib/coalescedRefresh';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileText,
  LayoutDashboard,
  Loader2,
  LogOut,
  RefreshCw,
  Send,
  Users,
  X,
} from 'lucide-react';
import { ModalPortal } from '../../components/ModalPortal';
import { isAdmin } from '../../lib/auth';
import {
  gradebookStatusClassName,
  gradebookStatusLabel,
  resolveGradebookStatus,
} from '../../lib/gradebookStatusDisplay';
import { supabase } from '../../lib/supabase';
import { isWithinEntryWindow, normalizeThaiOrIsoDate } from '../../lib/thaiDate';
import {
  acknowledgeGradebookRevision,
  ensureGradebook,
  fetchTeacherAssignments,
  resubmitGradebookRevision,
  submitGradebookPeriod,
  type TeacherAssignmentView,
} from '../../lib/teacherGradebooks';
import type { AppUser } from '../../types';

interface TeacherDashboardProps {
  currentUser: AppUser;
  viewedTeacher?: { id: string; name: string } | null;
  initialPeriodKey?: string | null;
  onOpenGradebook: (
    assignment: TeacherAssignmentView,
    gradebookId: string,
    options?: { readOnly?: boolean; returnPeriodKey?: string | null },
  ) => void;
  onLogout: () => void;
  onSettings: () => void;
}

interface TeacherPeriod {
  key: string;
  academicYearId: string;
  yearBe: number;
  semesterNumber: number;
  items: TeacherAssignmentView[];
  entryStartDate: string | null;
  entryEndDate: string | null;
  isOpen: boolean;
  submitState: 'not_ready' | 'pending' | 'revision_requested' | 'approved';
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function localDate(date: string, endOfDay = false): Date {
  const [year, month, day] = (normalizeThaiOrIsoDate(date) ?? date).split('-').map(Number);
  return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
}

function countdownParts(window: { start: string | null; end: string | null }, now: Date) {
  const targetStart = window.start ? localDate(window.start) : null;
  const targetEnd = window.end ? localDate(window.end, true) : null;
  const nowMs = now.getTime();
  const target =
    targetStart && nowMs < targetStart.getTime()
      ? { label: 'เริ่มใน', date: targetStart }
      : targetEnd
        ? { label: 'เหลือ', date: targetEnd }
        : null;

  if (!target) return { type: 'text' as const, label: 'กำหนดเวลา', value: 'ยังไม่กำหนด' };

  const diff = target.date.getTime() - nowMs;
  if (diff <= 0) return { type: 'text' as const, label: 'สถานะ', value: 'ครบกำหนดแล้ว' };

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    type: 'countdown' as const,
    label: target.label,
    days,
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  };
}

function teacherGreetingName(user: AppUser): string {
  const name = user.name.trim();
  if (user.role === 'teacher') return name.startsWith('ครู') ? name : `ครู${name}`;
  const title = user.title?.trim();
  if (!title || name.startsWith(title)) return name;
  return `${title} ${name}`;
}

function formatThaiDate(date: string | null | undefined): string {
  if (!date) return '';
  const parsed = localDate(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function assignmentEntryWindow(items: TeacherAssignmentView[]) {
  const starts = items.map((item) => item.entry_start_date).filter((date): date is string => Boolean(date)).sort();
  const ends = items.map((item) => item.entry_end_date).filter((date): date is string => Boolean(date)).sort();
  return {
    start: starts[0] ?? null,
    end: ends[ends.length - 1] ?? null,
  };
}

function entryWindowLabel(start: string | null, end: string | null): string {
  if (!start && !end) return 'ยังไม่กำหนด';
  return `${formatThaiDate(start) || 'ไม่กำหนด'} - ${formatThaiDate(end) || 'ไม่กำหนด'}`;
}

function hoursLabel(assignment: TeacherAssignmentView): string {
  const week = assignment.hours_per_week ?? '-';
  const semester = assignment.hours_per_semester ?? '-';
  return `${week}/${semester}`;
}

function periodKey(assignment: TeacherAssignmentView): string {
  return `${assignment.academic_year_id}:${assignment.semester_number}`;
}

function hasCompletedEntry(item: TeacherAssignmentView): boolean {
  return Boolean(item.gradebook_id) && item.completion_percent >= 100;
}

function hasSubmittedGradebook(item: TeacherAssignmentView): boolean {
  return item.gradebook_status === 'completed';
}

function periodSubmitState(items: TeacherAssignmentView[]): TeacherPeriod['submitState'] {
  if (items.length === 0) return 'not_ready';
  if (items.some((item) => item.approval_status === 'revision_requested')) return 'revision_requested';
  if (items.every((item) => item.gradebook_status === 'completed' && item.approval_status === 'approved')) return 'approved';
  if (items.every(hasSubmittedGradebook)) return 'pending';
  return 'not_ready';
}

function periodSubmissionBadge(period: TeacherPeriod) {
  const total = period.items.length;
  const submitted = period.items.filter(hasSubmittedGradebook).length;
  const revision = period.items.filter((item) => item.approval_status === 'revision_requested').length;

  if (total > 0 && period.submitState === 'approved') {
    return {
      label: 'อนุมัติแล้ว',
      className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
      icon: 'approved' as const,
      revision: null as TeacherAssignmentView | null,
    };
  }

  if (revision > 0) {
    return {
      label: `ไม่อนุมัติ ${revision} วิชา`,
      className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
      icon: 'revision' as const,
      revision: period.items.find((item) => item.approval_status === 'revision_requested') ?? null,
    };
  }

  if (total > 0 && submitted === total) {
    return {
      label: 'ส่งครบแล้วรออนุมัติ',
      className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
      icon: 'pending' as const,
      revision: null as TeacherAssignmentView | null,
    };
  }

  return {
    label: `ส่งแล้ว ${submitted}/${total}`,
    className: submitted > 0
      ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
      : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
    icon: 'count' as const,
    revision: null as TeacherAssignmentView | null,
  };
}

function isPeriodOpen(items: TeacherAssignmentView[]): boolean {
  return items.some(
    (item) =>
      item.year_is_active &&
      item.semester_grade_entry_enabled &&
      isWithinEntryWindow(item.entry_start_date, item.entry_end_date),
  );
}

function buildPeriods(assignments: TeacherAssignmentView[]): TeacherPeriod[] {
  const grouped = assignments.reduce<Map<string, TeacherAssignmentView[]>>((map, assignment) => {
    const key = periodKey(assignment);
    const items = map.get(key) ?? [];
    items.push(assignment);
    map.set(key, items);
    return map;
  }, new Map());

  return Array.from(grouped.entries())
    .map(([key, items]) => {
      const first = items[0];
      const entryWindow = assignmentEntryWindow(items);
      return {
        key,
        academicYearId: first.academic_year_id,
        yearBe: first.year_be,
        semesterNumber: first.semester_number,
        items,
        entryStartDate: entryWindow.start,
        entryEndDate: entryWindow.end,
        isOpen: isPeriodOpen(items),
        submitState: periodSubmitState(items),
      };
    })
    .sort((a, b) => b.yearBe - a.yearBe || b.semesterNumber - a.semesterNumber);
}

function periodStatusClassName(isOpen: boolean): string {
  return isOpen
    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
    : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200';
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  currentUser,
  viewedTeacher,
  initialPeriodKey = null,
  onOpenGradebook,
  onLogout,
  onSettings,
}) => {
  const [assignments, setAssignments] = useState<TeacherAssignmentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [submittingAssignmentId, setSubmittingAssignmentId] = useState<string | null>(null);
  const [revisionModalAssignment, setRevisionModalAssignment] = useState<TeacherAssignmentView | null>(null);
  const [periodChooser, setPeriodChooser] = useState<TeacherPeriod | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [resubmittingId, setResubmittingId] = useState<string | null>(null);
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(() => initialPeriodKey);
  const [selectedPeriodKeys, setSelectedPeriodKeys] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => new Date());
  const teacherId = isAdmin(currentUser) && viewedTeacher ? viewedTeacher.id : currentUser.id;
  const displayUserName = viewedTeacher?.name ?? teacherGreetingName(currentUser);
  const currentDateTime = useMemo(() => {
    const dateText = now.toLocaleDateString('th-TH', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const timeText = now.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    return { dateText, timeText };
  }, [now]);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const data = await fetchTeacherAssignments(teacherId);
      setAssignments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดรายวิชาไม่สำเร็จ');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresher = createCoalescedRefresh(() => load(false), { debounceMs: 2000 });

    const channel = supabase
      .channel(`teacher-gradebooks-${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gradebooks' },
        refresher.schedule,
      )
      .subscribe();

    return () => {
      refresher.dispose();
      void supabase.removeChannel(channel);
    };
  }, [currentUser.id, load]);

  useEffect(() => {
    setSelectedPeriodKey(initialPeriodKey);
  }, [initialPeriodKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const periods = useMemo(() => buildPeriods(assignments), [assignments]);
  const selectedPeriod = useMemo(
    () => periods.find((period) => period.key === selectedPeriodKey) ?? null,
    [periods, selectedPeriodKey],
  );
  const activeYearItems = useMemo(() => {
    const activeYear = assignments.find((assignment) => assignment.year_is_active)?.year_be;
    return activeYear != null ? assignments.filter((assignment) => assignment.year_be === activeYear) : [];
  }, [assignments]);
  const activeEntryWindow = useMemo(() => assignmentEntryWindow(activeYearItems), [activeYearItems]);
  const activeCountdown = useMemo(() => countdownParts(activeEntryWindow, now), [activeEntryWindow, now]);
  const activeEntryWindowLabel = entryWindowLabel(activeEntryWindow.start, activeEntryWindow.end);
  const selectedSubjectCodes = selectedPeriod
    ? uniqueStrings(selectedPeriod.items.map((item) => item.subject_code)).length
    : 0;
  const allPeriodsChecked =
    periods.length > 0 && periods.every((period) => selectedPeriodKeys.has(period.key));

  useEffect(() => {
    if (!loading && selectedPeriodKey && !periods.some((period) => period.key === selectedPeriodKey)) {
      setSelectedPeriodKey(null);
    }
  }, [loading, periods, selectedPeriodKey]);

  const togglePeriodSelection = (key: string, checked: boolean) => {
    setSelectedPeriodKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleAllPeriods = (checked: boolean) => {
    setSelectedPeriodKeys(checked ? new Set(periods.map((period) => period.key)) : new Set());
  };

  const handleOpen = async (assignment: TeacherAssignmentView) => {
    setOpeningId(assignment.id);
    setError('');
    setMessage('');
    try {
      if (
        !isAdmin(currentUser) && !assignment.gradebook_id &&
        (!assignment.year_is_active ||
          !assignment.semester_grade_entry_enabled ||
          !isWithinEntryWindow(assignment.entry_start_date, assignment.entry_end_date))
      ) {
        throw new Error('ระบบปิดการกรอกคะแนนแล้ว และยังไม่มีสมุด ปพ.5 สำหรับรายวิชานี้ให้เปิดดู');
      }
      const gradebookId = await ensureGradebook(assignment, viewedTeacher ? { ...currentUser, id: teacherId, name: viewedTeacher.name } : currentUser, { adminCreate: isAdmin(currentUser) });
      onOpenGradebook({ ...assignment, gradebook_id: gradebookId }, gradebookId, {
        ...(isAdmin(currentUser) ? { readOnly: false } : {}),
        returnPeriodKey: selectedPeriodKey ?? periodKey(assignment),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เปิดสมุดบันทึกไม่สำเร็จ');
    } finally {
      setOpeningId(null);
    }
  };

  const handleSubmitAssignment = async (assignment: TeacherAssignmentView) => {
    if (!assignment.gradebook_id || assignment.completion_percent < 100) {
      setMessage('');
      setError('กรุณากรอก ปพ.5 รายวิชานี้ให้ครบ 100% ก่อนส่ง');
      return;
    }

    setSubmittingAssignmentId(assignment.id);
    setError('');
    setMessage('');
    try {
      await submitGradebookPeriod([assignment.gradebook_id], currentUser.id);
      setAssignments((prev) =>
        prev.map((item) =>
          item.id === assignment.id
            ? {
                ...item,
                gradebook_status: 'completed',
                approval_status: 'pending',
                approval_reason: null,
                approval_reason_seen_at: null,
              }
            : item,
        ),
      );
      setMessage(`ส่ง ปพ.5 ${assignment.subject_name} แล้ว`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ส่ง ปพ.5 ไม่สำเร็จ');
    } finally {
      setSubmittingAssignmentId(null);
    }
  };

  const markAssignmentApproval = (
    assignmentId: string,
    changes: Partial<Pick<TeacherAssignmentView, 'approval_status' | 'approval_reason' | 'approval_reason_seen_at' | 'gradebook_status'>>,
  ) => {
    setAssignments((prev) =>
      prev.map((assignment) =>
        assignment.id === assignmentId ? { ...assignment, ...changes } : assignment,
      ),
    );
  };

  const handleShowRevisionReason = async (assignment: TeacherAssignmentView) => {
    setRevisionModalAssignment(assignment);
    if (!assignment.gradebook_id || assignment.approval_reason_seen_at) return;

    setAcknowledgingId(assignment.id);
    try {
      await acknowledgeGradebookRevision(assignment.gradebook_id, currentUser.id);
      const seenAt = new Date().toISOString();
      markAssignmentApproval(assignment.id, { approval_reason_seen_at: seenAt });
      setRevisionModalAssignment((current) =>
        current?.id === assignment.id
          ? { ...current, approval_reason_seen_at: seenAt }
          : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกการรับทราบไม่สำเร็จ');
    } finally {
      setAcknowledgingId(null);
    }
  };

  const handleAcknowledgeRevision = async () => {
    const assignment = revisionModalAssignment;
    if (!assignment?.gradebook_id) return;

    setAcknowledgingId(assignment.id);
    setError('');
    setMessage('');
    try {
      await acknowledgeGradebookRevision(assignment.gradebook_id, currentUser.id);
      const seenAt = new Date().toISOString();
      markAssignmentApproval(assignment.id, { approval_reason_seen_at: seenAt });
      setRevisionModalAssignment(null);
      setMessage('รับทราบข้อแก้ไขแล้ว เมื่อแก้ไขข้อมูลเสร็จให้กดส่ง ปพ.5 ที่แก้ไข');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกการรับทราบไม่สำเร็จ');
    } finally {
      setAcknowledgingId(null);
    }
  };

  const handleResubmitRevision = async (assignment: TeacherAssignmentView) => {
    if (!assignment.gradebook_id) return;

    setResubmittingId(assignment.id);
    setError('');
    setMessage('');
    try {
      await resubmitGradebookRevision(assignment.gradebook_id, currentUser.id);
      markAssignmentApproval(assignment.id, {
        gradebook_status: 'completed',
        approval_status: 'pending',
        approval_reason: null,
        approval_reason_seen_at: null,
      });
      setMessage('ส่ง ปพ.5 ที่แก้ไขแล้ว');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ส่ง ปพ.5 ที่แก้ไขไม่สำเร็จ');
    } finally {
      setResubmittingId(null);
    }
  };

  const renderAssignmentStatusControl = (assignment: TeacherAssignmentView) => {
    if (assignment.approval_status === 'approved') {
      return (
        <span className="inline-flex min-w-[108px] items-center justify-center rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
          อนุมัติแล้ว
        </span>
      );
    }

    if (assignment.approval_status === 'pending' && assignment.gradebook_status === 'completed') {
      return (
        <span className="inline-flex min-w-[108px] items-center justify-center rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 ring-1 ring-blue-200">
          รออนุมัติ
        </span>
      );
    }

    if (assignment.approval_status === 'revision_requested') {
      return (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void handleShowRevisionReason(assignment);
            }}
            className="inline-flex min-w-[108px] items-center justify-center rounded-lg bg-rose-50 px-2 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
          >
            ไม่อนุมัติ
            <Eye className="ml-1.5 h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void handleResubmitRevision(assignment);
            }}
            disabled={resubmittingId === assignment.id}
            className="inline-flex min-w-[132px] items-center justify-center rounded-lg bg-blue-600 px-2 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resubmittingId === assignment.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
            ส่ง ปพ.5 ที่แก้ไข
          </button>
        </div>
      );
    }

    if (hasCompletedEntry(assignment) && !hasSubmittedGradebook(assignment)) {
      return (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleSubmitAssignment(assignment);
          }}
          disabled={submittingAssignmentId === assignment.id}
          className="inline-flex min-w-[112px] items-center justify-center rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submittingAssignmentId === assignment.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
          ส่ง ปพ.5
        </button>
      );
    }

    const displayStatus = resolveGradebookStatus(
      assignment.gradebook_status,
      assignment.completion_percent,
    );

    return (
      <button
        type="button"
        disabled={openingId === assignment.id}
        onClick={(event) => {
          event.stopPropagation();
          void handleOpen(assignment);
        }}
        className={`inline-flex min-w-[108px] items-center justify-center rounded-lg px-2.5 py-1.5 text-xs font-bold transition disabled:opacity-60 ${gradebookStatusClassName(displayStatus)}`}
      >
        {openingId === assignment.id
          ? 'กำลังเปิด...'
          : gradebookStatusLabel(displayStatus, assignment.completion_percent)}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] font-sans">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
        <div className="grid gap-3 px-4 py-3.5 sm:px-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:px-8">
          <div className="flex items-center">
            <img src="/logo3.png" alt="KSP GradeBook" className="mr-3 h-11 w-11 object-contain" />
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900">KSP GradeBook</h1>
              <p className="text-[11px] font-medium text-slate-500">ระบบบันทึกผลการพัฒนาคุณภาพผู้เรียน (ปพ.5)</p>
            </div>
          </div>
          {isAdmin(currentUser) ? (
            <div className="justify-self-start lg:justify-self-center"><WorkspaceTabs active="teacher" onAdmin={onSettings} onTeacher={() => {}} /></div>
          ) : (
            <div className="hidden lg:block" />
          )}
          <div className="flex items-center justify-start gap-2 lg:justify-end">
            <div className="hidden items-center gap-1.5 text-xs font-semibold text-slate-600 md:flex">
              <span>{currentDateTime.dateText}</span>
              <span className="font-mono text-blue-500">{currentDateTime.timeText}</span>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-full p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
              title="รีเฟรช"
            >
              <RefreshCw className="h-[18px] w-[18px]" />
            </button>
            <div className="flex items-center rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 shadow-sm">
              <div className="mr-2 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-xs font-bold text-white">
                {currentUser.name.charAt(0)}
              </div>
              <span className="mr-3 hidden text-sm font-semibold text-slate-700 sm:inline">{displayUserName}</span>
              <button type="button" onClick={onLogout} className="text-slate-400 transition hover:text-red-600" title="ออกจากระบบ">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 animate-fade-up">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                {selectedPeriod ? 'รายวิชาที่ได้รับมอบหมาย' : 'ปีการศึกษาและภาคเรียน'}
              </p>
              <h2 className="mt-1.5 text-[28px] font-extrabold tracking-tight text-slate-900">
                {selectedPeriod
                  ? `ปีการศึกษา ${selectedPeriod.yearBe} ภาคเรียนที่ ${selectedPeriod.semesterNumber}`
                  : `สวัสดี, ${displayUserName}`}
              </h2>
              <p className="mt-1.5 text-sm text-slate-500">
                {selectedPeriod
                  ? selectedPeriod.isOpen
                    ? `${selectedSubjectCodes} วิชา · เลือกรายวิชาเพื่อเปิดสมุดบันทึกผลการเรียน ปพ.5`
                    : `${selectedSubjectCodes} วิชา · ระบบปิดการแก้ไขแล้ว เปิดดูคะแนนและส่งออกไฟล์ได้`
                  : 'เลือกปีการศึกษาและภาคเรียนก่อนเข้าสู่รายวิชาที่ได้รับมอบหมาย'}
              </p>
            </div>
            {activeYearItems.length > 0 && !selectedPeriod && (
              <div className="text-right text-sm font-semibold text-slate-900 lg:mt-[1.375rem] lg:shrink-0">
                <p>กำหนดส่งข้อมูล {activeEntryWindowLabel}</p>
                <p className="mt-1 font-mono tabular-nums">
                  {activeCountdown.type === 'countdown' ? (
                    <>
                      {activeCountdown.days} วัน {activeCountdown.hours} ชม. {activeCountdown.minutes} นาที{' '}
                      <span className="text-red-600">{activeCountdown.seconds}</span> วินาที
                    </>
                  ) : (
                    <>
                      {activeCountdown.label}: {activeCountdown.value}
                    </>
                  )}
                </p>
              </div>
            )}
            {selectedPeriod && (
              <button
                type="button"
                onClick={() => setSelectedPeriodKey(null)}
                className="inline-flex w-fit items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                กลับตารางปี/ภาคเรียน
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-3.5 text-sm font-medium text-red-600">{error}</div>
        )}
        {message && (
          <div className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50 p-3.5 text-sm font-medium text-emerald-700">{message}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" /> กำลังโหลดรายวิชา...
          </div>
        ) : assignments.length === 0 ? (
          <div className="ui-card py-24 text-center text-slate-400">
            <BookOpen className="mx-auto mb-3 h-12 w-12 opacity-30" />
            <p className="font-semibold text-slate-600">ยังไม่มีวิชาที่มอบหมาย</p>
            <p className="mt-1 text-sm">ติดต่อฝ่ายวิชาการเพื่อกำหนดรายการมอบหมาย ปพ.5</p>
          </div>
        ) : selectedPeriod ? (
          <div className="ui-card overflow-hidden animate-fade-up">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1060px]  text-sm">

                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="px-4 py-3 text-center font-semibold">ลำดับ</th>
                    <th className="px-4 py-3 text-left font-semibold">รหัสวิชา</th>
                    <th className="px-4 py-3 text-center font-semibold">ภาคเรียนที่</th>
                    <th className="px-4 py-3 text-center font-semibold">ชื่อวิชา</th>
                    <th className="px-4 py-3 text-left font-semibold">กลุ่มสาระ</th>
                    <th className="px-4 py-3 text-center font-semibold">ระดับชั้น</th>
                    <th className="px-4 py-3 text-center font-semibold">ห้องเรียน</th>
                    <th className="px-4 py-3 text-center font-semibold">ชม.เรียน/สัปดาห์/ภาค</th>
                    <th className="px-4 py-3 text-center font-semibold">การบันทึกผล</th>
                    <th className="px-4 py-3 text-center font-semibold">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {selectedPeriod.items.map((assignment, index) => {
                    return (
                      <tr
                        key={assignment.id}
                        onClick={() => void handleOpen(assignment)}
                        className="cursor-pointer transition-colors hover:bg-slate-50/70"
                      >
                        <td className="px-4 py-3 text-center font-semibold text-slate-500">{index + 1}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-800">{assignment.subject_code}</td>
                        <td className="px-4 py-3 text-center text-slate-600">ภาค {assignment.semester_number}</td>
                        <td className="px-4 py-3 text-center font-semibold text-slate-900">{assignment.subject_name}</td>
                        <td className="px-4 py-3 text-slate-600">{assignment.learning_area}</td>
                        <td className="px-4 py-3 text-center text-slate-600">{assignment.class_level_code}</td>
                        <td className="px-4 py-3 text-center font-semibold text-slate-700">{assignment.classroom_name}</td>
                        <td className="px-4 py-3 text-center font-mono font-semibold text-slate-700">{hoursLabel(assignment)}</td>
                        <td className="px-3 py-3 text-center"><span className={`inline-flex whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold ${assignment.recording_mode === 'received' ? 'bg-violet-100 text-violet-700' : assignment.recording_mode === 'delegated' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                          {assignment.recording_mode === 'received' ? 'ได้รับมอบหมาย' : assignment.recording_mode === 'delegated' ? 'มอบหมาย' : 'บันทึกเอง'}
                        </span></td>
                        <td className="px-2 py-3 text-center">
                          <div className="flex justify-center">
                            {renderAssignmentStatusControl(assignment)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="ui-card overflow-hidden animate-fade-up">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="w-14 px-4 py-3 text-center font-semibold">
                      <input
                        type="checkbox"
                        checked={allPeriodsChecked}
                        onChange={(event) => toggleAllPeriods(event.target.checked)}
                        aria-label="เลือกปีการศึกษาและภาคเรียนทั้งหมด"
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">ปีการศึกษา</th>
                    <th className="px-4 py-3 text-center font-semibold">ภาคเรียนที่</th>
                    <th className="px-4 py-3 text-center font-semibold">จำนวนวิชา</th>
                    <th className="px-4 py-3 text-center font-semibold">กำหนดเวลา</th>
                    <th className="px-4 py-3 text-center font-semibold">สถานะ</th>
                    <th className="px-4 py-3 text-center font-semibold">ส่ง ปพ.5</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {periods.map((period) => {
                    const submission = periodSubmissionBadge(period);
                    return (
                    <tr
                      key={period.key}
                      onClick={() => setPeriodChooser(period)}
                      className="cursor-pointer transition-colors hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedPeriodKeys.has(period.key)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => togglePeriodSelection(period.key, event.target.checked)}
                          aria-label={`เลือกปีการศึกษา ${period.yearBe} ภาคเรียนที่ ${period.semesterNumber}`}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-4 font-extrabold text-slate-900">ปีการศึกษา {period.yearBe}</td>
                      <td className="px-4 py-4 text-center font-semibold text-slate-700">{period.semesterNumber}</td>
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-800">
                          <FileText className="mr-1.5 h-3.5 w-3.5" />
                          {period.items.length} วิชา
                          <ChevronRight className="ml-1 h-3.5 w-3.5" />
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center font-medium text-slate-600">
                        {entryWindowLabel(period.entryStartDate, period.entryEndDate)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`inline-flex min-w-[148px] items-center justify-center rounded-lg px-2.5 py-1.5 text-xs font-bold ${periodStatusClassName(period.isOpen)}`}
                        >
                          {period.isOpen ? 'เปิดให้กรอกคะแนน' : 'ปิดการกรอกคะแนนแล้ว'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (submission.revision) {
                              void handleShowRevisionReason(submission.revision);
                              return;
                            }
                            setPeriodChooser(period);
                          }}
                          className={`inline-flex min-w-[154px] items-center justify-center rounded-lg px-3 py-2 text-xs font-extrabold transition hover:brightness-95 ${submission.className}`}
                        >
                          {submission.icon === 'approved' ? (
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                          ) : submission.icon === 'pending' ? (
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                          ) : submission.icon === 'revision' ? (
                            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                          ) : (
                            <Send className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          {submission.label}
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <footer className="pb-10 pt-2 text-center">
        <p className="text-sm font-semibold text-slate-500">KSP GradeBook V 1.0</p>
        <p className="mt-0.5 text-xs text-slate-400">โรงเรียนกาฬสินธุ์ปัญญานุกูล จังหวัดกาฬสินธุ์</p>
      </footer>

      {periodChooser && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[85] grid min-h-dvh place-items-center bg-slate-900/55 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="teacher-workspace-title"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setPeriodChooser(null);
            }}
          >
            <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5 sm:px-8">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">
                    เลือกประเภทการบันทึกข้อมูล
                  </p>
                  <h3 id="teacher-workspace-title" className="mt-1 text-xl font-extrabold text-slate-900">
                    ปีการศึกษา {periodChooser.yearBe} ภาคเรียนที่ {periodChooser.semesterNumber}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPeriodChooser(null)}
                  className="grid h-10 w-10 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="ปิดหน้าต่างเลือกประเภทการบันทึก"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPeriodKey(periodChooser.key);
                    setPeriodChooser(null);
                  }}
                  className="group flex min-h-52 flex-col items-start rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200">
                    <BookOpen className="h-6 w-6" />
                  </span>
                  <span className="mt-6 text-lg font-extrabold text-slate-900">บันทึกข้อมูล ปพ.5</span>
                  <span className="mt-2 text-sm leading-6 text-slate-500">
                    เปิดรายวิชาที่ได้รับมอบหมายเพื่อบันทึกเวลาเรียน คะแนน และผลการประเมิน
                  </span>
                  <span className="mt-auto pt-5 text-sm font-extrabold text-blue-700 transition group-hover:translate-x-1">
                    เปิด {periodChooser.items.length} รายวิชา <ChevronRight className="inline h-4 w-4" />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMessage('เมนูบันทึกข้อมูลกิจกรรมพัฒนาผู้เรียนกำลังอยู่ระหว่างพัฒนา');
                    setPeriodChooser(null);
                  }}
                  className="group flex min-h-52 flex-col items-start rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-emerald-100"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-200">
                    <Users className="h-6 w-6" />
                  </span>
                  <span className="mt-6 text-lg font-extrabold text-slate-900">บันทึกข้อมูลกิจกรรมพัฒนาผู้เรียน</span>
                  <span className="mt-2 text-sm leading-6 text-slate-500">
                    พื้นที่สำหรับบันทึกกิจกรรมพัฒนาผู้เรียน จะเปิดใช้งานในขั้นตอนถัดไป
                  </span>
                  <span className="mt-auto pt-5 text-sm font-extrabold text-emerald-700">เร็ว ๆ นี้</span>
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {revisionModalAssignment && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4">
              <h3 className="text-lg font-extrabold text-slate-900">เหตุผลที่ให้แก้ไข ปพ.5</h3>
              <p className="mt-1 text-sm text-slate-500">
                {revisionModalAssignment.subject_code} {revisionModalAssignment.subject_name}
              </p>
            </div>
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800">
              {revisionModalAssignment.approval_reason || 'ไม่มีรายละเอียดเพิ่มเติม'}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRevisionModalAssignment(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                ปิด
              </button>
              {!revisionModalAssignment.approval_reason_seen_at && (
                <button
                  type="button"
                  onClick={() => void handleAcknowledgeRevision()}
                  disabled={acknowledgingId === revisionModalAssignment.id}
                  className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {acknowledgingId === revisionModalAssignment.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  รับทราบ
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  CheckCircle2,
  Edit3,
  Eye,
  FileUp,
  FileText,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { AssignmentSummaryCards } from '../../components/AssignmentSummaryCards';
import { SearchableTeacherSelect } from '../../components/SearchableTeacherSelect';
import { FilterBar, FilterClearButton, FilterSearch, FilterSelect } from '../../components/FilterBar';
import { isSchemaCacheErrorFor } from '../../lib/dbErrors';
import {
  assignmentGroupKey,
  expandSharedAssignmentRows,
  sharedRecordForAssignment,
  uniqueTeacherIds,
} from '../../lib/sharedAssignments';
import {
  gradebookStatusLabel,
  resolveGradebookStatus,
} from '../../lib/gradebookStatusDisplay';
import { supabase } from '../../lib/supabase';
import {
  ensureGradebook,
  fetchTeacherAssignments,
  type TeacherAssignmentView,
} from '../../lib/teacherGradebooks';
import {
  parseAssignmentExcel,
  parseAssignmentWord,
  resolveAssignmentRows,
  validateReviewRow,
  type AssignmentReviewRow,
} from '../../lib/assignmentImport';
import { SUBJECTS_CATALOG } from '../../data/subjectsCatalog';
import type {
  AcademicYear,
  AppUser,
  AssignmentRow,
  AssignmentStatus,
  Classroom,
  Profile,
  Semester,
  Subject,
  GradebookApprovalStatus,
} from '../../types';

interface AssignmentsPageProps {
  currentUser: AppUser;
  initialYearId?: string;
  readOnly?: boolean;
  onOpenGradebook?: (
    assignment: TeacherAssignmentView,
    gradebookId: string,
    options?: { readOnly?: boolean; returnPeriodKey?: string | null },
  ) => void | Promise<void>;
  initialClassLevelCode?: string;
  initialSemesterNumber?: number;
  drilldownLabel?: string;
  onDrilldownBack?: () => void;
}

interface AddForm {
  teacher_id: string;
  co_teacher_ids: string[];
  subject_id: string;
  classroom_id: string;
  hours_per_week: string;
  hours_per_semester: string;
  status: AssignmentStatus;
  approval_status: GradebookApprovalStatus | '';
  approval_reason: string;
}

type GradebookStatus = 'not_started' | 'in_progress' | 'completed';
const ENTRY_WINDOW_MIGRATION_HINT =
  'ฐานข้อมูลยังไม่มีคอลัมน์กำหนดช่วงเวลา กรุณารัน migration `supabase/migrations/0018_assignment_entry_window.sql` ใน Supabase SQL Editor แล้วลองใหม่';
const APPROVAL_MIGRATION_HINT =
  'ฐานข้อมูลยังไม่มีคอลัมน์การอนุมัติ ปพ.5 กรุณารัน migration `supabase/migrations/0030_gradebook_approval_workflow.sql` ใน Supabase SQL Editor';
const APPROVAL_POLICY_MIGRATION_HINT =
  'ฐานข้อมูลยังไม่อนุญาตให้แอดมินบันทึกผลอนุมัติ ปพ.5 กรุณารัน migration `supabase/migrations/0033_gradebook_approval_admin_realtime.sql` ใน Supabase SQL Editor';
const GRADEBOOK_RELATION_BASE = 'gradebooks(id, status, stats)';
const GRADEBOOK_RELATION_WITH_APPROVAL = 'gradebooks(id, status, stats, approval_status, approval_reason, approval_reason_seen_at)';

interface AssignmentGradebook {
  id: string;
  assignment_group_id?: string | null;
  status: GradebookStatus;
  stats: Record<string, unknown> | null;
  approval_status?: GradebookApprovalStatus | null;
  approval_reason?: string | null;
  approval_reason_seen_at?: string | null;
}

interface AssignmentWithProgress extends AssignmentRow {
  gradebooks?: AssignmentGradebook[] | AssignmentGradebook | null;
  gradebook_status: GradebookStatus | null;
  completion_percent: number;
  approval_status: GradebookApprovalStatus | null;
  approval_reason: string | null;
  approval_reason_seen_at: string | null;
}

interface TeacherAssignmentSummary {
  teacherId: string;
  teacher?: AssignmentRow['teacher'];
  assignments: AssignmentWithProgress[];
  subjectCount: number;
  classroomNames: string[];
  classLevelNames: string[];
  completedCount: number;
  progress: number;
  entryStatus: GradebookStatus;
}

interface ApprovalDialogState {
  mode: 'approve' | 'reject';
  gradebookIds: string[];
  title: string;
  description: string;
}

interface BulkApprovalEditState {
  gradebookIds: string[];
  title: string;
  description: string;
  status: GradebookApprovalStatus;
  reason: string;
}

const emptyAddForm = (): AddForm => ({
  teacher_id: '',
  co_teacher_ids: [],
  subject_id: '',
  classroom_id: '',
  hours_per_week: '',
  hours_per_semester: '',
  status: 'active',
  approval_status: '',
  approval_reason: '',
});

function isSubjectSchemaMismatch(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String((err as { message?: unknown } | null)?.message ?? err ?? '');
  return (
    message.includes('schema cache') ||
    message.includes('Could not find') ||
    message.includes('column') ||
    message.includes('PGRST204')
  );
}

function normalizeGradebook(
  relation: AssignmentGradebook[] | AssignmentGradebook | null | undefined,
): AssignmentGradebook | null {
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

function completionFromStats(stats: Record<string, unknown> | null | undefined): number {
  const raw = stats?.completionPercent;
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0;
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function averageProgress(assignments: AssignmentWithProgress[]): number {
  if (assignments.length === 0) return 0;
  const total = assignments.reduce((sum, assignment) => sum + assignment.completion_percent, 0);
  return Math.round(total / assignments.length);
}

function hasSubmittedGradebook(assignment: AssignmentWithProgress): boolean {
  return assignment.gradebook_status === 'completed';
}

function hasAssignmentInput(assignment: AssignmentWithProgress): boolean {
  return (
    assignment.gradebook_status === 'completed' ||
    assignment.gradebook_status === 'in_progress' ||
    assignment.completion_percent > 0
  );
}

function teacherEntryStatus(assignments: AssignmentWithProgress[]): GradebookStatus {
  if (assignments.length === 0) return 'not_started';
  if (assignments.every(hasSubmittedGradebook)) return 'completed';
  if (assignments.some(hasAssignmentInput)) return 'in_progress';
  return 'not_started';
}

function teacherEntryStatusLabel(status: GradebookStatus): string {
  if (status === 'completed') return 'ส่งแล้ว';
  if (status === 'in_progress') return 'ส่งบางส่วน';
  return 'ยังไม่ได้ส่ง';
}

function teacherEntryStatusClassName(status: GradebookStatus): string {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
  if (status === 'in_progress') return 'bg-orange-50 text-orange-700 ring-1 ring-orange-200';
  return 'bg-slate-100 text-slate-500 ring-1 ring-slate-200';
}

function gradebookStatusTextClassName(status: GradebookStatus): string {
  if (status === 'completed') return 'text-emerald-700';
  if (status === 'in_progress') return 'text-orange-700';
  return 'text-slate-500';
}

function submittedGradebooks(assignments: AssignmentWithProgress[]): AssignmentGradebook[] {
  return assignments
    .map((assignment) => normalizeGradebook(assignment.gradebooks))
    .filter((gradebook): gradebook is AssignmentGradebook => Boolean(gradebook) && gradebook.status === 'completed');
}

function pendingApprovalGradebookIds(assignments: AssignmentWithProgress[]): string[] {
  return Array.from(
    new Set(
      submittedGradebooks(assignments)
        .filter((gradebook) => gradebook.approval_status === 'pending' || !gradebook.approval_status)
        .map((gradebook) => gradebook.id),
    ),
  );
}

function submittedGradebookIdsForAssignments(assignments: AssignmentWithProgress[]): string[] {
  return Array.from(new Set(submittedGradebooks(assignments).map((gradebook) => gradebook.id)));
}

function approvalSummary(assignments: AssignmentWithProgress[]) {
  const submitted = submittedGradebooks(assignments);
  const approved = submitted.filter((gradebook) => gradebook.approval_status === 'approved').length;
  const revision = submitted.filter((gradebook) => gradebook.approval_status === 'revision_requested').length;
  const pending = submitted.filter((gradebook) => gradebook.approval_status === 'pending' || !gradebook.approval_status).length;

  if (submitted.length === 0) {
    return {
      label: 'รอส่ง',
      className: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
      submitted: 0,
      approved,
      revision,
      pending,
    };
  }

  if (revision > 0) {
    return {
      label: 'รอแก้ไข',
      className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
      submitted: submitted.length,
      approved,
      revision,
      pending,
    };
  }

  if (submitted.length < assignments.length) {
    return {
      label: 'รอส่ง',
      className: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
      submitted: submitted.length,
      approved,
      revision,
      pending,
    };
  }

  if (approved === submitted.length) {
    return {
      label: 'อนุมัติแล้ว',
      className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
      submitted: submitted.length,
      approved,
      revision,
      pending,
    };
  }

  return {
    label: 'รออนุมัติ',
    className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    submitted: submitted.length,
    approved,
    revision,
    pending,
  };
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const message = String((err as { message?: unknown }).message ?? '');
    if (message) return message;
  }
  return fallback;
}

function isMissingEntryWindowColumn(err: unknown): boolean {
  return (
    isSchemaCacheErrorFor(err, 'entry_start_date') ||
    isSchemaCacheErrorFor(err, 'entry_end_date')
  );
}

function isMissingCoTeacherNameColumn(err: unknown): boolean {
  const message = getErrorMessage(err, '');
  return message.includes('co_teacher_name') && (
    message.includes('schema cache') ||
    message.includes('Could not find') ||
    message.includes('column')
  );
}

export const AssignmentsPage: React.FC<AssignmentsPageProps> = ({
  currentUser,
  initialYearId,
  readOnly = false,
  onOpenGradebook,
  initialClassLevelCode,
  initialSemesterNumber,
  drilldownLabel,
  onDrilldownBack,
}) => {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [selectedYearId, setSelectedYearId] = useState(initialYearId ?? '');
  const [selectedSemesterId, setSelectedSemesterId] = useState('');
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [assignments, setAssignments] = useState<AssignmentWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(emptyAddForm());
  const [editingAssignment, setEditingAssignment] = useState<AssignmentWithProgress | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [reviewRows, setReviewRows] = useState<AssignmentReviewRow[] | null>(null);
  const [showTeachTableUpload, setShowTeachTableUpload] = useState(false);
  const [reviewImportMeta, setReviewImportMeta] = useState<{
    fileName: string;
    rowCount: number;
    classrooms: string[];
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | AssignmentStatus>('all');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [classroomFilter, setClassroomFilter] = useState('all');
  const [classLevelCodeFilter] = useState(initialClassLevelCode ?? '');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<Set<string>>(new Set());
  const [selectedTeacherSummaryIds, setSelectedTeacherSummaryIds] = useState<Set<string>>(new Set());
  const [entryWindowSupported, setEntryWindowSupported] = useState(true);
  const [modalLevelFilter, setModalLevelFilter] = useState('');
  const [approvalDialog, setApprovalDialog] = useState<ApprovalDialogState | null>(null);
  const [approvalReason, setApprovalReason] = useState('');
  const [bulkApprovalEdit, setBulkApprovalEdit] = useState<BulkApprovalEditState | null>(null);
  const [approvalSaving, setApprovalSaving] = useState(false);
  const [openingGradebookAssignmentId, setOpeningGradebookAssignmentId] = useState<string | null>(null);

  const probeEntryWindowSupport = useCallback(async () => {
    const { error: probeError } = await supabase
      .from('teaching_assignments')
      .select('entry_start_date, entry_end_date')
      .limit(1);

    if (probeError && isMissingEntryWindowColumn(probeError)) {
      setEntryWindowSupported(false);
      return;
    }
    setEntryWindowSupported(true);
  }, []);

  const loadYears = useCallback(async () => {
    if (!currentUser.schoolId) return;
    const { data } = await supabase
      .from('academic_years')
      .select('*')
      .eq('school_id', currentUser.schoolId)
      .order('year_be', { ascending: false });
    setYears(data ?? []);
    const preferred = initialYearId ? data?.find((y) => y.id === initialYearId) : undefined;
    const active = preferred ?? data?.find((y) => y.is_active) ?? data?.[0];
    if (active) {
      setSelectedYearId((prev) => {
        if (preferred && prev !== preferred.id) return preferred.id;
        return prev || active.id;
      });
    }
  }, [currentUser.schoolId, initialYearId]);

  const loadSemesters = useCallback(async () => {
    if (!selectedYearId) return;
    const { data } = await supabase
      .from('semesters')
      .select('*')
      .eq('academic_year_id', selectedYearId)
      .order('semester_number');
    setSemesters(data ?? []);
    const active = data?.find((s) => s.is_active) ?? data?.[0];
    if (active) setSelectedSemesterId((prev) => (prev && data?.some((s) => s.id === prev) ? prev : active.id));
  }, [selectedYearId]);

  const loadLookups = useCallback(async () => {
    if (!currentUser.schoolId || !selectedYearId) return;
    const [{ data: teacherData }, { data: subjectData }, { data: classroomData }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, school_id, username, title, full_name, role, is_active, created_at')
        .eq('school_id', currentUser.schoolId)
        .eq('is_active', true)
        .in('role', ['teacher', 'admin', 'super_admin', 'executive'])
        .order('full_name'),
      supabase
        .from('subjects')
        .select('*')
        .eq('school_id', currentUser.schoolId)
        .order('subject_code'),
      supabase
        .from('classrooms')
        .select('*')
        .eq('academic_year_id', selectedYearId)
        .order('class_level_code')
        .order('room_number'),
    ]);
    setTeachers(teacherData ?? []);
    setSubjects(subjectData ?? []);
    setClassrooms(classroomData ?? []);
  }, [currentUser.schoolId, selectedYearId]);

  const loadAssignments = useCallback(async (showLoading = true) => {
    if (!selectedSemesterId || !currentUser.schoolId) return;
    if (showLoading) setLoading(true);
    setError('');
    try {
      const queryAssignments = (subjectColumns: string, gradebookRelation: string) =>
        supabase
          .from('teaching_assignments')
          .select(`
            *,
            profiles:teacher_id(id, full_name, title, username),
            subjects:subject_id(${subjectColumns}),
            classrooms:classroom_id(id, name, class_level_code),
            ${gradebookRelation}
          `)
          .eq('school_id', currentUser.schoolId)
          .eq('semester_id', selectedSemesterId)
          .order('created_at', { ascending: false });

      const runAssignmentQuery = async (subjectColumns: string) => {
        let result = await queryAssignments(subjectColumns, GRADEBOOK_RELATION_WITH_APPROVAL);
        if (result.error && isSchemaCacheErrorFor(result.error, 'approval_status')) {
          result = await queryAssignments(subjectColumns, GRADEBOOK_RELATION_BASE);
        }
        return result;
      };

      let { data, error: queryError } = await runAssignmentQuery(
        'id, subject_code, subject_name, learning_area, default_class_level, hours_per_week, hours_total, semester_number',
      );

      if (queryError && isSubjectSchemaMismatch(queryError)) {
        const fallback = await runAssignmentQuery('id, subject_code, subject_name, learning_area, default_class_level');
        data = fallback.data;
        queryError = fallback.error;
      }

      if (queryError) throw queryError;

      const rows = (data ?? []) as unknown as Array<AssignmentRow & {
        profiles?: AssignmentRow['teacher'];
        subjects?: AssignmentRow['subject'];
        classrooms?: AssignmentRow['classroom'];
        gradebooks?: AssignmentGradebook[] | AssignmentGradebook | null;
      }>;

      const assignmentGroupIds = unique(rows.map((row) => row.assignment_group_id));
      const sharedGradebookByGroup = new Map<string, AssignmentGradebook>();
      if (assignmentGroupIds.length > 0) {
        let sharedResult: any = await supabase
          .from('gradebooks')
          .select('id, assignment_group_id, status, stats, approval_status, approval_reason, approval_reason_seen_at')
          .in('assignment_group_id', assignmentGroupIds)
          .is('deleted_at', null);
        if (sharedResult.error && isSchemaCacheErrorFor(sharedResult.error, 'approval_status')) {
          sharedResult = await supabase
            .from('gradebooks')
            .select('id, assignment_group_id, status, stats')
            .in('assignment_group_id', assignmentGroupIds)
            .is('deleted_at', null);
        }
        if (sharedResult.error && !isSchemaCacheErrorFor(sharedResult.error, 'assignment_group_id')) {
          throw sharedResult.error;
        }
        for (const gradebook of (sharedResult.data ?? []) as AssignmentGradebook[]) {
          if (gradebook.assignment_group_id) sharedGradebookByGroup.set(gradebook.assignment_group_id, gradebook);
        }
      }

      const mapped: AssignmentWithProgress[] = rows.map((r) => {
        const gradebook = sharedRecordForAssignment(
          r,
          sharedGradebookByGroup,
          normalizeGradebook(r.gradebooks),
        );
        return {
          ...r,
          teacher: r.profiles,
          subject: r.subjects,
          classroom: r.classrooms,
          gradebooks: gradebook,
          gradebook_status: gradebook?.status ?? null,
          completion_percent: completionFromStats(gradebook?.stats),
          approval_status: gradebook?.approval_status ?? null,
          approval_reason: gradebook?.approval_reason ?? null,
          approval_reason_seen_at: gradebook?.approval_reason_seen_at ?? null,
        };
      });
      setAssignments(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดรายการมอบหมายไม่สำเร็จ');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [selectedSemesterId, currentUser.schoolId]);

  useEffect(() => { void loadYears(); }, [loadYears]);
  useEffect(() => { void loadSemesters(); }, [loadSemesters]);
  useEffect(() => { void loadLookups(); }, [loadLookups]);
  useEffect(() => { void loadAssignments(); }, [loadAssignments]);
  useEffect(() => {
    if (!selectedSemesterId) return undefined;

    const syncAssignments = () => {
      void loadAssignments(false);
    };

    const channel = supabase
      .channel(`assignments-gradebooks-${selectedSemesterId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gradebooks', filter: `semester_id=eq.${selectedSemesterId}` },
        syncAssignments,
      )
      .subscribe();

    const timer = window.setInterval(syncAssignments, 5000);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [loadAssignments, selectedSemesterId]);

  useEffect(() => {
    if (!showTeachTableUpload && !reviewRows) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showTeachTableUpload, reviewRows]);
  useEffect(() => { void probeEntryWindowSupport(); }, [probeEntryWindowSupport]);
  useEffect(() => {
    if (!initialSemesterNumber || semesters.length === 0) return;
    const target = semesters.find((semester) => semester.semester_number === initialSemesterNumber);
    if (target) setSelectedSemesterId(target.id);
  }, [initialSemesterNumber, semesters]);
  useEffect(() => { setSelectedAssignmentIds(new Set()); }, [selectedTeacherId, selectedSemesterId]);
  useEffect(() => { setSelectedTeacherSummaryIds(new Set()); }, [selectedSemesterId, statusFilter, teacherSearch, subjectFilter, classroomFilter]);

  const pendingCount = assignments.filter((a) => a.status === 'pending').length;

  const filtered = assignments.filter((assignment) => {
    const teacherQuery = teacherSearch.trim().toLowerCase();
    if (statusFilter !== 'all' && assignment.status !== statusFilter) return false;
    if (teacherQuery) {
      const teacherName = assignment.teacher?.full_name?.toLowerCase() ?? '';
      if (!teacherName.includes(teacherQuery)) return false;
    }
    if (subjectFilter !== 'all' && assignment.subject_id !== subjectFilter) return false;
    if (classLevelCodeFilter && assignment.classroom?.class_level_code !== classLevelCodeFilter) return false;
    if (classroomFilter !== 'all' && assignment.classroom_id !== classroomFilter) return false;
    return true;
  });

  const teacherSummaryMap = filtered.reduce<Map<string, TeacherAssignmentSummary>>((map, assignment) => {
      const existing = map.get(assignment.teacher_id) ?? {
        teacherId: assignment.teacher_id,
        teacher: assignment.teacher,
        assignments: [],
        subjectCount: 0,
        classroomNames: [],
        classLevelNames: [],
        completedCount: 0,
        progress: 0,
        entryStatus: 'not_started',
      };
      existing.assignments.push(assignment);
      existing.teacher = existing.teacher ?? assignment.teacher;
      map.set(assignment.teacher_id, existing);
      return map;
    }, new Map<string, TeacherAssignmentSummary>());

  const teacherSummaryRows = Array.from(teacherSummaryMap.values()) as TeacherAssignmentSummary[];

  const teacherSummaries: TeacherAssignmentSummary[] = teacherSummaryRows.map((summary) => {
    const subjectIds = unique(summary.assignments.map((assignment) => assignment.subject_id));
    const classroomNames = unique(summary.assignments.map((assignment) => assignment.classroom?.name));
    const classLevelNames = unique(summary.assignments.map((assignment) => assignment.classroom?.class_level_code));
    const completedCount = summary.assignments.filter(hasSubmittedGradebook).length;
    return {
      ...summary,
      subjectCount: subjectIds.length,
      classroomNames,
      classLevelNames,
      completedCount,
      progress: averageProgress(summary.assignments),
      entryStatus: teacherEntryStatus(summary.assignments),
    };
  }).sort((a, b) => (a.teacher?.full_name ?? '').localeCompare(b.teacher?.full_name ?? '', 'th'));
  const selectedTeacherSummaryCount = selectedTeacherSummaryIds.size;
  const allTeacherSummariesChecked =
    teacherSummaries.length > 0 &&
    teacherSummaries.every((summary) => selectedTeacherSummaryIds.has(summary.teacherId));
  const selectedTeacherSummaryAssignmentIds = teacherSummaries
    .filter((summary) => selectedTeacherSummaryIds.has(summary.teacherId))
    .flatMap((summary) => summary.assignments.map((assignment) => assignment.id));
  const selectedTeacherSummaryGradebookIds = submittedGradebookIdsForAssignments(
    teacherSummaries
      .filter((summary) => selectedTeacherSummaryIds.has(summary.teacherId))
      .flatMap((summary) => summary.assignments),
  );
  const allTeacherSummaryAssignmentIds = teacherSummaries
    .flatMap((summary) => summary.assignments.map((assignment) => assignment.id));

  const selectedSummary = selectedTeacherId
    ? teacherSummaries.find((summary) => summary.teacherId === selectedTeacherId)
    : null;
  const selectedTeacher = selectedSummary?.teacher ?? teachers.find((teacher) => teacher.id === selectedTeacherId);
  const selectedAssignments = selectedSummary?.assignments ?? [];
  const allPendingApprovalGradebookIds = pendingApprovalGradebookIds(assignments);
  const selectedTeacherPendingApprovalGradebookIds = selectedTeacherId
    ? pendingApprovalGradebookIds(assignments.filter((assignment) => assignment.teacher_id === selectedTeacherId))
    : [];
  const editingAssignmentGradebook = editingAssignment ? normalizeGradebook(editingAssignment.gradebooks) : null;
  const canEditGradebookApprovalStatus = editingAssignmentGradebook?.status === 'completed';
  const selectedAssignmentIdsInView = selectedAssignments
    .filter((assignment) => selectedAssignmentIds.has(assignment.id))
    .map((assignment) => assignment.id);
  const selectedAssignmentGradebookIds = submittedGradebookIdsForAssignments(
    selectedAssignments.filter((assignment) => selectedAssignmentIds.has(assignment.id)),
  );
  const selectedAssignmentCount = selectedAssignmentIdsInView.length;
  const allSelectedAssignmentsChecked =
    selectedAssignments.length > 0 &&
    selectedAssignments.every((assignment) => selectedAssignmentIds.has(assignment.id));
  const selectedSemester = semesters.find((semester) => semester.id === selectedSemesterId);
  const defaultSemesterId = semesters.find((semester) => semester.is_active)?.id ?? semesters[0]?.id ?? '';

  const hasActiveAssignmentFilters = Boolean(
    statusFilter !== 'all'
    || teacherSearch.trim()
    || subjectFilter !== 'all'
    || classroomFilter !== 'all'
    || (defaultSemesterId && selectedSemesterId !== defaultSemesterId),
  );

  const clearAssignmentFilters = () => {
    setStatusFilter('all');
    setTeacherSearch('');
    setSubjectFilter('all');
    setClassroomFilter('all');
    if (defaultSemesterId) setSelectedSemesterId(defaultSemesterId);
  };

  const classroomTeacherIds = (classroom: Classroom) => [
    classroom.homeroom_teacher_id,
    classroom.homeroom_teacher_2_id,
    classroom.homeroom_teacher_3_id,
  ].filter((teacherId): teacherId is string => Boolean(teacherId));

  const teacherHomeroomLevelCodes = (teacherId: string) => unique(
    classrooms
      .filter((classroom) => classroomTeacherIds(classroom).includes(teacherId))
      .map((classroom) => classroom.class_level_code),
  ).sort((a, b) => a.localeCompare(b, 'th'));

  const teacherIdsForClassLevel = (level: string) => new Set([
    ...classrooms
      .filter((classroom) => classroom.class_level_code === level)
      .flatMap((classroom) => classroomTeacherIds(classroom)),
    ...assignments
      .filter((assignment) => assignment.classroom?.class_level_code === level)
      .map((assignment) => assignment.teacher_id),
  ]);

  const selectedTeacherLevelOptions = addForm.teacher_id ? teacherHomeroomLevelCodes(addForm.teacher_id) : [];
  const selectedTeacherLevelSet = new Set(selectedTeacherLevelOptions);
  const allModalClassLevelOptions = unique([
    ...classrooms.map((classroom) => classroom.class_level_code),
    ...subjects.map((subject) => subject.default_class_level),
  ]).sort((a, b) => a.localeCompare(b, 'th'));
  const modalClassLevelOptions = selectedTeacherLevelSet.size > 0
    ? allModalClassLevelOptions.filter((level) => selectedTeacherLevelSet.has(level))
    : allModalClassLevelOptions;
  const effectiveModalLevelFilter = modalLevelFilter || (selectedTeacherLevelOptions.length === 1 ? selectedTeacherLevelOptions[0] : '');
  const modalClassrooms = classrooms.filter((classroom) => {
    const levelMatch = !effectiveModalLevelFilter || classroom.class_level_code === effectiveModalLevelFilter;
    const teacherMatch = selectedTeacherLevelSet.size === 0 || selectedTeacherLevelSet.has(classroom.class_level_code);
    return levelMatch && teacherMatch;
  });
  const modalSubjects = subjects.filter((subject) => {
    const levelMatch = !effectiveModalLevelFilter || !subject.default_class_level || subject.default_class_level === effectiveModalLevelFilter;
    const semesterMatch = !selectedSemester?.semester_number || subject.semester_number == null || subject.semester_number === selectedSemester.semester_number;
    return levelMatch && semesterMatch;
  });
  const modalTeacherIdsForLevel = effectiveModalLevelFilter
    ? teacherIdsForClassLevel(effectiveModalLevelFilter)
    : null;
  const modalTeachers = modalTeacherIdsForLevel && modalTeacherIdsForLevel.size > 0
    ? teachers.filter((teacher) =>
        modalTeacherIdsForLevel.has(teacher.id) ||
        teacher.id === addForm.teacher_id ||
        addForm.co_teacher_ids.includes(teacher.id),
      )
    : teachers;

  const subjectHours = (subject: Subject | undefined) => {
    if (!subject) return { hoursPerWeek: '', hoursPerSemester: '' };
    const catalog = SUBJECTS_CATALOG.find((item) => item.subject_code === subject.subject_code);
    const hoursPerWeek = subject.hours_per_week ?? catalog?.hours_per_week ?? null;
    const hoursPerSemester = subject.hours_total ?? catalog?.hours_total ?? null;
    return {
      hoursPerWeek: hoursPerWeek == null ? '' : String(hoursPerWeek),
      hoursPerSemester: hoursPerSemester == null ? '' : String(hoursPerSemester),
    };
  };

  const setSubjectAndHours = (subjectId: string) => {
    const subject = subjects.find((item) => item.id === subjectId);
    const hours = subjectHours(subject);
    setAddForm((current) => ({
      ...current,
      subject_id: subjectId,
      hours_per_week: hours.hoursPerWeek,
      hours_per_semester: hours.hoursPerSemester,
    }));
  };

  const openAddModal = (teacherId?: string) => {
    const presetTeacherId = teacherId ?? selectedTeacherId ?? '';
    const presetLevels = presetTeacherId ? teacherHomeroomLevelCodes(presetTeacherId) : [];
    setEditingAssignment(null);
    setModalLevelFilter(presetLevels.length === 1 ? presetLevels[0] : '');
    setAddForm({
      ...emptyAddForm(),
      teacher_id: presetTeacherId,
    });
    setShowAddModal(true);
  };

  const openEditModal = (assignment: AssignmentWithProgress) => {
    setEditingAssignment(assignment);
    const gradebook = normalizeGradebook(assignment.gradebooks);
    const classroomLevel = assignment.classroom?.class_level_code ?? classrooms.find((item) => item.id === assignment.classroom_id)?.class_level_code ?? '';
    setModalLevelFilter(classroomLevel);
    const groupKey = assignmentGroupKey(assignment);
    const collaboratorIds = assignments
      .filter((candidate) => assignmentGroupKey(candidate) === groupKey && candidate.teacher_id !== assignment.teacher_id)
      .map((candidate) => candidate.teacher_id);
    setAddForm({
      teacher_id: assignment.teacher_id,
      co_teacher_ids: collaboratorIds.slice(0, 2),
      subject_id: assignment.subject_id,
      classroom_id: assignment.classroom_id,
      hours_per_week: assignment.hours_per_week == null ? '' : String(assignment.hours_per_week),
      hours_per_semester: assignment.hours_per_semester == null ? '' : String(assignment.hours_per_semester),
      status: assignment.status,
      approval_status: gradebook?.status === 'completed' ? gradebook.approval_status ?? 'pending' : '',
      approval_reason: gradebook?.approval_reason ?? '',
    });
    setShowAddModal(true);
  };

  const handleOpenAssignmentGradebook = async (assignment: AssignmentWithProgress) => {
    if (!onOpenGradebook) return;

    setOpeningGradebookAssignmentId(assignment.id);
    setError('');

    try {
      const teacherAssignments = await fetchTeacherAssignments(assignment.teacher_id);
      const matchedAssignment = teacherAssignments.find((item) => item.id === assignment.id);
      if (!matchedAssignment) {
        setError('ไม่พบข้อมูลรายวิชาที่มอบหมาย กรุณารีเฟรชแล้วลองใหม่');
        return;
      }

      const teacherProfile = assignment.teacher;
      if (!teacherProfile) {
        setError('ไม่พบข้อมูลครูผู้สอนสำหรับรายการนี้');
        return;
      }

      const gradebookId = matchedAssignment.gradebook_id
        ?? normalizeGradebook(assignment.gradebooks)?.id
        ?? await ensureGradebook(
          matchedAssignment,
          {
            id: assignment.teacher_id,
            username: teacherProfile.username ?? '',
            name: [teacherProfile.title, teacherProfile.full_name].filter(Boolean).join(' '),
            role: 'teacher',
            schoolId: assignment.school_id,
            isActive: true,
            title: teacherProfile.title ?? null,
          },
          { adminCreate: true },
        );

      await onOpenGradebook(
        { ...matchedAssignment, gradebook_id: gradebookId },
        gradebookId,
        { readOnly, returnPeriodKey: null },
      );
    } catch (err) {
      setError(getErrorMessage(err, 'เปิดสมุด ปพ.5 ไม่สำเร็จ'));
    } finally {
      setOpeningGradebookAssignmentId(null);
    }
  };

  const closeAssignmentModal = () => {
    setShowAddModal(false);
    setEditingAssignment(null);
    setAddForm(emptyAddForm());
    setModalLevelFilter('');
  };

  const handleModalLevelChange = (level: string) => {
    const teacherIds = level ? teacherIdsForClassLevel(level) : null;
    setModalLevelFilter(level);
    setAddForm((current) => ({
      ...current,
      teacher_id: current.teacher_id && (!teacherIds || teacherIds.size === 0 || teacherIds.has(current.teacher_id)) ? current.teacher_id : '',
      co_teacher_ids: current.co_teacher_ids.filter((teacherId) => !teacherIds || teacherIds.size === 0 || teacherIds.has(teacherId)),
      subject_id: '',
      classroom_id: '',
      hours_per_week: '',
      hours_per_semester: '',
    }));
  };

  const handleModalTeacherChange = (teacherId: string) => {
    const teacherLevels = teacherId ? teacherHomeroomLevelCodes(teacherId) : [];
    setModalLevelFilter((currentLevel) => {
      if (!teacherId) return currentLevel;
      if (currentLevel && teacherLevels.length > 0 && !teacherLevels.includes(currentLevel)) {
        return teacherLevels.length === 1 ? teacherLevels[0] : '';
      }
      if (!currentLevel && teacherLevels.length === 1) return teacherLevels[0];
      return currentLevel;
    });
    setAddForm((current) => ({
      ...current,
      teacher_id: teacherId,
      co_teacher_ids: current.co_teacher_ids.filter((id) => id !== teacherId),
      subject_id: '',
      classroom_id: '',
      hours_per_week: '',
      hours_per_semester: '',
    }));
  };

  const handleModalCoTeacherChange = (index: number, teacherId: string) => {
    setAddForm((current) => {
      const next = [...current.co_teacher_ids];
      if (teacherId) next[index] = teacherId;
      else next.splice(index, 1);
      return {
        ...current,
        co_teacher_ids: Array.from(
          new Set(next.filter((id) => id && id !== current.teacher_id)),
        ).slice(0, 2),
      };
    });
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser.schoolId || !selectedSemesterId) return;

    const editingGradebook = editingAssignment ? normalizeGradebook(editingAssignment.gradebooks) : null;
    const nextApprovalStatus = addForm.approval_status;
    const nextApprovalReason = addForm.approval_reason.trim();
    if (editingGradebook && nextApprovalStatus === 'revision_requested' && !nextApprovalReason) {
      setError('กรุณาระบุเหตุผลที่ให้แก้ไข ปพ.5');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const teacherIds = uniqueTeacherIds(addForm.teacher_id, addForm.co_teacher_ids);
      const { error: saveError } = await supabase.rpc('admin_sync_teaching_assignment_group', {
        p_assignment_id: editingAssignment?.id ?? null,
        p_school_id: currentUser.schoolId,
        p_semester_id: selectedSemesterId,
        p_teacher_ids: teacherIds,
        p_subject_id: addForm.subject_id,
        p_classroom_id: addForm.classroom_id,
        p_hours_per_week: addForm.hours_per_week ? parseInt(addForm.hours_per_week, 10) : null,
        p_hours_per_semester: addForm.hours_per_semester ? parseInt(addForm.hours_per_semester, 10) : null,
        p_entry_start_date: entryWindowSupported ? selectedSemester?.entry_start_date ?? null : null,
        p_entry_end_date: entryWindowSupported ? selectedSemester?.entry_end_date ?? null : null,
        p_status: addForm.status,
      });

      if (saveError) {
        if (isMissingEntryWindowColumn(saveError)) {
          setEntryWindowSupported(false);
          throw new Error(ENTRY_WINDOW_MIGRATION_HINT);
        }
        if (
          saveError.code === 'PGRST202' ||
          saveError.message?.includes('admin_sync_teaching_assignment_group')
        ) {
          throw new Error('ฐานข้อมูลยังไม่รองรับครูผู้สอนร่วม กรุณารัน migration `0039_shared_co_teacher_gradebooks.sql`');
        }
        throw saveError;
      }

      if (editingGradebook && nextApprovalStatus) {
        const now = new Date().toISOString();
        const approvalPayload =
          nextApprovalStatus === 'revision_requested'
            ? {
                approval_status: nextApprovalStatus,
                approval_reason: nextApprovalReason,
                approval_reason_seen_at: null,
                approval_reviewed_by: currentUser.id,
                approval_reviewed_at: now,
                updated_at: now,
              }
            : {
                approval_status: nextApprovalStatus,
                approval_reason: null,
                approval_reason_seen_at: null,
                approval_reviewed_by: nextApprovalStatus === 'approved' ? currentUser.id : null,
                approval_reviewed_at: nextApprovalStatus === 'approved' ? now : null,
                updated_at: now,
              };

        const { error: gradebookStatusError } = await supabase
          .from('gradebooks')
          .update(approvalPayload)
          .eq('id', editingGradebook.id);

        if (gradebookStatusError) {
          if (isSchemaCacheErrorFor(gradebookStatusError, 'approval_status')) {
            throw new Error(APPROVAL_MIGRATION_HINT);
          }
          if (gradebookStatusError.code === '42501') {
            throw new Error(APPROVAL_POLICY_MIGRATION_HINT);
          }
          throw gradebookStatusError;
        }
      }

      closeAssignmentModal();
      setMessage(editingAssignment ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มรายการมอบหมายแล้ว');
      await loadAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('ลบรายการมอบหมายครูกรอก ปพ.5 นี้?')) return;
    const { error: delError } = await supabase.from('teaching_assignments').delete().eq('id', id);
    if (delError) setError(delError.message);
    else {
      setSelectedAssignmentIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      await loadAssignments();
    }
  };

  const toggleAssignmentSelection = (id: string, checked: boolean) => {
    setSelectedAssignmentIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllSelectedTeacherAssignments = (checked: boolean) => {
    setSelectedAssignmentIds(checked ? new Set(selectedAssignments.map((assignment) => assignment.id)) : new Set());
  };

  const toggleTeacherSummarySelection = (teacherId: string, checked: boolean) => {
    setSelectedTeacherSummaryIds((current) => {
      const next = new Set(current);
      if (checked) next.add(teacherId);
      else next.delete(teacherId);
      return next;
    });
  };

  const toggleAllTeacherSummaries = (checked: boolean) => {
    setSelectedTeacherSummaryIds(checked ? new Set(teacherSummaries.map((summary) => summary.teacherId)) : new Set());
  };

  const deleteAssignmentsByIds = async (ids: string[], confirmText: string) => {
    if (ids.length === 0) return;
    if (!window.confirm(confirmText)) return;
    setSaving(true);
    setError('');
    const { error: delError } = await supabase
      .from('teaching_assignments')
      .delete()
      .in('id', ids);
    if (delError) setError(delError.message);
    else {
      setSelectedAssignmentIds(new Set());
      setSelectedTeacherSummaryIds(new Set());
      await loadAssignments();
    }
    setSaving(false);
  };

  const deleteSelectedAssignments = async () => {
    await deleteAssignmentsByIds(
      selectedAssignmentIdsInView,
      `ลบรายการที่เลือก ${selectedAssignmentCount} รายการ?`,
    );
  };

  const deleteAllSelectedTeacherAssignments = async () => {
    await deleteAssignmentsByIds(
      selectedAssignments.map((assignment) => assignment.id),
      `ลบรายการมอบหมายทั้งหมดของครูคนนี้ ${selectedAssignments.length} รายการ?`,
    );
  };

  const deleteSelectedTeacherSummaries = async () => {
    await deleteAssignmentsByIds(
      selectedTeacherSummaryAssignmentIds,
      `ลบรายการมอบหมายของครูที่เลือก ${selectedTeacherSummaryCount} คน รวม ${selectedTeacherSummaryAssignmentIds.length} รายการ?`,
    );
  };

  const deleteAllTeacherSummaries = async () => {
    await deleteAssignmentsByIds(
      allTeacherSummaryAssignmentIds,
      `ลบรายการมอบหมายทั้งหมดในตารางนี้ ${allTeacherSummaryAssignmentIds.length} รายการ?`,
    );
  };

  const openApprovalDialog = (
    mode: ApprovalDialogState['mode'],
    gradebookIds: string[],
    title: string,
    description: string,
  ) => {
    const uniqueIds = Array.from(new Set(gradebookIds));
    if (uniqueIds.length === 0) {
      setError('ยังไม่มี ปพ.5 ที่ครูส่งแล้วสำหรับอนุมัติ');
      return;
    }
    setError('');
    setApprovalReason('');
    setApprovalDialog({ mode, gradebookIds: uniqueIds, title, description });
  };

  const openBulkApprovalEditDialog = (gradebookIds: string[], title: string, description: string) => {
    const uniqueIds = Array.from(new Set(gradebookIds));
    if (uniqueIds.length === 0) {
      setError('ไม่มี ปพ.5 ที่ส่งแล้วในรายการที่เลือก');
      return;
    }
    setError('');
    setBulkApprovalEdit({
      gradebookIds: uniqueIds,
      title,
      description,
      status: 'pending',
      reason: '',
    });
  };

  const applyGradebookApprovalStatusToAssignments = (
    gradebookIds: string[],
    nextApprovalStatus: GradebookApprovalStatus,
    nextApprovalReason: string | null,
  ) => {
    const updatedGradebookIds = new Set(gradebookIds);
    setAssignments((current) =>
      current.map((assignment) => {
        const gradebook = normalizeGradebook(assignment.gradebooks);
        if (!gradebook || !updatedGradebookIds.has(gradebook.id)) return assignment;

        const updateGradebook = (item: AssignmentGradebook): AssignmentGradebook =>
          updatedGradebookIds.has(item.id)
            ? {
                ...item,
                approval_status: nextApprovalStatus,
                approval_reason: nextApprovalReason,
                approval_reason_seen_at: null,
              }
            : item;

        return {
          ...assignment,
          gradebooks: Array.isArray(assignment.gradebooks)
            ? assignment.gradebooks.map(updateGradebook)
            : updateGradebook(gradebook),
          approval_status: nextApprovalStatus,
          approval_reason: nextApprovalReason,
          approval_reason_seen_at: null,
        };
      }),
    );
  };

  const handleBulkApprovalEditSave = async () => {
    if (!bulkApprovalEdit) return;
    const reason = bulkApprovalEdit.reason.trim();
    if (bulkApprovalEdit.status === 'revision_requested' && !reason) {
      setError('กรุณาระบุเหตุผลที่ให้แก้ไข ปพ.5');
      return;
    }

    setApprovalSaving(true);
    setError('');
    setMessage('');
    try {
      const now = new Date().toISOString();
      const nextApprovalReason = bulkApprovalEdit.status === 'revision_requested' ? reason : null;
      const payload =
        bulkApprovalEdit.status === 'revision_requested'
          ? {
              approval_status: bulkApprovalEdit.status,
              approval_reason: nextApprovalReason,
              approval_reason_seen_at: null,
              approval_reviewed_by: currentUser.id,
              approval_reviewed_at: now,
              updated_at: now,
            }
          : {
              approval_status: bulkApprovalEdit.status,
              approval_reason: null,
              approval_reason_seen_at: null,
              approval_reviewed_by: bulkApprovalEdit.status === 'approved' ? currentUser.id : null,
              approval_reviewed_at: bulkApprovalEdit.status === 'approved' ? now : null,
              updated_at: now,
            };

      const { error: updateError } = await supabase
        .from('gradebooks')
        .update(payload)
        .in('id', bulkApprovalEdit.gradebookIds);

      if (updateError) {
        if (isSchemaCacheErrorFor(updateError, 'approval_status')) {
          throw new Error(APPROVAL_MIGRATION_HINT);
        }
        if (updateError.code === '42501') {
          throw new Error(APPROVAL_POLICY_MIGRATION_HINT);
        }
        throw updateError;
      }

      applyGradebookApprovalStatusToAssignments(
        bulkApprovalEdit.gradebookIds,
        bulkApprovalEdit.status,
        nextApprovalReason,
      );
      setMessage(`แก้ไขสถานะ ปพ.5 แล้ว ${bulkApprovalEdit.gradebookIds.length} รายการ`);
      setBulkApprovalEdit(null);
      window.setTimeout(() => {
        void loadAssignments(false);
      }, 500);
    } catch (err) {
      setError(getErrorMessage(err, 'แก้ไขสถานะ ปพ.5 ไม่สำเร็จ'));
    } finally {
      setApprovalSaving(false);
    }
  };

  const handleApprovalSave = async () => {
    if (!approvalDialog) return;
    const reason = approvalReason.trim();
    if (approvalDialog.mode === 'reject' && !reason) {
      setError('กรุณาระบุเหตุผลที่ไม่อนุมัติ');
      return;
    }

    setApprovalSaving(true);
    setError('');
    setMessage('');
    try {
      const now = new Date().toISOString();
      const nextApprovalStatus: GradebookApprovalStatus =
        approvalDialog.mode === 'approve' ? 'approved' : 'revision_requested';
      const nextApprovalReason = approvalDialog.mode === 'approve' ? null : reason;
      const payload =
        approvalDialog.mode === 'approve'
          ? {
              approval_status: nextApprovalStatus,
              approval_reason: null,
              approval_reason_seen_at: null,
              approval_reviewed_by: currentUser.id,
              approval_reviewed_at: now,
              updated_at: now,
            }
          : {
              approval_status: nextApprovalStatus,
              approval_reason: nextApprovalReason,
              approval_reason_seen_at: null,
              approval_reviewed_by: currentUser.id,
              approval_reviewed_at: now,
              updated_at: now,
            };

      const { error: approvalError } = await supabase
        .from('gradebooks')
        .update(payload)
        .in('id', approvalDialog.gradebookIds);

      if (approvalError) {
        if (isSchemaCacheErrorFor(approvalError, 'approval_status')) {
          throw new Error(APPROVAL_MIGRATION_HINT);
        }
        if (approvalError.code === '42501') {
          throw new Error(APPROVAL_POLICY_MIGRATION_HINT);
        }
        throw approvalError;
      }

      const updatedGradebookIds = new Set(approvalDialog.gradebookIds);
      setAssignments((current) =>
        current.map((assignment) => {
          const gradebook = normalizeGradebook(assignment.gradebooks);
          if (!gradebook || !updatedGradebookIds.has(gradebook.id)) return assignment;

          const updateGradebook = (item: AssignmentGradebook): AssignmentGradebook =>
            updatedGradebookIds.has(item.id)
              ? {
                  ...item,
                  approval_status: nextApprovalStatus,
                  approval_reason: nextApprovalReason,
                  approval_reason_seen_at: null,
                }
              : item;

          return {
            ...assignment,
            gradebooks: Array.isArray(assignment.gradebooks)
              ? assignment.gradebooks.map(updateGradebook)
              : updateGradebook(gradebook),
            approval_status: nextApprovalStatus,
            approval_reason: nextApprovalReason,
            approval_reason_seen_at: null,
          };
        }),
      );
      setApprovalDialog(null);
      setApprovalReason('');
      setSelectedTeacherSummaryIds(new Set());
      setMessage(
        approvalDialog.mode === 'approve'
          ? `อนุมัติ ปพ.5 แล้ว ${approvalDialog.gradebookIds.length} รายการ`
          : `ส่งกลับให้แก้ไขแล้ว ${approvalDialog.gradebookIds.length} รายการ`,
      );
      window.setTimeout(() => {
        void loadAssignments(false);
      }, 500);
    } catch (err) {
      setError(getErrorMessage(err, 'บันทึกการอนุมัติไม่สำเร็จ'));
    } finally {
      setApprovalSaving(false);
    }
  };

  const toggleAssignmentStatus = async (assignment: AssignmentRow) => {
    const nextStatus: AssignmentStatus = assignment.status === 'active' ? 'pending' : 'active';
    const { error: updateError } = await supabase
      .from('teaching_assignments')
      .update({ status: nextStatus })
      .eq('id', assignment.id);
    if (updateError) setError(updateError.message);
    else await loadAssignments();
  };

  const activateAllPending = async () => {
    const pending = assignments.filter((a) => a.status === 'pending');
    if (pending.length === 0) return;
    if (!window.confirm(`เปิดใช้งานรายการที่ปิดอยู่ ${pending.length} รายการ?`)) return;

    setSaving(true);
    setError('');
    const { error: updateError } = await supabase
      .from('teaching_assignments')
      .update({ status: 'active' })
      .in('id', pending.map((p) => p.id));
    if (updateError) setError(updateError.message);
    else {
      setMessage(`เปิดใช้งาน ${pending.length} รายการแล้ว`);
      await loadAssignments();
    }
    setSaving(false);
  };

  const assignAllFromExistingPatterns = async () => {
    if (!currentUser.schoolId || !selectedSemesterId) return;
    if (assignments.length === 0) {
      setMessage('');
      setError('ยังไม่มีรายการอ้างอิง ให้เพิ่มอย่างน้อย 1 รายการก่อน แล้วระบบจะใช้ครู/รายวิชา/ระดับชั้นนั้นสร้างรายการที่เหลือ');
      return;
    }

    if (!window.confirm('ให้ระบบสร้างรายการมอบหมายทั้งหมดจากรายการอ้างอิงที่มีอยู่ และข้ามรายการที่ซ้ำ ใช่หรือไม่?')) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const teacherByLevelSubject = new Map<string, string>();
      assignments.forEach((assignment) => {
        const level = assignment.classroom?.class_level_code ?? classrooms.find((item) => item.id === assignment.classroom_id)?.class_level_code;
        if (!level) return;
        const key = `${level}|${assignment.subject_id}`;
        if (!teacherByLevelSubject.has(key)) teacherByLevelSubject.set(key, assignment.teacher_id);
      });

      const existingKeys = new Set(
        assignments.map((assignment) => `${assignment.teacher_id}|${assignment.subject_id}|${assignment.classroom_id}`),
      );
      const semesterNumber = selectedSemester?.semester_number;
      const payload: Array<{
        school_id: string;
        semester_id: string;
        teacher_id: string;
        subject_id: string;
        classroom_id: string;
        hours_per_week: number | null;
        hours_per_semester: number | null;
        status: AssignmentStatus;
        created_by: string;
      }> = [];

      classrooms.forEach((classroom) => {
        subjects.forEach((subject) => {
          if (subject.default_class_level && subject.default_class_level !== classroom.class_level_code) return;
          if (semesterNumber && subject.semester_number != null && subject.semester_number !== semesterNumber) return;

          const teacherId = teacherByLevelSubject.get(`${classroom.class_level_code}|${subject.id}`);
          if (!teacherId) return;

          const duplicateKey = `${teacherId}|${subject.id}|${classroom.id}`;
          if (existingKeys.has(duplicateKey)) return;

          const hours = subjectHours(subject);
          payload.push({
            school_id: currentUser.schoolId as string,
            semester_id: selectedSemesterId,
            teacher_id: teacherId,
            subject_id: subject.id,
            classroom_id: classroom.id,
            hours_per_week: hours.hoursPerWeek ? parseInt(hours.hoursPerWeek, 10) : null,
            hours_per_semester: hours.hoursPerSemester ? parseInt(hours.hoursPerSemester, 10) : null,
            status: 'active',
            created_by: currentUser.id,
          });
          existingKeys.add(duplicateKey);
        });
      });

      if (payload.length === 0) {
        setMessage('ไม่มีรายการใหม่ที่ต้องสร้าง ระบบข้ามรายการที่มีอยู่แล้วทั้งหมด');
        return;
      }

      const { error: insertError } = await supabase.from('teaching_assignments').insert(payload);
      if (insertError) throw insertError;

      setMessage(`มอบหมายทั้งหมดเพิ่มใหม่ ${payload.length.toLocaleString('th-TH')} รายการแล้ว`);
      await loadAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'มอบหมายทั้งหมดไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const applyReviewValidation = (rows: AssignmentReviewRow[]): AssignmentReviewRow[] => {
    const existingAssignmentKeys = new Set(
      assignments.map((assignment) => `${assignment.teacher_id}|${assignment.subject_id}|${assignment.classroom_id}`),
    );
    const seenAssignmentKeys = new Set<string>();

    return rows.map((row) => {
      const base = validateReviewRow(row);
      const issues = new Set(base.issues);

      if (base.teacherId && base.subjectId && base.classroomId) {
        const key = `${base.subjectId}|${base.classroomId}`;
        const teacherIds = uniqueTeacherIds(base.teacherId, base.coTeacherIds);
        if (
          teacherIds.length > 0 &&
          teacherIds.every((teacherId) => existingAssignmentKeys.has(`${teacherId}|${key}`))
        ) {
          issues.add('มีรายการมอบหมายให้ครูทุกคนแล้ว');
        }
        if (seenAssignmentKeys.has(key)) {
          issues.add('ซ้ำในไฟล์');
        }
        seenAssignmentKeys.add(key);
      }

      return { ...base, issues: Array.from(issues) };
    });
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    setError('');
    setMessage('');
    try {
      const rows = await parseAssignmentExcel(file);
      if (rows.length === 0) {
        setError('ไม่พบข้อมูลในไฟล์');
        return;
      }
      const resolved = applyReviewValidation(resolveAssignmentRows(rows, teachers, subjects, classrooms));
      setReviewRows(resolved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อ่านไฟล์ไม่สำเร็จ');
    } finally {
      setImporting(false);
    }
  };

  const openTeachTableUpload = () => {
    setError('');
    setMessage('');
    setReviewImportMeta(null);
    setShowTeachTableUpload(true);
  };

  const processTeachTableFile = async (file: File) => {
    setImporting(true);
    setError('');
    setMessage('');
    try {
      const rows = await parseAssignmentWord(file);
      const resolved = applyReviewValidation(
        resolveAssignmentRows(rows, teachers, subjects, classrooms, { teacherRoles: ['teacher', 'admin', 'super_admin', 'executive'] }),
      );
      setReviewImportMeta({
        fileName: file.name,
        rowCount: rows.length,
        classrooms: [...new Set(rows.map((row) => row.classroomName))].sort((a, b) => a.localeCompare(b, 'th')),
      });
      setReviewRows(resolved);
      setShowTeachTableUpload(false);
    } catch (err) {
      console.error('Teaching schedule Word import failed', err);
      const detail = err instanceof Error ? err.message : '';
      setError(detail || 'อ่านไฟล์ตารางสอน Word ไม่สำเร็จ');
    } finally {
      setImporting(false);
    }
  };

  const handleTeachTableFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processTeachTableFile(file);
  };

  const updateReviewRow = (key: string, patch: Partial<AssignmentReviewRow>) => {
    setReviewRows((prev) =>
      applyReviewValidation(prev?.map((row) => {
        if (row.key !== key) return row;
        const next: AssignmentReviewRow = { ...row, ...patch };
        if (patch.teacherId !== undefined) {
          next.teacherMatchConfidence = patch.teacherId ? 'manual' : null;
          if (patch.teacherId) {
            next.warnings = (next.warnings ?? []).filter((warning) => warning !== 'กรุณาตรวจสอบ');
          }
        }
        return validateReviewRow(next);
      }) ?? []) || null
    );
  };

  const confirmImport = async () => {
    if (!reviewRows || !currentUser.schoolId || !selectedSemesterId) return;

    const validRows = reviewRows.filter((r) => r.issues.length === 0);
    if (validRows.length === 0) {
      setError('ไม่มีแถวที่พร้อมนำเข้า — แก้ไขรายการที่มีปัญหาก่อน');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = validRows.flatMap((row) => {
        const teacherLabelById = (teacherId: string) => {
          const teacher = teachers.find((item) => item.id === teacherId);
          if (teacher) return teacherLabel(teacher);
          const allTeacherIds = uniqueTeacherIds(row.teacherId, row.coTeacherIds);
          return row.teacherSourceNames[allTeacherIds.indexOf(teacherId)] ?? '';
        };
        return expandSharedAssignmentRows(
          {
            school_id: currentUser.schoolId!,
            semester_id: selectedSemesterId,
            subject_id: row.subjectId!,
            classroom_id: row.classroomId!,
            hours_per_week: row.hoursPerWeek,
            hours_per_semester: row.hoursPerSemester,
            status: 'pending' as const,
            created_by: currentUser.id,
          },
          row.teacherId!,
          row.coTeacherIds,
          teacherLabelById,
        ).map((assignmentPayload) => {
          const existing = assignments.find((assignment) =>
            assignment.teacher_id === assignmentPayload.teacher_id &&
            assignment.subject_id === assignmentPayload.subject_id &&
            assignment.classroom_id === assignmentPayload.classroom_id,
          );
          return existing
            ? { ...assignmentPayload, status: existing.status }
            : assignmentPayload;
        });
      });

      const { error: insertError } = await supabase
        .from('teaching_assignments')
        .upsert(payload, {
          onConflict: 'semester_id,teacher_id,subject_id,classroom_id',
          ignoreDuplicates: false,
        });

      let importedWithoutCoTeacherName = false;
      if (insertError && isMissingCoTeacherNameColumn(insertError)) {
        const payloadWithoutCoTeacherName = payload.map(({ co_teacher_name: _coTeacherName, ...row }) => row);
        const { error: retryError } = await supabase
          .from('teaching_assignments')
          .upsert(payloadWithoutCoTeacherName, {
            onConflict: 'semester_id,teacher_id,subject_id,classroom_id',
            ignoreDuplicates: false,
          });
        if (retryError) throw retryError;
        importedWithoutCoTeacherName = true;
      } else if (insertError) {
        throw insertError;
      }

      const skipped = reviewRows.length - validRows.length;
      setMessage(
        `นำเข้า ${validRows.length} รายวิชา · มอบหมายให้ครู ${payload.length} รายการ (สถานะ: ปิดไว้ก่อน)` +
          (skipped > 0 ? ` · ข้าม ${skipped} แถวที่มีปัญหา` : '') +
          (importedWithoutCoTeacherName ? ' · ฐานยังไม่มีคอลัมน์ชื่อครูร่วม แต่ยังสร้างรายการให้ครูทุกคนแล้ว' : '')
      );
      setReviewRows(null);
      setReviewImportMeta(null);
      await loadAssignments();
    } catch (err) {
      setError(getErrorMessage(err, 'นำเข้าไม่สำเร็จ'));
    } finally {
      setSaving(false);
    }
  };

  const teacherLabel = (t: Profile) => `${t.title ? t.title + ' ' : ''}${t.full_name}`;
  const teachingStaff = teachers;

  const subjectSemesterLabel = (assignment: AssignmentWithProgress) => {
    const semester = assignment.subject?.semester_number ?? semesters.find((item) => item.id === assignment.semester_id)?.semester_number;
    return semester ? `ภาค ${semester}` : 'รายปี';
  };

  const subjectLevelLabel = (assignment: AssignmentWithProgress) =>
    assignment.classroom?.name ??
    assignment.subject?.default_class_level ??
    assignment.classroom?.class_level_code ??
    '—';

  const hoursLabel = (assignment: AssignmentWithProgress) => {
    const week = assignment.hours_per_week ?? '-';
    const semester = assignment.hours_per_semester ?? '-';
    return `${week}/${semester}`;
  };

  const compactList = (items: string[], fallback = '—') => {
    if (items.length === 0) return fallback;
    if (items.length <= 4) return items.join(', ');
    return `${items.slice(0, 4).join(', ')} +${items.length - 4}`;
  };

  const updateReviewTeacher = (key: string, teacherIndex: number, teacherId: string) => {
    setReviewRows((prev) =>
      applyReviewValidation(prev?.map((row) => {
        if (row.key !== key) return row;

        const selectedIds = [row.teacherId ?? '', row.coTeacherIds[0] ?? '', row.coTeacherIds[1] ?? ''];
        selectedIds[teacherIndex] = teacherId;
        if (teacherId) {
          selectedIds.forEach((id, index) => {
            if (index !== teacherIndex && id === teacherId) selectedIds[index] = '';
          });
        }

        const selectedProfiles = selectedIds.map((id) => teachers.find((teacher) => teacher.id === id) ?? null);
        const teacherNames = selectedProfiles.map((profile, index) => (
          profile ? teacherLabel(profile) : (row.teacherSourceNames[index] ?? '')
        ));
        const coTeacherMatchConfidences = [...(row.coTeacherMatchConfidences ?? [])];
        if (teacherIndex > 0) coTeacherMatchConfidences[teacherIndex - 1] = teacherId ? 'manual' : null;

        return validateReviewRow({
          ...row,
          teacherId: selectedIds[0] || null,
          teacherName: teacherNames[0] || row.teacherName,
          teacherMatchConfidence: teacherIndex === 0 ? (teacherId ? 'manual' : null) : row.teacherMatchConfidence,
          coTeacherIds: selectedIds.slice(1),
          coTeacherName: teacherNames.slice(1).filter(Boolean).join(', '),
          coTeacherMatchConfidences,
          warnings: (row.warnings ?? []).filter(
            (warning) => !warning.includes(`ครูผู้สอน ${teacherIndex + 1}`),
          ),
        });
      }) ?? []) || null,
    );
  };

  const renderAssignmentApprovalStatus = (assignment: AssignmentWithProgress) => {
    const gradebook = normalizeGradebook(assignment.gradebooks);
    const statusClass = (className: string) =>
      `inline-flex items-center justify-center text-xs font-extrabold ${className}`;

    if (!gradebook) {
      return (
        <span className={statusClass('text-slate-500')}>
          ยังไม่ได้ส่ง
        </span>
      );
    }

    if (assignment.gradebook_status !== 'completed') {
      if (assignment.completion_percent >= 100) {
        return (
          <span className={statusClass('text-amber-700')}>
            รอครูส่ง ปพ.5
          </span>
        );
      }

      const displayStatus = resolveGradebookStatus(
        assignment.gradebook_status,
        assignment.completion_percent,
      );
      return (
        <span className={statusClass(gradebookStatusTextClassName(displayStatus))}>
          {gradebookStatusLabel(displayStatus, assignment.completion_percent)}
        </span>
      );
    }

    if (assignment.approval_status === 'approved') {
      return (
        <span className={statusClass('text-emerald-700')}>
          อนุมัติแล้ว
        </span>
      );
    }

    if (assignment.approval_status === 'revision_requested') {
      return (
        <span className={statusClass('text-rose-700')}>
          รอแก้ไข
        </span>
      );
    }

    return (
      <span className={statusClass('text-blue-700')}>
        รออนุมัติ
      </span>
    );
  };

  const renderAssignmentApprovalActions = (assignment: AssignmentWithProgress) => {
    const gradebook = normalizeGradebook(assignment.gradebooks);
    if (!gradebook || assignment.gradebook_status !== 'completed' || assignment.approval_status === 'approved' || assignment.approval_status === 'revision_requested') {
      return <span className="text-xs font-semibold text-slate-300">-</span>;
    }

    return (
      <div className="flex flex-wrap justify-center gap-1.5">
        <button
          type="button"
          onClick={() =>
            openApprovalDialog(
              'approve',
              [gradebook.id],
              'อนุมัติ ปพ.5',
              `ต้องการอนุมัติ ปพ.5 รายวิชา ${assignment.subject?.subject_name ?? 'นี้'} ใช่หรือไม่?`,
            )
          }
          disabled={approvalSaving}
          className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          อนุมัติ
        </button>
        <button
          type="button"
          onClick={() =>
            openApprovalDialog(
              'reject',
              [gradebook.id],
              'ไม่อนุมัติ ปพ.5',
              `ไม่อนุมัติ ปพ.5 รายวิชา ${assignment.subject?.subject_name ?? 'นี้'} ใช่หรือไม่?`,
            )
          }
          disabled={approvalSaving}
          className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ไม่อนุมัติ
        </button>
      </div>
    );
  };

  const teachTableAccept = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  return (
    <div className="space-y-6">
      {drilldownLabel && onDrilldownBack ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">กรอก ปพ.5 ตามระดับชั้น</p>
            <p className="mt-1 text-lg font-extrabold text-slate-900">{drilldownLabel}</p>
          </div>
          <button type="button" onClick={onDrilldownBack} className="btn btn-secondary">
            <ArrowLeft className="h-4 w-4" />
            กลับข้อมูล ปพ.5
          </button>
        </div>
      ) : null}

      {!selectedTeacherId && (
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h4 className="text-[22px] font-extrabold tracking-tight text-slate-900">จัดการ ปพ.5</h4>
          <p className="text-sm text-slate-500 mt-1">
            กำหนดครูแต่ละคนให้กรอกเกรดตามชั้นเรียน รายวิชา และภาคเรียนที่เปิดใช้งาน
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openTeachTableUpload}
            disabled={importing}
            className="btn btn-secondary"
          >
            {importing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            เพิ่มจากตารางสอน (Word)
          </button>
          <button
            type="button"
            onClick={() => openAddModal()}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4 mr-2" /> เพิ่มรายการ
          </button>
          <button
            type="button"
            onClick={() =>
              openApprovalDialog(
                'approve',
                allPendingApprovalGradebookIds,
                'อนุมัติทั้งหมด',
                `ต้องการอนุมัติ ปพ.5 ที่รออนุมัติทั้งหมด ${allPendingApprovalGradebookIds.length} รายการใช่หรือไม่?`,
              )
            }
            disabled={approvalSaving || allPendingApprovalGradebookIds.length === 0}
            className="btn border border-emerald-600 bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-sm hover:from-emerald-600 hover:to-emerald-700"
          >
            {approvalSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            อนุมัติทั้งหมด
          </button>
        </div>
      </div>
      )}

      {selectedTeacherId && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h4 className="text-[22px] font-extrabold tracking-tight text-slate-900">
              {selectedTeacher ? `${selectedTeacher.title ? selectedTeacher.title + ' ' : ''}${selectedTeacher.full_name}` : 'รายละเอียดครู'}
            </h4>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedTeacherId(null)}
              className="btn btn-secondary"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              กลับไปรายชื่อครู
            </button>
            <button
              type="button"
              onClick={() => openAddModal(selectedTeacherId)}
              className="btn btn-primary"
            >
              <Plus className="mr-2 h-4 w-4" />
              เพิ่มรายการให้ครูคนนี้
            </button>
            <button
              type="button"
              onClick={() =>
                openApprovalDialog(
                  'approve',
                  selectedTeacherPendingApprovalGradebookIds,
                  'อนุมัติ ปพ.5 ทุกวิชา',
                  `ต้องการอนุมัติ ปพ.5 ที่รออนุมัติของครูคนนี้ ${selectedTeacherPendingApprovalGradebookIds.length} รายการใช่หรือไม่?`,
                )
              }
              disabled={approvalSaving || selectedTeacherPendingApprovalGradebookIds.length === 0}
              className="btn border border-emerald-600 bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-sm hover:from-emerald-600 hover:to-emerald-700"
            >
              {approvalSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              อนุมัติ ปพ.5 ทุกวิชา
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm whitespace-pre-line">{error}</div>
      )}
      {message && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-3 rounded-xl text-sm">{message}</div>
      )}

      {!selectedTeacherId && (
      <FilterBar fill>
        <FilterSearch
          label="ครูผู้สอน"
          value={teacherSearch}
          onChange={setTeacherSearch}
          placeholder="ค้นหาชื่อครู"
        />
        <FilterSelect
          label="ภาคเรียน"
          value={selectedSemesterId}
          onChange={setSelectedSemesterId}
        >
          {semesters.map((s) => (
            <option key={s.id} value={s.id}>
              ภาค {s.semester_number}{s.is_active ? ' (เปิดอยู่)' : ''}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="สถานะ"
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as 'all' | AssignmentStatus)}
        >
          <option value="all">ทั้งหมด</option>
          <option value="active">เปิดใช้งาน</option>
          <option value="pending">ปิดอยู่</option>
        </FilterSelect>
        <FilterSelect
          label="วิชา"
          value={subjectFilter}
          onChange={setSubjectFilter}
        >
          <option value="all">ทุกวิชา</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.subject_code} — {subject.subject_name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="ชั้น/ห้อง"
          value={classroomFilter}
          onChange={setClassroomFilter}
        >
          <option value="all">ทุกชั้น/ห้อง</option>
          {classrooms.map((classroom) => (
            <option key={classroom.id} value={classroom.id}>{classroom.name}</option>
          ))}
        </FilterSelect>
        <FilterClearButton onClick={clearAssignmentFilters} disabled={!hasActiveAssignmentFilters} />
      </FilterBar>
      )}

      {selectedTeacherId && selectedSummary && (
        <AssignmentSummaryCards
          subjectCount={selectedSummary.subjectCount}
          classLevelNames={selectedSummary.classLevelNames}
          classroomNames={selectedSummary.classroomNames}
          progress={selectedSummary.progress}
        />
      )}

      <div className="ui-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="w-6 h-6 mr-2 animate-spin" /> กำลังโหลด...
          </div>
        ) : selectedTeacherId && selectedAssignments.length === 0 ? (
          <div className="text-center py-16 text-slate-400">ยังไม่มีรายการมอบหมายของครูคนนี้ตามเงื่อนไขที่เลือก</div>
        ) : !selectedTeacherId && teacherSummaries.length === 0 ? (
          <div className="text-center py-16 text-slate-400">ยังไม่มีรายการมอบหมายในภาคนี้</div>
        ) : selectedTeacherId ? (
          <div className="space-y-3">
            {selectedAssignmentCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3">
              <p className="text-xs font-semibold text-slate-500">
                เลือกแล้ว {selectedAssignmentCount} / {selectedAssignments.length} รายการ
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    openBulkApprovalEditDialog(
                      selectedAssignmentGradebookIds,
                      'แก้ไขสถานะ ปพ.5',
                      `แก้ไขสถานะ ปพ.5 ของรายการที่เลือก ${selectedAssignmentGradebookIds.length} รายการ`,
                    )
                  }
                  disabled={approvalSaving || selectedAssignmentGradebookIds.length === 0}
                  className="inline-flex items-center rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Edit3 className="mr-1 h-3.5 w-3.5" />
                  แก้ไขสถานะ ปพ.5
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSelectedAssignments()}
                  disabled={saving || selectedAssignmentCount === 0}
                  className="inline-flex items-center rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  ลบที่เลือก
                </button>
                <button
                  type="button"
                  onClick={() => void deleteAllSelectedTeacherAssignments()}
                  disabled={saving || selectedAssignments.length === 0}
                  className="inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  ลบทั้งหมด
                </button>
              </div>
            </div>
            ) : null}
            <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] table-fixed text-sm">
              <colgroup>
                <col style={{ width: '4%' }} />
                <col style={{ width: '4.5%' }} />
                <col style={{ width: '6.3%' }} />
                <col style={{ width: '6.3%' }} />
                <col style={{ width: '18.9%' }} />
                <col style={{ width: '13.5%' }} />
                <col style={{ width: '8.1%' }} />
                <col style={{ width: '7.2%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '12.2%' }} />
                <col style={{ width: '9%' }} />
              </colgroup>
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-center font-semibold">
                    <input
                      type="checkbox"
                      checked={allSelectedAssignmentsChecked}
                      onChange={(event) => toggleAllSelectedTeacherAssignments(event.target.checked)}
                      aria-label="เลือกรายการทั้งหมด"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-center font-semibold">ลำดับ</th>
                  <th className="px-4 py-3 text-center font-semibold">รหัสวิชา</th>
                  <th className="px-4 py-3 text-center font-semibold">ภาคเรียนที่</th>
                  <th className="px-4 py-3 text-center font-semibold">ชื่อวิชา</th>
                  <th className="px-4 py-3 text-center font-semibold">กลุ่มสาระ</th>
                  <th className="px-4 py-3 text-center font-semibold">ระดับชั้น/ห้อง</th>
                  <th className="px-4 py-3 text-center font-semibold">ชม.เรียน/สัปดาห์/ภาค</th>
                  <th className="px-4 py-3 text-center font-semibold">สถานะ</th>
                  <th className="px-4 py-3 text-center font-semibold">การดำเนินการ</th>
                  <th className="px-4 py-3 text-center font-semibold">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedAssignments.map((assignment, index) => {
                  return (
                  <tr
                    key={assignment.id}
                    onClick={() => void handleOpenAssignmentGradebook(assignment)}
                    className="cursor-pointer transition-colors hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-4 text-center" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedAssignmentIds.has(assignment.id)}
                        onChange={(event) => toggleAssignmentSelection(assignment.id, event.target.checked)}
                        aria-label={`เลือกรายการที่ ${index + 1}`}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-4 text-center font-semibold text-slate-500">{index + 1}</td>
                    <td className="px-4 py-4 text-center font-mono font-semibold text-slate-800">{assignment.subject?.subject_code ?? '—'}</td>
                    <td className="px-4 py-4 text-center text-slate-600">{subjectSemesterLabel(assignment)}</td>
                    <td className="px-4 py-4 text-center font-semibold text-slate-900">{assignment.subject?.subject_name ?? '—'}</td>
                    <td className="px-4 py-4 text-center text-slate-600">{assignment.subject?.learning_area ?? '—'}</td>
                    <td className="px-4 py-4 text-center font-semibold text-slate-700">{subjectLevelLabel(assignment)}</td>
                    <td className="px-4 py-4 text-center font-mono font-semibold text-slate-700">{hoursLabel(assignment)}</td>
                    <td className="px-4 py-4 text-center">
                      {renderAssignmentApprovalStatus(assignment)}
                    </td>
                    <td className="px-2 py-4 text-center" onClick={(event) => event.stopPropagation()}>
                      {renderAssignmentApprovalActions(assignment)}
                    </td>
                    <td className="px-4 py-4 text-center" onClick={(event) => event.stopPropagation()}>
                      <div className="flex justify-center gap-2">
                        {onOpenGradebook && (
                          <button
                            type="button"
                            onClick={() => void handleOpenAssignmentGradebook(assignment)}
                            aria-label="เปิดสมุด ปพ.5"
                            title="เปิดสมุด ปพ.5"
                            disabled={openingGradebookAssignmentId === assignment.id}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60"
                          >
                            {openingGradebookAssignmentId === assignment.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEditModal(assignment)}
                          aria-label="แก้ไข"
                          title="แก้ไข"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(assignment.id)}
                          aria-label="ลบ"
                          title="ลบ"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
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
          <div className="space-y-3">
            {selectedTeacherSummaryCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3">
              <p className="text-xs font-semibold text-slate-500">
                เลือกแล้ว {selectedTeacherSummaryCount} / {teacherSummaries.length} รายการ
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    openBulkApprovalEditDialog(
                      selectedTeacherSummaryGradebookIds,
                      'แก้ไขสถานะ ปพ.5',
                      `แก้ไขสถานะ ปพ.5 ของครูที่เลือก ${selectedTeacherSummaryGradebookIds.length} รายการ`,
                    )
                  }
                  disabled={approvalSaving || selectedTeacherSummaryGradebookIds.length === 0}
                  className="inline-flex items-center rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Edit3 className="mr-1 h-3.5 w-3.5" />
                  แก้ไขสถานะ ปพ.5
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSelectedTeacherSummaries()}
                  disabled={saving || selectedTeacherSummaryAssignmentIds.length === 0}
                  className="inline-flex items-center rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  ลบที่เลือก
                </button>
                <button
                  type="button"
                  onClick={() => void deleteAllTeacherSummaries()}
                  disabled={saving || allTeacherSummaryAssignmentIds.length === 0}
                  className="inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  ลบทั้งหมด
                </button>
              </div>
            </div>
            ) : null}
            <div className="overflow-x-auto">
            <table className="w-full min-w-[1160px] text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3 text-center font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={allTeacherSummariesChecked}
                      onChange={(event) => toggleAllTeacherSummaries(event.target.checked)}
                      aria-label="เลือกรายการครูทั้งหมด"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="text-center px-5 py-3 font-semibold text-slate-600">ลำดับ</th>
                  <th className="text-center px-5 py-3 font-semibold text-slate-600">ครูผู้สอน</th>
                  <th className="text-center px-5 py-3 font-semibold text-slate-600">จำนวนวิชา</th>
                  <th className="text-center px-5 py-3 font-semibold text-slate-600">ชั้นเรียนที่สอน</th>
                  <th className="text-center px-5 py-3 font-semibold text-slate-600">สถานะ</th>
                  <th className="text-center px-5 py-3 font-semibold text-slate-600">การอนุมัติ</th>
                  <th className="text-center px-5 py-3 font-semibold text-slate-600">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {teacherSummaries.map((summary, index) => {
                  const approval = approvalSummary(summary.assignments);
                  return (
                  <tr
                    key={summary.teacherId}
                    className="cursor-pointer border-b border-slate-50 transition-colors hover:bg-slate-50/70"
                    onClick={() => setSelectedTeacherId(summary.teacherId)}
                  >
                    <td className="px-5 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedTeacherSummaryIds.has(summary.teacherId)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => toggleTeacherSummarySelection(summary.teacherId, event.target.checked)}
                        aria-label={`เลือกครูแถวที่ ${index + 1}`}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-5 py-4 text-center font-semibold text-slate-500">{index + 1}</td>
                    <td className="px-5 py-4 font-semibold text-slate-900">
                      {summary.teacher ? `${summary.teacher.title ? summary.teacher.title + ' ' : ''}${summary.teacher.full_name}` : '—'}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-800">
                        {summary.subjectCount} วิชา
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center text-slate-700">{compactList(summary.classLevelNames)}</td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <span
                          className={`inline-flex min-w-[132px] items-center justify-center rounded-lg px-3 py-1.5 text-xs font-extrabold ${teacherEntryStatusClassName(summary.entryStatus)}`}
                        >
                          {teacherEntryStatusLabel(summary.entryStatus)}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400">
                          ส่งแล้ว {summary.completedCount} / {summary.assignments.length} · {summary.progress}%
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span
                        className={`inline-flex min-w-[112px] items-center justify-center rounded-lg px-3 py-1.5 text-xs font-extrabold ${approval.className}`}
                      >
                        {approval.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedTeacherId(summary.teacherId);
                          }}
                          className="inline-flex items-center px-2.5 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"
                        >
                          <Edit3 className="w-3.5 h-3.5 mr-1" />
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void deleteAssignmentsByIds(
                              summary.assignments.map((assignment) => assignment.id),
                              `ลบรายการมอบหมายของ ${summary.teacher?.full_name ?? 'ครูคนนี้'} ทั้งหมด ${summary.assignments.length} รายการ?`,
                            );
                          }}
                          className="inline-flex items-center rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100"
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
        )}
      </div>

      <footer className="pb-2 pt-4 text-center">
        <p className="text-sm font-semibold text-slate-500">KSP GradeBook V 1.0</p>
        <p className="mt-0.5 text-xs text-slate-400">โรงเรียนกาฬสินธุ์ปัญญานุกูล จังหวัดกาฬสินธุ์</p>
      </footer>

      {approvalDialog && createPortal((
        <div className="fixed inset-0 z-[280] grid place-items-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">{approvalDialog.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{approvalDialog.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setApprovalDialog(null)}
                className="text-slate-400 hover:text-slate-600"
                disabled={approvalSaving}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {approvalDialog.mode === 'reject' && (
              <div className="mb-5">
                <label className="mb-1.5 block text-sm font-bold text-slate-700">เหตุผลที่ไม่อนุมัติ</label>
                <textarea
                  value={approvalReason}
                  onChange={(event) => setApprovalReason(event.target.value)}
                  rows={5}
                  className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-[3px] focus:ring-blue-100"
                  placeholder="ระบุข้อแก้ไขที่ต้องการแจ้งครู..."
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setApprovalDialog(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                disabled={approvalSaving}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void handleApprovalSave()}
                disabled={approvalSaving}
                className={`inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60 ${
                  approvalDialog.mode === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {approvalSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {approvalDialog.mode === 'approve' ? 'อนุมัติ' : 'บันทึกไม่อนุมัติ'}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {bulkApprovalEdit && createPortal((
        <div className="fixed inset-0 z-[280] grid place-items-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">{bulkApprovalEdit.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{bulkApprovalEdit.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setBulkApprovalEdit(null)}
                className="text-slate-400 hover:text-slate-600"
                disabled={approvalSaving}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">สถานะ ปพ.5</label>
                <select
                  value={bulkApprovalEdit.status}
                  onChange={(event) =>
                    setBulkApprovalEdit((current) =>
                      current ? { ...current, status: event.target.value as GradebookApprovalStatus } : current,
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                >
                  <option value="pending">รออนุมัติ</option>
                  <option value="approved">อนุมัติแล้ว</option>
                  <option value="revision_requested">รอแก้ไข</option>
                </select>
              </div>

              {bulkApprovalEdit.status === 'revision_requested' && (
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">เหตุผลที่ให้แก้ไข</label>
                  <textarea
                    value={bulkApprovalEdit.reason}
                    onChange={(event) =>
                      setBulkApprovalEdit((current) =>
                        current ? { ...current, reason: event.target.value } : current,
                      )
                    }
                    rows={5}
                    className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-[3px] focus:ring-blue-100"
                    placeholder="ระบุเหตุผลเพื่อให้ครูเห็นในหน้าส่งแก้ไข..."
                  />
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkApprovalEdit(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                disabled={approvalSaving}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void handleBulkApprovalEditSave()}
                disabled={approvalSaving}
                className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {approvalSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                บันทึก
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {showAddModal && createPortal((
        <div className="fixed inset-0 z-[260] grid place-items-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900">
                {editingAssignment ? 'แก้ไขรายการมอบหมาย' : 'เพิ่มรายการมอบหมาย'}
              </h3>
              <button type="button" onClick={closeAssignmentModal} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveAssignment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ระดับชั้นเรียน</label>
                <select
                  value={modalLevelFilter}
                  onChange={(e) => handleModalLevelChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                >
                  <option value="">— ทุกระดับชั้น —</option>
                  {modalClassLevelOptions.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ห้องเรียน</label>
                <select
                  value={addForm.classroom_id}
                  onChange={(e) => setAddForm((f) => ({ ...f, classroom_id: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl"
                  required
                >
                  <option value="">— เลือก —</option>
                  {modalClassrooms.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ครูผู้สอน</label>
                <select
                  value={addForm.teacher_id}
                  onChange={(e) => handleModalTeacherChange(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl"
                  required
                >
                  <option value="">— เลือก —</option>
                  {modalTeachers.map((t) => (
                    <option key={t.id} value={t.id}>{teacherLabel(t)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[0, 1].map((index) => (
                  <div key={index}>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      ครูผู้สอนร่วม {index + 2} <span className="font-normal text-slate-400">(ถ้ามี)</span>
                    </label>
                    <select
                      value={addForm.co_teacher_ids[index] ?? ''}
                      onChange={(e) => handleModalCoTeacherChange(index, e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl"
                    >
                      <option value="">— ไม่มี —</option>
                      {modalTeachers
                        .filter((teacher) =>
                          teacher.id !== addForm.teacher_id &&
                          !addForm.co_teacher_ids.some((selectedId, selectedIndex) =>
                            selectedIndex !== index && selectedId === teacher.id,
                          ),
                        )
                        .map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>{teacherLabel(teacher)}</option>
                        ))}
                    </select>
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">วิชา</label>
                <select
                  value={addForm.subject_id}
                  onChange={(e) => setSubjectAndHours(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl"
                  required
                >
                  <option value="">— เลือก —</option>
                  {modalSubjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.subject_code} — {s.subject_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ชม./สัปดาห์</label>
                  <input
                    type="number"
                    min={0}
                    value={addForm.hours_per_week}
                    onChange={(e) => setAddForm((f) => ({ ...f, hours_per_week: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ชม./ภาค</label>
                  <input
                    type="number"
                    min={0}
                    value={addForm.hours_per_semester}
                    onChange={(e) => setAddForm((f) => ({ ...f, hours_per_semester: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">สถานะ</label>
                <select
                  value={addForm.status}
                  onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value as AssignmentStatus }))}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl"
                >
                  <option value="active">เปิดใช้งานให้ครูเห็น</option>
                  <option value="pending">ปิดไว้ก่อน</option>
                </select>
              </div>
              {editingAssignment && canEditGradebookApprovalStatus && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <label className="block text-sm font-medium text-slate-700 mb-1">สถานะ ปพ.5</label>
                  <select
                    value={addForm.approval_status}
                    onChange={(e) =>
                      setAddForm((f) => ({
                        ...f,
                        approval_status: e.target.value as GradebookApprovalStatus,
                      }))
                    }
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="pending">รออนุมัติ</option>
                    <option value="approved">อนุมัติแล้ว</option>
                    <option value="revision_requested">รอแก้ไข</option>
                  </select>
                  {addForm.approval_status === 'revision_requested' && (
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-slate-700 mb-1">เหตุผลที่ให้แก้ไข</label>
                      <textarea
                        value={addForm.approval_reason}
                        onChange={(e) => setAddForm((f) => ({ ...f, approval_reason: e.target.value }))}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5"
                        placeholder="ระบุเหตุผลเพื่อให้ครูเห็นในหน้าส่งแก้ไข"
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeAssignmentModal}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-50"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ), document.body)}

      {showTeachTableUpload &&
        createPortal(
          <div className="fixed inset-0 z-[200] overflow-y-auto bg-slate-900/50 backdrop-blur-sm">
            <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
              <div className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">อัปโหลดตารางสอน</h3>
                    <p className="mt-1 text-sm text-slate-500">เลือกไฟล์ Word (.docx) ก่อนตรวจสอบและนำเข้า</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTeachTableUpload(false)}
                    className="text-slate-400 hover:text-slate-600"
                    disabled={importing}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4 px-6 py-5">
                  {error ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                      {error}
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-slate-600">
                    <p className="font-semibold text-slate-800">รองรับไฟล์ตารางสอน Word</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      <li>ใช้ข้อมูลตารางจากไฟล์ Word โดยตรง จึงรวดเร็วและแม่นยำกว่า OCR จาก PDF</li>
                      <li>อ่านเฉพาะวิชาหลัก (มีรหัสวิชา 5 หลัก)</li>
                      <li>รวมรายวิชาเดียวกันเป็นหนึ่งแถว พร้อมครูผู้สอนสูงสุด 3 คน</li>
                      <li>ไม่นำเข้ากิจกรรม เช่น ลูกเสือ, ชุมนุม, แนะแนว, หน้าเสาธง, อบรมคุณธรรม</li>
                      <li>ไม่มอบหมายให้รองผู้อำนวยการ / คณะบริหาร — เฉพาะครูผู้สอน</li>
                    </ul>
                  </div>

                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10 transition hover:border-blue-300 hover:bg-blue-50/40">
                    {importing ? (
                      <>
                        <Loader2 className="mb-3 h-8 w-8 animate-spin text-blue-600" />
                        <span className="text-sm font-semibold text-slate-700">
                          กำลังอ่านไฟล์ตารางสอน Word...
                        </span>
                      </>
                    ) : (
                      <>
                        <FileUp className="mb-3 h-8 w-8 text-blue-600" />
                        <span className="text-sm font-semibold text-slate-800">คลิกเพื่อเลือกไฟล์ .docx</span>
                        <span className="mt-1 text-xs text-slate-500">เช่น ตารางรวม ม.1, ป.1-3 หรือแยกรายชั้น</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept={teachTableAccept}
                      className="hidden"
                      disabled={importing}
                      onChange={(e) => void handleTeachTableFileChange(e)}
                    />
                  </label>
                </div>

                <div className="border-t border-slate-100 px-6 py-4">
                  <button
                    type="button"
                    onClick={() => setShowTeachTableUpload(false)}
                    disabled={importing}
                    className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {reviewRows &&
        createPortal(
          <div className="fixed inset-0 z-[200] overflow-y-auto bg-slate-900/50 backdrop-blur-sm">
            <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
              <div className="my-8 flex w-full max-w-[96rem] max-h-[min(90vh,calc(100vh-3rem))] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
                <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">ตรวจสอบก่อนนำเข้า</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {reviewImportMeta
                        ? `ไฟล์ ${reviewImportMeta.fileName} · อ่านได้ ${reviewImportMeta.rowCount.toLocaleString('th-TH')} รายการ · ห้อง ${reviewImportMeta.classrooms.join(', ')}`
                        : 'แก้ไขรายการที่ map ไม่ได้ แล้วกดยืนยัน'}
                      {' — '}จะบันทึกเป็นสถานะ &quot;ปิดไว้ก่อน&quot;
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReviewRows(null);
                      setReviewImportMeta(null);
                    }}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  <table className="w-full min-w-[1380px] border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="sticky top-0 z-20 w-12 border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left font-semibold text-slate-600 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]">แถว</th>
                        <th className="sticky top-0 z-20 min-w-64 border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left font-semibold text-slate-600 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]">รหัสวิชา / ชื่อวิชา</th>
                        <th className="sticky top-0 z-20 min-w-56 border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left font-semibold text-slate-600 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]">ครูผู้สอน 1</th>
                        <th className="sticky top-0 z-20 min-w-56 border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left font-semibold text-slate-600 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]">ครูผู้สอน 2</th>
                        <th className="sticky top-0 z-20 min-w-56 border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left font-semibold text-slate-600 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]">ครูผู้สอน 3</th>
                        <th className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left font-semibold text-slate-600 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]">ห้อง</th>
                        <th className="sticky top-0 z-20 min-w-60 border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left font-semibold text-slate-600 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]">หมายเหตุ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewRows.map((row) => (
                        <tr
                          key={row.key}
                          className={`border-b border-slate-50 ${
                            row.issues.length
                              ? 'bg-red-50/40'
                              : (row.warnings?.length ?? 0) > 0
                                ? 'bg-amber-50/40'
                                : ''
                          }`}
                        >
                          <td className="px-3 py-3 text-slate-500">{row.line}</td>
                          <td className="px-3 py-3">
                            <div className="mb-1 text-xs text-slate-500">
                              {row.subjectCode} {row.subjectName}
                            </div>
                            <select
                              value={row.subjectId ?? ''}
                              onChange={(e) => updateReviewRow(row.key, { subjectId: e.target.value || null })}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                            >
                              <option value="">— เลือกวิชา —</option>
                              {subjects.map((s) => (
                                <option key={s.id} value={s.id}>{s.subject_code} — {s.subject_name}</option>
                              ))}
                            </select>
                          </td>
                          {[0, 1, 2].map((teacherIndex) => {
                            const teacherId = teacherIndex === 0
                              ? row.teacherId ?? ''
                              : row.coTeacherIds[teacherIndex - 1] ?? '';
                            const sourceName = row.teacherSourceNames[teacherIndex] ?? '';
                            return (
                              <td key={teacherIndex} className="px-3 py-3 align-top">
                                <div className="mb-1 min-h-4 truncate text-xs text-slate-500" title={sourceName}>
                                  {sourceName || '—'}
                                </div>
                                <SearchableTeacherSelect
                                  value={teacherId}
                                  teachers={teachingStaff}
                                  getLabel={teacherLabel}
                                  placeholder={`— เลือกครูผู้สอน ${teacherIndex + 1} —`}
                                  onChange={(nextTeacherId) =>
                                    updateReviewTeacher(row.key, teacherIndex, nextTeacherId)
                                  }
                                />
                              </td>
                            );
                          })}
                          <td className="px-3 py-3">
                            <div className="mb-1 text-xs text-slate-500">{row.classroomName}</div>
                            <select
                              value={row.classroomId ?? ''}
                              onChange={(e) => updateReviewRow(row.key, { classroomId: e.target.value || null })}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                            >
                              <option value="">— เลือกห้อง —</option>
                              {classrooms.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-3">
                            {row.issues.length > 0 ? (
                              <span className="inline-flex items-center text-xs font-medium text-red-600">
                                <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                                {row.issues.join(', ')}
                              </span>
                            ) : (row.warnings?.length ?? 0) > 0 ? (
                              <span className="inline-flex items-center text-xs font-medium text-amber-700">
                                <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                                {row.warnings.join(', ')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-xs font-medium text-emerald-600">
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                พร้อมนำเข้า
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex shrink-0 flex-col items-center justify-between gap-3 border-t border-slate-100 bg-white p-4 sm:flex-row">
                  <p className="text-sm text-slate-500">
                    พร้อมนำเข้า{' '}
                    {reviewRows.filter((r) => r.issues.length === 0 && (r.warnings?.length ?? 0) === 0).length}
                    {' · '}
                    กรุณาตรวจสอบ{' '}
                    {reviewRows.filter((r) => r.issues.length === 0 && (r.warnings?.length ?? 0) > 0).length}
                    {' · '}
                    มีปัญหา {reviewRows.filter((r) => r.issues.length > 0).length} (จาก {reviewRows.length} แถว)
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setReviewRows(null);
                        setReviewImportMeta(null);
                      }}
                      className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={() => void confirmImport()}
                      disabled={saving || reviewRows.every((r) => r.issues.length > 0)}
                      className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {saving ? 'กำลังนำเข้า...' : 'ยืนยันนำเข้า'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

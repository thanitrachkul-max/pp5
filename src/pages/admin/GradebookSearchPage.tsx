import React, { useCallback, useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { AlertCircle, ArrowLeft, BookOpenCheck, CheckCircle2, ChevronRight, Download, Eye, Loader2, Printer, Search, X } from 'lucide-react';
import { FilterDropdown } from '../../components/FilterBar';
import { ModalPortal } from '../../components/ModalPortal';
import { rowToAppData, type GradebookRow } from '../../lib/gradebookAdapter';
import { getStudentReportSummary } from '../../lib/gradebookStats';
import { applyPap5OfficialDisplayDefaults } from '../../lib/pap5Officials';
import { supabase } from '../../lib/supabase';
import { SUBJECTS_CATALOG } from '../../data/subjectsCatalog';
import { createPap5PdfFile, downloadPap5Pdf, savePap5PdfBlob } from '../../utils/pap5PdfPreview';
import { openPap5PrintDialog } from '../../utils/pap5PrintDialog';
import type { AppData, AppUser, GradebookApprovalStatus, Semester } from '../../types';

interface GradebookSearchPageProps {
  currentUser: AppUser;
  initialYearId?: string;
  onBackActionChange?: (action: (() => void) | null) => void;
}

type GradebookStatus = 'not_started' | 'in_progress' | 'completed';

interface CompletedGradebook {
  id: string;
  teaching_assignment_id: string;
  status: GradebookStatus;
  students: unknown;
  stats: Record<string, unknown> | null;
  attendance?: unknown;
  scores?: unknown;
  score_config?: unknown;
  attributes?: unknown;
  analytical?: unknown;
  indicators?: unknown;
  general_info?: unknown;
  primary_year?: AppData["primaryYear"];
  approval_status?: GradebookApprovalStatus | null;
  updated_at: string | null;
  created_at: string | null;
}

interface AssignmentReportRow {
  id: string;
  teacher_id: string;
  semester_id: string;
  hours_per_week: number | null;
  hours_per_semester: number | null;
  profiles?: {
    id: string;
    full_name: string;
    title: string | null;
    username: string | null;
  } | null;
  subjects?: {
    id: string;
    subject_code: string;
    subject_name: string;
    learning_area: string;
    default_class_level: string | null;
    hours_total: number | null;
    hours_per_week: number | null;
  } | null;
  classrooms?: {
    id: string;
    name: string;
    class_level_code: string;
  } | null;
}

interface CompletedReport {
  assignmentId: string;
  gradebook: CompletedGradebook;
  teacherId: string;
  teacherName: string;
  teacherUsername: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  studentNames: string;
  learningArea: string;
  classLevel: string;
  classroomName: string;
  semesterNumber: number | null;
  studentCount: number;
  completionPercent: number;
  completedAt: string | null;
  hoursTotal: number | null;
  isPrimaryLevel: boolean;
}

function normalizeStudents(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function profileName(profile: AssignmentReportRow['profiles']): string {
  if (!profile) return 'ไม่พบชื่อครู';
  return [profile.title, profile.full_name].filter(Boolean).join(' ');
}

function splitTeacherNames(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return ['-'];
  return trimmed
    .split(/\s*(?:\n|,|;|\/|、| และ )\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function statNumber(stats: Record<string, unknown> | null | undefined, key: string): number {
  const value = Number(stats?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function isSubjectSchemaMismatch(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String((err as { message?: unknown } | null)?.message ?? err ?? '');
  return (
    message.includes('schema cache')
    || message.includes('Could not find')
    || message.includes('column')
    || message.includes('PGRST204')
  );
}

function isCompletedGradebook(gradebook: Pick<CompletedGradebook, 'status' | 'stats'>): boolean {
  if (gradebook.status === 'completed') return true;
  return statNumber(gradebook.stats, 'completionPercent') >= 100;
}

const GRADEBOOK_LIST_SELECT = 'id, teaching_assignment_id, status, students, stats, updated_at, created_at';
const GRADEBOOK_DETAIL_SELECT = `${GRADEBOOK_LIST_SELECT}, attendance, scores, score_config, attributes, analytical, indicators, general_info, approval_status`;

function parseHours(value: unknown): number | null {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function catalogStudyHours(
  subjectCode: string,
  classLevel: string,
  semesterNumber: number | null,
): number | null {
  const code = subjectCode.trim();
  if (!code) return null;

  const matches = SUBJECTS_CATALOG.filter((item) => item.subject_code === code);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].hours_total;

  const byLevelAndSemester = matches.find(
    (item) => item.default_class_level === classLevel && item.semester_number === semesterNumber,
  );
  if (byLevelAndSemester) return byLevelAndSemester.hours_total;

  const byLevel = matches.find((item) => item.default_class_level === classLevel);
  if (byLevel) return byLevel.hours_total;

  if (semesterNumber != null) {
    const bySemester = matches.find((item) => item.semester_number === semesterNumber);
    if (bySemester) return bySemester.hours_total;
  }

  return matches[0].hours_total;
}

function resolveStudyHours(row: AssignmentReportRow, semesterNumber: number | null, classLevel: string): number | null {
  const fromAssignment = parseHours(row.hours_per_semester);
  if (fromAssignment != null) return fromAssignment;

  const subject = row.subjects;
  const fromSubject = parseHours(subject?.hours_total);
  if (fromSubject != null) return fromSubject;

  return catalogStudyHours(subject?.subject_code ?? '', classLevel, semesterNumber);
}

function hoursFromGradebookGeneralInfo(gradebook: CompletedGradebook): number | null {
  const generalInfo = (gradebook as GradebookRow).general_info as Record<string, unknown> | undefined;
  const raw = generalInfo?.hoursPerSemester ?? generalInfo?.hours_per_semester ?? generalInfo?.totalHours;
  return parseHours(raw);
}

function effectiveStudyHours(report: CompletedReport): number | null {
  const fromReport = parseHours(report.hoursTotal);
  if (fromReport != null) return fromReport;

  const fromGradebook = hoursFromGradebookGeneralInfo(report.gradebook);
  if (fromGradebook != null) return fromGradebook;

  return catalogStudyHours(report.subjectCode, report.classLevel, report.semesterNumber);
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
    .sort((a, b) => a.localeCompare(b, 'th'));
}

function formatCompletedDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatStudentNames(students: unknown[]): string {
  return normalizeStudents(students)
    .map((student, index) => studentName(student, index).name)
    .filter(Boolean)
    .join(', ');
}

function studentSearchText(students: unknown[]): string {
  return normalizeStudents(students)
    .map((student, index) => {
      const row = studentName(student, index);
      return [row.name, row.code].join(' ');
    })
    .join(' ');
}

function matchingStudentNames(students: unknown[], query: string): string[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];

  return normalizeStudents(students)
    .map((student, index) => studentName(student, index))
    .filter((row) => row.name.toLowerCase().includes(term) || row.code.toLowerCase().includes(term))
    .map((row) => row.name);
}

function studentName(student: unknown, index: number): { id: string; code: string; name: string } {
  const row = (student ?? {}) as Record<string, unknown>;
  const id = String(row.id ?? row.studentId ?? row.student_id ?? index);
  const code = String(
    row.studentCode ??
    row.student_code ??
    row.code ??
    row.studentId ??
    row.id ??
    index + 1,
  );
  const composedName = [
    row.title,
    row.firstName ?? row.first_name,
    row.lastName ?? row.last_name,
  ].filter(Boolean).join(' ');
  const name = String((row.fullName ?? row.full_name ?? row.name ?? composedName) || `นักเรียนคนที่ ${index + 1}`);
  return { id, code, name };
}

function studentCitizenId(student: unknown): string {
  const row = (student ?? {}) as Record<string, unknown>;
  const value = String(row.citizenId ?? row.citizen_id ?? '').trim();
  return value || '—';
}

function roomNumberLabel(classroomName: string): string {
  const trimmed = classroomName.trim();
  if (!trimmed) return '-';
  const parts = trimmed.split('/');
  return (parts.length > 1 ? parts[parts.length - 1] : trimmed).trim() || trimmed;
}

function isPrimaryClassLevel(classLevel: string): boolean {
  return classLevel.trim().startsWith('ป.');
}

function formatStudyHoursLabel(hoursTotal: number | null, isPrimaryLevel: boolean): string {
  if (hoursTotal == null) return isPrimaryLevel ? '— ชม./ปี' : '— ชม./ภาค';
  return isPrimaryLevel
    ? `${hoursTotal.toLocaleString('th-TH')} ชม./ปี`
    : `${hoursTotal.toLocaleString('th-TH')} ชม./ภาค`;
}

function reportDetailMetaLine(report: CompletedReport): string {
  return [
    report.subjectCode,
    report.classroomName,
    `ภาคเรียนที่ ${report.semesterNumber ?? '-'}`,
    `ครูผู้สอน ${report.teacherName}`,
    formatStudyHoursLabel(effectiveStudyHours(report), report.isPrimaryLevel),
  ].join(' · ');
}

function gradebookAppData(gradebook: CompletedGradebook): AppData {
  return rowToAppData(gradebook as GradebookRow);
}

function reportMetaLine(report: CompletedReport): string {
  return [
    `${report.classroomName} · ${report.classLevel}`,
    `ภาค ${report.semesterNumber ?? '-'}`,
    report.teacherName,
    report.learningArea,
    `${report.studentCount.toLocaleString('th-TH')} คน`,
    `ครบเมื่อ ${formatCompletedDate(report.completedAt)}`,
  ].join(' | ');
}

interface SearchFilterContext {
  searchTerm: string;
  classLevelFilter: string;
  classroomFilter: string;
  learningAreaFilter: string;
  subjectFilter: string;
  subjectFilterLabel: string;
  semesterFilter: string;
}

const LEVEL_GROUPS: Array<{
  title: string;
  codes: string[];
}> = [
  {
    title: 'ประถมศึกษา',
    codes: ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6'],
  },
  {
    title: 'มัธยมศึกษา',
    codes: ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'],
  },
];

const CLASS_LEVEL_ORDER = LEVEL_GROUPS.flatMap((group) => group.codes);

function compareThaiText(a: string, b: string): number {
  return a.localeCompare(b, 'th', { numeric: true, sensitivity: 'base' });
}

function classLevelSortIndex(classLevel: string): number {
  const index = CLASS_LEVEL_ORDER.indexOf(classLevel.trim());
  return index >= 0 ? index : CLASS_LEVEL_ORDER.length;
}

function compareReportsByLevel(a: CompletedReport, b: CompletedReport): number {
  return (
    classLevelSortIndex(a.classLevel) - classLevelSortIndex(b.classLevel)
    || compareThaiText(a.classroomName, b.classroomName)
    || (a.semesterNumber ?? 99) - (b.semesterNumber ?? 99)
    || compareThaiText(a.subjectCode, b.subjectCode)
    || compareThaiText(a.subjectName, b.subjectName)
  );
}

function sanitizeDownloadName(value: string, fallback = 'ไม่ระบุ'): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

function ensurePdfExtension(fileName: string): string {
  return fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
}

function buildBulkPdfPath(report: CompletedReport, fallbackFileName: string): string {
  const classLevel = sanitizeDownloadName(report.classLevel, 'ไม่ระบุระดับชั้น');
  const classroom = sanitizeDownloadName(roomNumberLabel(report.classroomName), 'ไม่ระบุห้อง');
  const subjectCode = sanitizeDownloadName(report.subjectCode, 'ไม่มีรหัส');
  const subjectName = sanitizeDownloadName(report.subjectName, 'รายวิชา');
  const semester = report.semesterNumber == null
    ? 'ไม่ระบุภาคเรียน'
    : `ภาคเรียนที่ ${report.semesterNumber}`;
  const fallbackBase = sanitizeDownloadName(fallbackFileName.replace(/\.pdf$/i, ''), 'แบบปพ.5');
  const fileName = ensurePdfExtension(
    sanitizeDownloadName(
      `ปพ.5 ${classLevel} ห้อง ${classroom} ${subjectCode} ${subjectName} ${semester}`,
      fallbackBase,
    ),
  );

  return `${classLevel}/${classroom}/${fileName}`;
}

function makeUniqueZipPath(path: string, usedPaths: Set<string>): string {
  const normalized = path.replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  if (!usedPaths.has(normalized)) {
    usedPaths.add(normalized);
    return normalized;
  }

  const dotIndex = normalized.lastIndexOf('.');
  const base = dotIndex > 0 ? normalized.slice(0, dotIndex) : normalized;
  const ext = dotIndex > 0 ? normalized.slice(dotIndex) : '';

  for (let index = 2; ; index += 1) {
    const candidate = `${base} (${index})${ext}`;
    if (!usedPaths.has(candidate)) {
      usedPaths.add(candidate);
      return candidate;
    }
  }
}

function saveDownloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function hasActiveSearchOrFilter(ctx: SearchFilterContext): boolean {
  return Boolean(
    ctx.searchTerm.trim()
    || ctx.classLevelFilter
    || ctx.classroomFilter
    || ctx.learningAreaFilter
    || ctx.subjectFilter
    || ctx.semesterFilter,
  );
}

function ClassLevelBrowseMenu({
  selectedLevel,
  onSelectLevel,
}: {
  selectedLevel: string;
  onSelectLevel: (code: string) => void;
}) {
  return (
    <div className="space-y-5">
      {LEVEL_GROUPS.map((group) => (
        <section
          key={group.title}
          className="overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-b from-white to-slate-50/40 shadow-sm shadow-slate-200/60"
        >
          <div className="relative overflow-hidden border-b border-slate-200/60 bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 px-5 py-2.5">
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{ background: 'radial-gradient(ellipse 80% 120% at 50% -20%, rgba(96,165,250,0.22), transparent)' }}
            />
            <h3 className="relative text-center text-[15px] font-extrabold tracking-wide text-white">
              {group.title}
            </h3>
          </div>

          <div className="grid grid-cols-3 gap-2 p-2.5 sm:grid-cols-6">
            {group.codes.map((code) => {
                  const isActive = selectedLevel === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => onSelectLevel(code)}
                      className={`btn btn-grey-3d flex min-h-[44px] items-center justify-center !rounded-xl !px-2 !py-2 text-center transition-all duration-200 ${
                        isActive
                          ? 'ring-2 ring-blue-300/80'
                          : 'hover:-translate-y-px'
                      }`}
                    >
                      <span
                        className={`text-[28px] font-extrabold leading-none tracking-tight ${
                          isActive ? 'text-blue-700' : 'text-slate-800'
                        }`}
                      >
                    {code}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function buildActiveFilterHighlights(ctx: SearchFilterContext): string[] {
  const highlights: string[] = [];
  const keyword = ctx.searchTerm.trim();
  if (keyword) highlights.push(keyword);
  if (ctx.classLevelFilter) highlights.push(ctx.classLevelFilter);
  if (ctx.classroomFilter) highlights.push(ctx.classroomFilter);
  if (ctx.learningAreaFilter) highlights.push(ctx.learningAreaFilter);
  if (ctx.subjectFilter && ctx.subjectFilterLabel) highlights.push(ctx.subjectFilterLabel);
  if (ctx.semesterFilter) highlights.push(`ภาคเรียนที่ ${ctx.semesterFilter}`);
  return highlights;
}

function teacherMatchesSearch(report: CompletedReport, searchTerm: string): boolean {
  const keyword = searchTerm.trim().toLowerCase();
  if (!keyword) return false;
  return (
    report.teacherName.toLowerCase().includes(keyword)
    || report.teacherUsername.toLowerCase().includes(keyword)
  );
}

function CompletedReportCard({
  report,
  filterContext,
  onOpen,
}: {
  report: CompletedReport;
  filterContext: SearchFilterContext;
  onOpen: (report: CompletedReport) => void;
}) {
  const activeFilter = hasActiveSearchOrFilter(filterContext);
  const matchedStudentNames = matchingStudentNames(
    normalizeStudents(report.gradebook.students),
    filterContext.searchTerm,
  );
  const teacherHighlighted = teacherMatchesSearch(report, filterContext.searchTerm);
  const filterHighlights = buildActiveFilterHighlights(filterContext);

  return (
    <button
      type="button"
      onClick={() => onOpen(report)}
      className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/20"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-blue-50 ring-1 ring-blue-100">
        <img src="/logo1.png" alt="" className="h-8 w-8 object-contain" />
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
        <div className="flex min-w-0 shrink items-center gap-2">
          <h3 className="truncate text-sm font-extrabold text-slate-950 sm:text-base">
            {report.subjectCode} · {report.subjectName}
          </h3>
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-100">
            เสร็จสมบูรณ์
          </span>
        </div>

        <div className="ml-auto min-w-0 flex-1 text-right text-[11px] font-semibold leading-snug text-slate-500 sm:text-xs">
          {activeFilter ? (
            <span className="inline-flex max-w-full flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5">
              {filterHighlights.length > 0 ? (
                <span className="font-extrabold text-orange-600">
                  {filterHighlights.join(' · ')}
                </span>
              ) : null}
              {matchedStudentNames.length > 0 ? (
                <>
                  {filterHighlights.length > 0 ? <span className="text-slate-300">|</span> : null}
                  <span className="font-extrabold text-orange-600">
                    {matchedStudentNames.join(', ')}
                  </span>
                </>
              ) : null}
              {(filterHighlights.length > 0 || matchedStudentNames.length > 0) ? (
                <span className="text-slate-300">|</span>
              ) : null}
              <span className={teacherHighlighted ? 'font-extrabold text-orange-600' : 'text-slate-500'}>
                {report.teacherName}
              </span>
            </span>
          ) : (
            reportMetaLine(report)
          )}
        </div>
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
    </button>
  );
}

type DocumentActionType = 'print' | 'save' | 'preview';

interface PdfPreviewState {
  objectUrl: string;
  blob: Blob;
  fileName: string;
  gradebookId: string;
  title: string;
}

type DocumentActionStatus = {
  variant: 'preparing' | 'success' | 'error';
  title: string;
  message: string;
};

type BulkDownloadStatus = {
  phase: 'running' | 'zipping' | 'success' | 'error';
  total: number;
  completed: number;
  percent: number;
  currentLabel: string;
  message: string;
  fileName?: string;
};

function DocumentActionStatusModal({
  status,
  onClose,
}: {
  status: DocumentActionStatus | null;
  onClose: () => void;
}) {
  if (!status) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
        <div
          className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 text-center shadow-[0_24px_60px_-28px_rgba(15,23,42,0.6)]"
          role="status"
          aria-live="polite"
        >
          <div
            className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
              status.variant === 'success'
                ? 'bg-emerald-50 text-emerald-600'
                : status.variant === 'error'
                  ? 'bg-rose-50 text-rose-600'
                  : 'bg-blue-50 text-blue-600'
            }`}
          >
            {status.variant === 'success' ? (
              <CheckCircle2 className="h-8 w-8" />
            ) : status.variant === 'error' ? (
              <AlertCircle className="h-8 w-8" />
            ) : (
              <Loader2 className="h-8 w-8 animate-spin" />
            )}
          </div>
          <h2 className="text-lg font-extrabold text-slate-950">{status.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{status.message}</p>
          {status.variant !== 'preparing' && (
            <button type="button" onClick={onClose} className="btn btn-secondary mt-5 !h-10 !px-5">
              ปิด
            </button>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}

function BulkDownloadProgressModal({
  status,
  onClose,
}: {
  status: BulkDownloadStatus | null;
  onClose: () => void;
}) {
  if (!status) return null;

  const working = status.phase === 'running' || status.phase === 'zipping';
  const error = status.phase === 'error';
  const success = status.phase === 'success';

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
        <div
          className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-[0_24px_70px_-28px_rgba(15,23,42,0.7)]"
          role="status"
          aria-live="polite"
        >
          <div
            className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
              success
                ? 'bg-emerald-50 text-emerald-600'
                : error
                  ? 'bg-rose-50 text-rose-600'
                  : 'bg-blue-50 text-blue-600'
            }`}
          >
            {success ? (
              <CheckCircle2 className="h-8 w-8" />
            ) : error ? (
              <AlertCircle className="h-8 w-8" />
            ) : (
              <Loader2 className="h-8 w-8 animate-spin" />
            )}
          </div>

          <div className="text-center">
            <h2 className="text-lg font-extrabold text-slate-950">
              {success ? 'บันทึก ปพ.5 ทั้งหมดสำเร็จ' : error ? 'บันทึก ปพ.5 ทั้งหมดไม่สำเร็จ' : 'กำลังบันทึก ปพ.5 ทั้งหมด'}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{status.message}</p>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs font-extrabold text-slate-600">
              <span>{status.completed.toLocaleString('th-TH')} / {status.total.toLocaleString('th-TH')} ไฟล์</span>
              <span>{status.percent.toLocaleString('th-TH')}%</span>
            </div>
            <div
              className="h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={status.percent}
            >
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  error
                    ? 'bg-rose-500'
                    : success
                      ? 'bg-emerald-500'
                      : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                }`}
                style={{ width: `${Math.max(2, status.percent)}%` }}
              />
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold leading-6 text-slate-700">
            {status.currentLabel}
          </div>

          {working ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-center text-sm font-extrabold text-amber-800">
              กรุณาอย่ากดออก ปิดแท็บ หรือรีเฟรชหน้าจอจนกว่าจะเสร็จ
            </div>
          ) : (
            <button type="button" onClick={onClose} className="btn btn-secondary mt-5 w-full justify-center !h-10">
              ปิด
            </button>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}

function CompletedReportsTable({
  reports,
  documentActionKey,
  onOpen,
  onPrint,
  onSave,
}: {
  reports: CompletedReport[];
  documentActionKey: string;
  onOpen: (report: CompletedReport) => void;
  onPrint: (report: CompletedReport) => void;
  onSave: (report: CompletedReport) => void;
}) {
    return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px] table-fixed text-sm">
          <colgroup>
            <col className="w-[8%]" />
            <col className="w-[11%]" />
            <col className="w-[24%]" />
            <col className="w-[10%]" />
            <col className="w-[17%]" />
            <col className="w-[15%]" />
            <col className="w-[8%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="bg-slate-950 text-white">
            <tr>
              <th className="px-3 py-3 text-center font-extrabold">ระดับชั้น</th>
              <th className="px-3 py-3 text-center font-extrabold">ห้องเรียน</th>
              <th className="px-3 py-3 text-left font-extrabold">ชื่อวิชา</th>
              <th className="px-3 py-3 text-center font-extrabold">รหัส</th>
              <th className="px-3 py-3 text-left font-extrabold">กลุ่มสาระการเรียนรู้</th>
              <th className="px-3 py-3 text-left font-extrabold">ชื่อครูผู้สอน</th>
              <th className="px-3 py-3 text-center font-extrabold">สถานะ</th>
              <th className="px-3 py-3 text-center font-extrabold">เอกสาร</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reports.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-14 text-center text-slate-400">
                  ไม่พบ ปพ.5 ที่เสร็จสมบูรณ์ตามเงื่อนไขที่เลือก
                </td>
              </tr>
            ) : (
              reports.map((report) => {
                const printKey = `${report.gradebook.id}:print`;
                const saveKey = `${report.gradebook.id}:save`;
                const printing = documentActionKey === printKey;
                const saving = documentActionKey === saveKey;
                const teacherNames = splitTeacherNames(report.teacherName);

                return (
                  <tr
                    key={report.gradebook.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(report)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onOpen(report);
                      }
                    }}
                    className="cursor-pointer transition-colors hover:bg-blue-50/70 focus-visible:bg-blue-50/70 focus-visible:outline-none"
                  >
                    <td className="px-3 py-3 text-center font-extrabold text-slate-900">{report.classLevel}</td>
                    <td className="px-3 py-3 text-center font-semibold text-slate-700">{roomNumberLabel(report.classroomName)}</td>
                    <td className="px-3 py-3">
                      <div className="truncate font-extrabold text-slate-950" title={report.subjectName}>
                        {report.subjectName}
                      </div>
                      <div className="mt-0.5 text-[11px] font-semibold text-slate-400">
                        ภาคเรียนที่ {report.semesterNumber ?? '-'}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center font-mono font-semibold text-slate-700">{report.subjectCode}</td>
                    <td className="px-3 py-3">
                      <div className="truncate font-semibold text-slate-700" title={report.learningArea}>
                        {report.learningArea}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-0.5 font-semibold text-slate-800" title={report.teacherName}>
                        {teacherNames.map((teacherName, index) => (
                          <div key={`${report.gradebook.id}-teacher-${index}`} className="truncate">
                            {teacherName}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-extrabold text-emerald-700 ring-1 ring-emerald-100">
                        เสร็จสมบูรณ์
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onPrint(report);
                          }}
                          disabled={Boolean(documentActionKey)}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Print"
                        >
                          {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                          Print
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onSave(report);
                          }}
                          disabled={Boolean(documentActionKey)}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-blue-600 bg-blue-600 px-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Save"
                        >
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          Save
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 px-4 py-3 text-left text-xs font-bold text-slate-500">
        จำนวน {reports.length.toLocaleString('th-TH')} รายการ
      </div>
    </div>
  );
}

export const GradebookSearchPage: React.FC<GradebookSearchPageProps> = ({
  currentUser,
  initialYearId,
  onBackActionChange,
}) => {
  const [yearLabel, setYearLabel] = useState('');
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [reports, setReports] = useState<CompletedReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<CompletedReport | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [browseLevel, setBrowseLevel] = useState('');
  const [showAllReportsTable, setShowAllReportsTable] = useState(false);
  const [classLevelFilter, setClassLevelFilter] = useState('');
  const [classroomFilter, setClassroomFilter] = useState('');
  const [learningAreaFilter, setLearningAreaFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [documentAction, setDocumentAction] = useState<{ gradebookId: string; type: DocumentActionType } | null>(null);
  const [documentStatus, setDocumentStatus] = useState<DocumentActionStatus | null>(null);
  const [bulkDownloadStatus, setBulkDownloadStatus] = useState<BulkDownloadStatus | null>(null);
  const [documentError, setDocumentError] = useState('');
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const bulkDownloadWorking = bulkDownloadStatus?.phase === 'running' || bulkDownloadStatus?.phase === 'zipping';

  const loadReports = useCallback(async () => {
    if (!currentUser.schoolId) return;

    setLoading(true);
    setError('');
    try {
      let targetYearId = initialYearId;
      let targetYearLabel = '';

      if (!targetYearId) {
        const { data: yearRows, error: yearError } = await supabase
          .from('academic_years')
          .select('id, year_be, is_active')
          .eq('school_id', currentUser.schoolId)
          .order('year_be', { ascending: false });

        if (yearError) throw yearError;
        const activeYear = yearRows?.find((year) => year.is_active) ?? yearRows?.[0];
        targetYearId = activeYear?.id;
        targetYearLabel = activeYear?.year_be ? String(activeYear.year_be) : '';
      } else {
        const { data: yearRow } = await supabase
          .from('academic_years')
          .select('year_be')
          .eq('id', targetYearId)
          .maybeSingle();
        targetYearLabel = yearRow?.year_be ? String(yearRow.year_be) : '';
      }

      if (!targetYearId) {
        setReports([]);
        setSemesters([]);
        setYearLabel('');
        return;
      }

      setYearLabel(targetYearLabel);

      const { data: semesterRows, error: semesterError } = await supabase
        .from('semesters')
        .select('*')
        .eq('academic_year_id', targetYearId)
        .order('semester_number');

      if (semesterError) throw semesterError;
      const semesterList = (semesterRows ?? []) as Semester[];
      const semesterIds = semesterList.map((semester) => semester.id);

      if (semesterIds.length === 0) {
        setReports([]);
        setSemesters([]);
        setYearLabel(targetYearLabel);
        return;
      }

      const assignmentSelect = (subjectColumns: string, includeAssignmentHours = true) => {
        const assignmentFields = includeAssignmentHours
          ? `
          id,
          teacher_id,
          semester_id,
          hours_per_week,
          hours_per_semester,`
          : `
          id,
          teacher_id,
          semester_id,`;

        return supabase
          .from('teaching_assignments')
          .select(`
            ${assignmentFields}
            profiles:teacher_id(id, full_name, title, username),
            subjects:subject_id(${subjectColumns}),
            classrooms:classroom_id(id, name, class_level_code)
          `)
          .eq('school_id', currentUser.schoolId)
          .in('semester_id', semesterIds)
          .order('created_at', { ascending: false });
      };

      let { data, error: reportError } = await assignmentSelect(
        'id, subject_code, subject_name, learning_area, default_class_level, hours_per_week, hours_total',
      );

      if (reportError && isSubjectSchemaMismatch(reportError)) {
        const fallback = await assignmentSelect('id, subject_code, subject_name, learning_area, default_class_level', false);
        data = fallback.data;
        reportError = fallback.error;
      }

      if (reportError && isSubjectSchemaMismatch(reportError)) {
        const fallback = await assignmentSelect('id, subject_code, subject_name, learning_area, default_class_level');
        data = fallback.data;
        reportError = fallback.error;
      }

      if (reportError) throw reportError;

      const assignmentRows = ((data ?? []) as unknown as AssignmentReportRow[]);
      const assignmentIds = assignmentRows.map((row) => row.id);

      if (assignmentIds.length === 0) {
        setYearLabel(targetYearLabel);
        setSemesters(semesterList);
        setReports([]);
        setError('');
        return;
      }

      // Keep each PostgREST URL below proxy limits when a school has many assignments.
      const gradebookRows: CompletedGradebook[] = [];
      for (let start = 0; start < assignmentIds.length; start += 40) {
        const { data: batch, error: gradebookError } = await supabase.from('gradebooks')
          .select(GRADEBOOK_LIST_SELECT).in('teaching_assignment_id', assignmentIds.slice(start, start + 40))
          .is('deleted_at', null).order('created_at', { ascending: false });
        if (gradebookError) throw gradebookError;
        gradebookRows.push(...((batch ?? []) as CompletedGradebook[]));
      }

      const completedGradebookByAssignmentId = new Map(
        ((gradebookRows ?? []) as CompletedGradebook[])
          .filter(isCompletedGradebook)
          .map((gradebook) => [gradebook.teaching_assignment_id, gradebook]),
      );

      const mapped = ((data ?? []) as unknown as AssignmentReportRow[])
        .map((row) => {
          const gradebook = completedGradebookByAssignmentId.get(row.id);
          if (!gradebook) return null;
          const students = normalizeStudents(gradebook.students);
          const semester = semesterList.find((item) => item.id === row.semester_id);
          const semesterNumber: number | null = semester?.semester_number ?? null;
          const classLevel = row.subjects?.default_class_level ?? row.classrooms?.class_level_code ?? 'ไม่ระบุระดับชั้น';
          return {
            assignmentId: row.id,
            gradebook,
            teacherId: row.teacher_id,
            teacherName: profileName(row.profiles),
            teacherUsername: row.profiles?.username ?? '',
            subjectId: row.subjects?.id ?? '',
            subjectCode: row.subjects?.subject_code ?? '',
            subjectName: row.subjects?.subject_name ?? 'ไม่พบรายวิชา',
            studentNames: formatStudentNames(students),
            learningArea: row.subjects?.learning_area ?? 'ไม่ระบุกลุ่มสาระ',
            classLevel,
            classroomName: row.classrooms?.name ?? 'ไม่พบห้องเรียน',
            semesterNumber,
            studentCount: students.length,
            completionPercent: Math.min(100, statNumber(gradebook.stats, 'completionPercent')),
            completedAt: gradebook.updated_at ?? gradebook.created_at,
            hoursTotal: resolveStudyHours(row, semesterNumber, classLevel),
            isPrimaryLevel: isPrimaryClassLevel(classLevel),
          } satisfies CompletedReport;
        })
        .filter((row): row is CompletedReport => Boolean(row));

      setYearLabel(targetYearLabel);
      setSemesters(semesterList);
      setReports(mapped);
      setError('');
    } catch (err) {
      const failure = err as { code?: string; message?: string } | null;
      console.warn('Unable to load gradebook search data.', JSON.stringify({ code: failure?.code, message: failure?.message }));
      setReports([]);
      setError('โหลดรายการ ปพ.5 ไม่สำเร็จ กรุณารีเฟรชหน้าเว็บแล้วลองใหม่');
    } finally {
      setLoading(false);
    }
  }, [currentUser.schoolId, initialYearId]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const loadReportDetail = useCallback(async (report: CompletedReport): Promise<CompletedReport> => {
    const { data, error } = await supabase
      .from('gradebooks')
      .select(GRADEBOOK_DETAIL_SELECT)
      .eq('id', report.gradebook.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return report;

    const gradebook = data as CompletedGradebook;
    if (report.isPrimaryLevel) {
      const { data: annual, error: annualError } = await supabase.rpc('get_primary_gradebook_year', { p_gradebook_id: gradebook.id });
      if (annualError) throw annualError;
      gradebook.primary_year = annual;
    }
    return {
      ...report,
      gradebook,
      hoursTotal: effectiveStudyHours({ ...report, gradebook }),
    };
  }, []);

  const openReport = useCallback(async (report: CompletedReport) => {
    setSelectedReport(report);
    setDetailLoading(true);

    try {
      const enrichedReport = await loadReportDetail(report);
      setSelectedReport(enrichedReport);
    } catch (err) {
      console.warn('Unable to load gradebook detail; showing summary data only.', err);
    } finally {
      setDetailLoading(false);
    }
  }, [loadReportDetail]);

  const buildPap5DocumentData = useCallback((report: CompletedReport): AppData => {
    const data = rowToAppData(report.gradebook as GradebookRow);
    return {
      ...data,
      generalInfo: applyPap5OfficialDisplayDefaults(data.generalInfo),
    };
  }, []);

  const replacePdfPreview = useCallback((nextPreview: PdfPreviewState | null) => {
    setPdfPreview((currentPreview) => {
      if (currentPreview?.objectUrl && currentPreview.objectUrl !== nextPreview?.objectUrl) {
        URL.revokeObjectURL(currentPreview.objectUrl);
      }
      return nextPreview;
    });
  }, []);

  const closePdfPreview = useCallback(() => {
    replacePdfPreview(null);
    setDocumentError('');
  }, [replacePdfPreview]);

  const openReportPdfPreview = useCallback(async (report: CompletedReport) => {
    if (documentAction?.type === 'preview') return;

    setDocumentAction({ gradebookId: report.gradebook.id, type: 'preview' });
    setDocumentStatus({
      variant: 'preparing',
      title: 'กำลังเตรียมเอกสาร ปพ.5',
      message: 'ระบบกำลังจัดหน้าเอกสารและสร้างไฟล์ PDF สำหรับอ่าน กรุณารอสักครู่',
    });
    setDocumentError('');

    try {
      const detailedReport = await loadReportDetail(report);
      const { blob, fileName } = await createPap5PdfFile({
        id: detailedReport.gradebook.id,
        data: buildPap5DocumentData(detailedReport),
        approvalStatus: detailedReport.gradebook.approval_status ?? null,
      });
      const objectUrl = URL.createObjectURL(blob);
      setSelectedReport(detailedReport);
      replacePdfPreview({
        objectUrl,
        blob,
        fileName,
        gradebookId: detailedReport.gradebook.id,
        title: `ปพ.5 ${detailedReport.subjectName} ${detailedReport.classroomName}`,
      });
      setDocumentStatus(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ไม่สามารถสร้างตัวอย่าง PDF ปพ.5 ได้';
      setDocumentError(message);
      setDocumentStatus({
        variant: 'error',
        title: 'เปิดอ่าน ปพ.5 ไม่สำเร็จ',
        message,
      });
    } finally {
      setDocumentAction(null);
    }
  }, [buildPap5DocumentData, documentAction?.type, loadReportDetail, replacePdfPreview]);

  const handlePrintReport = useCallback(async (report: CompletedReport) => {
    const targetWindow = window.open('about:blank', '_blank');
    if (!targetWindow) {
      const message = 'เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต Pop-up แล้วลองอีกครั้ง';
      setDocumentError(message);
      setDocumentStatus({
        variant: 'error',
        title: 'เปิดหน้าพิมพ์ ปพ.5 ไม่สำเร็จ',
        message,
      });
      return;
    }

    setDocumentAction({ gradebookId: report.gradebook.id, type: 'print' });
    setDocumentStatus({
      variant: 'preparing',
      title: 'กำลังเตรียมหน้าพิมพ์ ปพ.5',
      message: 'ระบบกำลังจัดหน้าเอกสารและเปิดหน้าพิมพ์ กรุณารอสักครู่',
    });
    setDocumentError('');

    try {
      const detailedReport = await loadReportDetail(report);
      openPap5PrintDialog({
        id: detailedReport.gradebook.id,
        data: buildPap5DocumentData(detailedReport),
        approvalStatus: detailedReport.gradebook.approval_status ?? null,
        targetWindow,
      });
      setDocumentStatus({
        variant: 'success',
        title: 'เปิดหน้าพิมพ์ ปพ.5 แล้ว',
        message: 'ระบบเปิดหน้าพิมพ์ ปพ.5 ให้แล้ว กรุณาตรวจสอบหน้าต่างพิมพ์ของเบราว์เซอร์',
      });
    } catch (err) {
      try {
        targetWindow.close();
      } catch {
        // The visible error below is the important part if the browser refuses to close it.
      }
      const message = err instanceof Error ? err.message : 'ไม่สามารถเปิดหน้าพิมพ์ ปพ.5 ได้';
      setDocumentError(message);
      setDocumentStatus({
        variant: 'error',
        title: 'เปิดหน้าพิมพ์ ปพ.5 ไม่สำเร็จ',
        message,
      });
    } finally {
      setDocumentAction(null);
    }
  }, [buildPap5DocumentData, loadReportDetail]);

  const handleSaveReport = useCallback(async (report: CompletedReport) => {
    if (pdfPreview?.gradebookId === report.gradebook.id) {
      setDocumentError('');
      try {
        savePap5PdfBlob(pdfPreview.blob, pdfPreview.fileName);
        setDocumentStatus({
          variant: 'success',
          title: 'บันทึก ปพ.5 สำเร็จ',
          message: 'ไฟล์ PDF ที่เปิดอ่านอยู่ถูกส่งไปยังรายการดาวน์โหลดของเบราว์เซอร์แล้ว',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'ไม่สามารถบันทึกไฟล์ ปพ.5 ได้';
        setDocumentError(message);
        setDocumentStatus({
          variant: 'error',
          title: 'บันทึก ปพ.5 ไม่สำเร็จ',
          message,
        });
      }
      return;
    }

    setDocumentAction({ gradebookId: report.gradebook.id, type: 'save' });
    setDocumentStatus({
      variant: 'preparing',
      title: 'กำลังบันทึก ปพ.5',
      message: 'ระบบกำลังจัดหน้าเอกสารและสร้างไฟล์ PDF กรุณารอสักครู่',
    });
    setDocumentError('');

    try {
      const detailedReport = await loadReportDetail(report);
      await downloadPap5Pdf({
        id: detailedReport.gradebook.id,
        data: buildPap5DocumentData(detailedReport),
        approvalStatus: detailedReport.gradebook.approval_status ?? null,
      });
      setDocumentStatus({
        variant: 'success',
        title: 'บันทึก ปพ.5 สำเร็จ',
        message: 'ไฟล์ PDF ถูกส่งไปยังรายการดาวน์โหลดของเบราว์เซอร์แล้ว',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ไม่สามารถบันทึกไฟล์ ปพ.5 ได้';
      setDocumentError(message);
      setDocumentStatus({
        variant: 'error',
        title: 'บันทึก ปพ.5 ไม่สำเร็จ',
        message,
      });
    } finally {
      setDocumentAction(null);
    }
  }, [buildPap5DocumentData, loadReportDetail, pdfPreview]);

  const handleDownloadAllReports = useCallback(async () => {
    if (bulkDownloadWorking || documentAction || loading) return;

    const sourceReports = [...reports].sort(compareReportsByLevel);
    const total = sourceReports.length;
    if (total === 0) {
      setBulkDownloadStatus({
        phase: 'error',
        total: 0,
        completed: 0,
        percent: 0,
        currentLabel: 'ไม่พบ ปพ.5 ที่เสร็จสมบูรณ์สำหรับดาวน์โหลด',
        message: 'ยังไม่มีไฟล์ ปพ.5 ที่เสร็จสมบูรณ์ในปีการศึกษานี้',
      });
      return;
    }

    const zip = new JSZip();
    const usedPaths = new Set<string>();
    let completedCount = 0;
    let currentPercent = 0;
    setDocumentError('');
    setBulkDownloadStatus({
      phase: 'running',
      total,
      completed: 0,
      percent: 0,
      currentLabel: 'กำลังเตรียมรายการ ปพ.5',
      message: `ระบบกำลังสร้าง PDF จำนวน ${total.toLocaleString('th-TH')} ไฟล์`,
    });

    try {
      for (let index = 0; index < sourceReports.length; index += 1) {
        const report = sourceReports[index];
        const currentLabel = `${report.classLevel} ห้อง ${roomNumberLabel(report.classroomName)} · ${report.subjectName}`;
        currentPercent = Math.round((index / total) * 100);
        setBulkDownloadStatus({
          phase: 'running',
          total,
          completed: index,
          percent: currentPercent,
          currentLabel,
          message: `กำลังสร้าง PDF ไฟล์ที่ ${(index + 1).toLocaleString('th-TH')} จาก ${total.toLocaleString('th-TH')}`,
        });

        const detailedReport = await loadReportDetail(report);
        const { blob, fileName } = await createPap5PdfFile({
          id: detailedReport.gradebook.id,
          data: buildPap5DocumentData(detailedReport),
          approvalStatus: detailedReport.gradebook.approval_status ?? null,
        });
        const zipPath = makeUniqueZipPath(buildBulkPdfPath(detailedReport, fileName), usedPaths);
        zip.file(zipPath, blob);

        completedCount = index + 1;
        currentPercent = Math.round((completedCount / total) * 100);
        setBulkDownloadStatus({
          phase: 'running',
          total,
          completed: completedCount,
          percent: currentPercent,
          currentLabel,
          message: `สร้าง PDF แล้ว ${(index + 1).toLocaleString('th-TH')} จาก ${total.toLocaleString('th-TH')} ไฟล์`,
        });
      }

      setBulkDownloadStatus({
        phase: 'zipping',
        total,
        completed: total,
        percent: 100,
        currentLabel: 'กำลังรวมไฟล์เป็น ZIP',
        message: 'ระบบกำลังบีบอัดไฟล์ PDF ทั้งหมดเป็นไฟล์ ZIP',
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        const zipPercent = Math.round(metadata.percent);
        setBulkDownloadStatus((current) => current?.phase === 'zipping'
          ? {
              ...current,
              currentLabel: `กำลังรวมไฟล์เป็น ZIP ${zipPercent.toLocaleString('th-TH')}%`,
            }
          : current);
      });
      const zipFileName = sanitizeDownloadName(`ปพ.5 ทั้งหมด ปีการศึกษา ${yearLabel || 'ไม่ระบุปี'}`, 'ปพ.5 ทั้งหมด') + '.zip';

      saveDownloadBlob(zipBlob, zipFileName);
      setBulkDownloadStatus({
        phase: 'success',
        total,
        completed: total,
        percent: 100,
        currentLabel: zipFileName,
        message: 'ไฟล์ ZIP ถูกส่งไปยังรายการดาวน์โหลดของเบราว์เซอร์แล้ว',
        fileName: zipFileName,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ไม่สามารถบันทึก ปพ.5 ทั้งหมดได้';
      setDocumentError(message);
      setBulkDownloadStatus({
        phase: 'error',
        total,
        completed: completedCount,
        percent: currentPercent,
        currentLabel: message,
        message,
      });
    }
  }, [
    bulkDownloadWorking,
    buildPap5DocumentData,
    documentAction,
    loadReportDetail,
    loading,
    reports,
    yearLabel,
  ]);

  const handleBrowseLevelSelect = useCallback((level: string) => {
    setShowAllReportsTable(false);
    setBrowseLevel(level);
    setClassLevelFilter(level);
    setClassroomFilter('');
    setLearningAreaFilter('');
    setSubjectFilter('');
    setSemesterFilter('');
    setSearchTerm('');
    setDocumentError('');
  }, []);

  const handleShowAllReportsTable = useCallback(() => {
    setShowAllReportsTable(true);
    setBrowseLevel('');
    setClassLevelFilter('');
    setClassroomFilter('');
    setLearningAreaFilter('');
    setSubjectFilter('');
    setSemesterFilter('');
    setSearchTerm('');
    setDocumentError('');
  }, []);

  const handleClassLevelFilterChange = useCallback((level: string) => {
    setClassLevelFilter(level);
    setClassroomFilter('');
    if (browseLevel) {
      setBrowseLevel(level);
    }
  }, [browseLevel]);

  const returnToClassBrowse = useCallback(() => {
    setShowAllReportsTable(false);
    setBrowseLevel('');
    setClassLevelFilter('');
    setClassroomFilter('');
    setLearningAreaFilter('');
    setSubjectFilter('');
    setSemesterFilter('');
    setSearchTerm('');
    setDocumentError('');
  }, []);

  const classLevelOptions = useMemo(() => unique(reports.map((report) => report.classLevel)), [reports]);
  const classroomOptions = useMemo(() => {
    const scopedReports = classLevelFilter
      ? reports.filter((report) => report.classLevel === classLevelFilter)
      : reports;
    return unique(scopedReports.map((report) => report.classroomName));
  }, [classLevelFilter, reports]);
  const learningAreaOptions = useMemo(() => unique(reports.map((report) => report.learningArea)), [reports]);
  const subjectOptions = useMemo(
    () => [...reports]
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'th'))
      .filter((report, index, rows) => rows.findIndex((item) => item.subjectId === report.subjectId) === index),
    [reports],
  );

  const subjectFilterLabel = useMemo(
    () => subjectOptions.find((subject) => subject.subjectId === subjectFilter)?.subjectName ?? '',
    [subjectFilter, subjectOptions],
  );

  const filterContext = useMemo<SearchFilterContext>(() => ({
    searchTerm,
    classLevelFilter,
    classroomFilter,
    learningAreaFilter,
    subjectFilter,
    subjectFilterLabel,
    semesterFilter,
  }), [classLevelFilter, classroomFilter, learningAreaFilter, searchTerm, semesterFilter, subjectFilter, subjectFilterLabel]);

  const filteredReports = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return reports
      .filter((report) => {
        const searchText = [
          report.subjectCode,
          report.subjectName,
          report.teacherName,
          report.teacherUsername,
          report.classroomName,
          report.learningArea,
          report.studentNames,
          studentSearchText(normalizeStudents(report.gradebook.students)),
        ].join(' ').toLowerCase();
        const matchesKeyword = !keyword || searchText.includes(keyword);
        const matchesLevel = !classLevelFilter || report.classLevel === classLevelFilter;
        const matchesClassroom = !classroomFilter || report.classroomName === classroomFilter;
        const matchesArea = !learningAreaFilter || report.learningArea === learningAreaFilter;
        const matchesSubject = !subjectFilter || report.subjectId === subjectFilter;
        const matchesSemester = !semesterFilter || String(report.semesterNumber ?? '') === semesterFilter;
        return matchesKeyword && matchesLevel && matchesClassroom && matchesArea && matchesSubject && matchesSemester;
      })
      .sort(compareReportsByLevel);
  }, [classLevelFilter, classroomFilter, learningAreaFilter, reports, searchTerm, semesterFilter, subjectFilter]);

  const showReportsTable = Boolean(browseLevel) || showAllReportsTable;
  const showBrowseMenu = !showReportsTable && !hasActiveSearchOrFilter(filterContext);
  const actionBusy = Boolean(documentAction) || bulkDownloadWorking;
  const documentActionKey = documentAction
    ? `${documentAction.gradebookId}:${documentAction.type}`
    : bulkDownloadWorking
      ? 'bulk-download'
      : '';
  const documentStatusModal = (
    <DocumentActionStatusModal status={documentStatus} onClose={() => setDocumentStatus(null)} />
  );
  const bulkDownloadModal = (
    <BulkDownloadProgressModal status={bulkDownloadStatus} onClose={() => setBulkDownloadStatus(null)} />
  );

  useEffect(() => {
    if (!onBackActionChange) return undefined;

    if (pdfPreview) {
      onBackActionChange(closePdfPreview);
    } else if (selectedReport) {
      onBackActionChange(() => {
        setSelectedReport(null);
        setDocumentError('');
      });
    } else if (showReportsTable) {
      onBackActionChange(returnToClassBrowse);
    } else {
      onBackActionChange(null);
    }

    return () => onBackActionChange(null);
  }, [closePdfPreview, onBackActionChange, pdfPreview, returnToClassBrowse, selectedReport, showReportsTable]);

  useEffect(() => {
    if (!bulkDownloadWorking) return undefined;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [bulkDownloadWorking]);

  useEffect(() => {
    if (!pdfPreview) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePdfPreview();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closePdfPreview, pdfPreview]);

  if (pdfPreview) {
    const previewReport = selectedReport;
    const previewPrintLoading = previewReport ? documentActionKey === `${previewReport.gradebook.id}:print` : false;
    const previewSaveLoading = previewReport ? documentActionKey === `${previewReport.gradebook.id}:save` : false;

    return (
      <>
        {documentStatusModal}
        {bulkDownloadModal}
        <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4">
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (previewReport) void handlePrintReport(previewReport);
            }}
            disabled={!previewReport || actionBusy}
            className="btn btn-grey-3d min-w-[150px] justify-center !px-5 !py-3"
          >
            {previewPrintLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            พิมพ์ ปพ.5
          </button>
          <button
            type="button"
            onClick={() => {
              if (previewReport) void handleSaveReport(previewReport);
            }}
            disabled={!previewReport || actionBusy}
            className="btn btn-grey-3d min-w-[150px] justify-center !px-5 !py-3"
          >
            {previewSaveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            บันทึก ปพ.5
          </button>
        </div>

        <section className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-800 bg-[#101216] shadow-xl">
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/10 bg-[#14171d] px-4 text-white">
            <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200">
              {pdfPreview.title}
            </div>
            <button
              type="button"
              onClick={closePdfPreview}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              aria-label="ปิดตัวอ่าน PDF"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="h-[calc(100vh-13rem)] min-h-[640px] bg-[#101216]">
            <iframe
              title={pdfPreview.title}
              src={`${pdfPreview.objectUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`}
              className="h-full w-full border-0 bg-[#101216]"
            />
          </div>
        </section>
      </div>
      </>
    );
  }

  if (selectedReport) {
    const students = normalizeStudents(selectedReport.gradebook.students);
    const appData = gradebookAppData(selectedReport.gradebook);
    const detailPreviewLoading = documentActionKey === `${selectedReport.gradebook.id}:preview`;
    const detailSaveLoading = documentActionKey === `${selectedReport.gradebook.id}:save`;

    return (
      <>
      {documentStatusModal}
      {bulkDownloadModal}
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => {
            setSelectedReport(null);
            setDocumentError('');
          }}
          className="btn btn-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
          กลับผลการค้นหา
        </button>

        {detailLoading && (
          <div className="ui-card flex items-center justify-center py-6 text-sm text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            กำลังโหลดรายละเอียด ปพ.5...
          </div>
        )}
        {documentError && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            {documentError}
          </div>
        )}

        <section className={`ui-card overflow-hidden${detailLoading ? ' opacity-60' : ''}`}>
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">รายละเอียด ปพ.5</p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">
                  รายวิชา {selectedReport.subjectName} {selectedReport.subjectCode ? `รหัสวิชา ${selectedReport.subjectCode}` : ''}
                </h2>
              </div>
              <p className="shrink-0 text-right text-sm font-medium leading-relaxed text-slate-500 lg:max-w-[55%] lg:pt-6">
                {reportDetailMetaLine(selectedReport)}
              </p>
            </div>
          </div>

          <div className="px-5 py-5">
            <table className="w-full table-auto text-sm">
              <thead className="bg-[#0f172a] text-white">
                <tr>
                  <th className="px-3 py-3 text-center font-bold">ลำดับ</th>
                  <th className="px-3 py-3 text-center font-bold">รหัสนักเรียน</th>
                  <th className="px-3 py-3 text-center font-bold">เลขบัตร ปชช.</th>
                  <th className="px-3 py-3 text-center font-bold">ชื่อ-นามสกุล</th>
                  <th className="px-3 py-3 text-center font-bold">เวลาเรียน</th>
                  <th className="px-3 py-3 text-center font-bold">คะแนนรวม</th>
                  <th className="px-3 py-3 text-center font-bold">ระดับผลการเรียน</th>
                  <th className="px-3 py-3 text-center font-bold">คุณลักษณะ 1-8</th>
                  <th className="px-3 py-3 text-center font-bold">การคิดวิเคราะห์</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                      ยังไม่มีข้อมูลรายชื่อนักเรียนใน ปพ.5 รายการนี้
                    </td>
                  </tr>
                ) : (
                  students.map((student, index) => {
                    const row = studentName(student, index);
                    const summary = getStudentReportSummary(row.id, appData);
                    return (
                      <tr key={`${row.id}-${index}`} className="transition hover:bg-slate-50">
                        <td className="px-3 py-3 text-center font-semibold text-slate-500">{index + 1}</td>
                        <td className="px-3 py-3 text-center font-mono text-slate-700">{row.code}</td>
                        <td className="px-3 py-3 text-center font-mono text-slate-600">{studentCitizenId(student)}</td>
                        <td className="px-3 py-3 font-semibold text-slate-950">{row.name}</td>
                        <td className="px-3 py-3 text-center font-semibold text-slate-700">
                          {summary.attendedHours > 0 ? summary.attendedHours.toLocaleString('th-TH') : '—'}
                        </td>
                        <td className="px-3 py-3 text-center font-semibold text-slate-800">
                          {summary.totalScore != null ? summary.totalScore.toLocaleString('th-TH') : '—'}
                        </td>
                        <td className="px-3 py-3 text-center font-bold text-slate-800">{summary.gradeLevel}</td>
                        <td className="px-3 py-3 text-center font-semibold text-slate-700">{summary.attributeRating}</td>
                        <td className="px-3 py-3 text-center font-semibold text-slate-700">{summary.analyticalRating}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-5">
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  void openReportPdfPreview(selectedReport);
                }}
                disabled={detailLoading || actionBusy}
                className="btn btn-grey-3d min-w-[150px] justify-center !px-5 !py-3"
              >
                {detailPreviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                อ่าน ปพ.5
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSaveReport(selectedReport);
                }}
                disabled={detailLoading || actionBusy}
                className="btn btn-grey-3d min-w-[150px] justify-center !px-5 !py-3"
              >
                {detailSaveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                บันทึก ปพ.5
              </button>
            </div>
          </div>
        </section>
      </div>
      </>
    );
  }

  if (showReportsTable) {
    return (
      <>
      {documentStatusModal}
      {bulkDownloadModal}
      <div className="w-full space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1.2fr_repeat(5,minmax(0,1fr))]">
            <label className="flex h-[42px] min-w-0 items-center rounded-xl border border-slate-200 bg-white px-3 shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
              <Search className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="ค้นหา"
                className="w-full min-w-0 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
              />
            </label>

            <FilterDropdown value={classLevelFilter} onChange={handleClassLevelFilterChange}>
              <option value="">ระดับชั้น</option>
              {classLevelOptions.map((level) => <option key={level} value={level}>{level}</option>)}
            </FilterDropdown>
            <FilterDropdown value={classroomFilter} onChange={setClassroomFilter}>
              <option value="">ห้องเรียน</option>
              {classroomOptions.map((classroom) => <option key={classroom} value={classroom}>{classroom}</option>)}
            </FilterDropdown>
            <FilterDropdown value={learningAreaFilter} onChange={setLearningAreaFilter}>
              <option value="">กลุ่มสาระการเรียนรู้</option>
              {learningAreaOptions.map((area) => <option key={area} value={area}>{area}</option>)}
            </FilterDropdown>
            <FilterDropdown value={subjectFilter} onChange={setSubjectFilter}>
              <option value="">วิชา</option>
              {subjectOptions.map((subject) => (
                <option key={subject.subjectId} value={subject.subjectId}>{subject.subjectName}</option>
              ))}
            </FilterDropdown>
            <FilterDropdown value={semesterFilter} onChange={setSemesterFilter}>
              <option value="">ภาคเรียน</option>
              {semesters.map((semester) => (
                <option key={semester.id} value={String(semester.semester_number)}>
                  ภาคเรียนที่ {semester.semester_number}
                </option>
              ))}
            </FilterDropdown>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {documentError && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            {documentError}
          </div>
        )}

        {loading ? (
          <div className="ui-card flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
            กำลังโหลดรายการ ปพ.5...
          </div>
        ) : (
          <CompletedReportsTable
            reports={filteredReports}
            documentActionKey={documentActionKey}
            onOpen={(report) => {
              void openReport(report);
            }}
            onPrint={(report) => void handlePrintReport(report)}
            onSave={(report) => void handleSaveReport(report)}
          />
        )}
      </div>
      </>
    );
  }

  return (
    <>
    {documentStatusModal}
    {bulkDownloadModal}
    <div className="space-y-8">
      <section className="mx-auto max-w-5xl text-center">
        <img src="/logo1.png" alt="ปพ.5" className="mx-auto h-24 w-24 object-contain" />
        <p className="mt-4 text-base font-medium text-slate-700">โรงเรียนกาฬสินธุ์ปัญญานุกูล จังหวัดกาฬสินธุ์</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
          ค้นหาบันทึกผลการพัฒนาคุณภาพผู้เรียน (ปพ.5)
        </h1>
        <p className="mt-8 text-2xl font-semibold text-slate-700">
          สวัสดี {currentUser.name}
        </p>

        <label className="mx-auto mt-5 flex max-w-4xl items-center rounded-xl border border-slate-300 bg-white px-5 py-4 shadow-sm focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
          <Search className="mr-3 h-5 w-5 shrink-0 text-slate-400" />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="ค้นหาด้วย รหัสวิชา ชื่อวิชา ชื่อครูผู้สอน ชื่อนักเรียน"
            className="w-full min-w-0 bg-transparent text-left text-base font-semibold leading-relaxed text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400"
          />
        </label>

        <div className="mx-auto mt-7 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FilterDropdown value={classLevelFilter} onChange={handleClassLevelFilterChange}>
            <option value="">ระดับชั้น</option>
            {classLevelOptions.map((level) => <option key={level} value={level}>{level}</option>)}
          </FilterDropdown>
          <FilterDropdown value={classroomFilter} onChange={setClassroomFilter}>
            <option value="">ห้องเรียน</option>
            {classroomOptions.map((classroom) => <option key={classroom} value={classroom}>{classroom}</option>)}
          </FilterDropdown>
          <FilterDropdown value={learningAreaFilter} onChange={setLearningAreaFilter}>
            <option value="">กลุ่มสาระการเรียนรู้</option>
            {learningAreaOptions.map((area) => <option key={area} value={area}>{area}</option>)}
          </FilterDropdown>
          <FilterDropdown value={subjectFilter} onChange={setSubjectFilter}>
            <option value="">วิชา</option>
            {subjectOptions.map((subject) => (
              <option key={subject.subjectId} value={subject.subjectId}>{subject.subjectName}</option>
            ))}
          </FilterDropdown>
          <FilterDropdown value={semesterFilter} onChange={setSemesterFilter}>
            <option value="">ภาคเรียน</option>
            {semesters.map((semester) => (
              <option key={semester.id} value={String(semester.semester_number)}>
                ภาคเรียนที่ {semester.semester_number}
              </option>
            ))}
          </FilterDropdown>
        </div>
      </section>

      {error && (
        <div className="mx-auto max-w-5xl rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="mx-auto max-w-5xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="text-lg font-extrabold text-slate-900">รายการ ปพ.5 ที่เสร็จสมบูรณ์แล้ว</h2>
            {!showBrowseMenu && classLevelFilter && !searchTerm.trim() ? (
              <button
                type="button"
                onClick={() => {
                  setClassLevelFilter('');
                  setClassroomFilter('');
                }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                กลับเลือกระดับชั้น
              </button>
            ) : null}
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
            ปีการศึกษา {yearLabel || '-'} · {filteredReports.length.toLocaleString('th-TH')} รายการ
          </span>
        </div>

        {loading ? (
          <div className="ui-card flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
            กำลังโหลดรายการ ปพ.5...
          </div>
        ) : showBrowseMenu ? (
          <>
            <ClassLevelBrowseMenu
              selectedLevel={classLevelFilter}
              onSelectLevel={handleBrowseLevelSelect}
            />
            <div className="mt-7 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <button
                type="button"
                onClick={handleShowAllReportsTable}
                disabled={loading || reports.length === 0 || bulkDownloadWorking}
                className="group flex min-h-[58px] w-full max-w-[300px] items-center justify-center gap-3 rounded-xl border border-blue-700 bg-gradient-to-b from-sky-500 to-blue-700 px-4 py-3 text-white shadow-[0_10px_22px_-14px_rgba(37,99,235,0.9)] transition hover:-translate-y-0.5 hover:from-sky-400 hover:to-blue-700 hover:shadow-[0_16px_30px_-18px_rgba(37,99,235,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                <BookOpenCheck className="h-5 w-5 shrink-0" />
                <span className="min-w-0 text-lg font-extrabold leading-tight">ปพ.5 ทั้งหมด</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleDownloadAllReports();
                }}
                disabled={loading || reports.length === 0 || actionBusy}
                className="group flex min-h-[58px] w-full max-w-[300px] items-center justify-center gap-3 rounded-xl border border-emerald-700 bg-gradient-to-b from-emerald-500 to-teal-700 px-4 py-3 text-white shadow-[0_10px_22px_-14px_rgba(5,150,105,0.9)] transition hover:-translate-y-0.5 hover:from-emerald-400 hover:to-teal-700 hover:shadow-[0_16px_30px_-18px_rgba(5,150,105,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {bulkDownloadWorking ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : <Download className="h-5 w-5 shrink-0" />}
                <span className="min-w-0 text-lg font-extrabold leading-tight">บันทึก ปพ.5 ทั้งหมด</span>
              </button>
            </div>
          </>
        ) : filteredReports.length === 0 ? (
          <div className="ui-card py-16 text-center text-slate-400">
            <BookOpenCheck className="mx-auto mb-3 h-10 w-10 opacity-40" />
            ไม่พบ ปพ.5 ที่เสร็จสมบูรณ์ตามเงื่อนไขที่เลือก
          </div>
        ) : (
          <div className="space-y-2">
            {filteredReports.map((report) => (
              <div key={report.gradebook.id}>
                <CompletedReportCard
                  report={report}
                  filterContext={filterContext}
                  onOpen={(report) => {
                    void openReport(report);
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
    </>
  );
};

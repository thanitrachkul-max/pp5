import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { History, Loader2, RefreshCw, Search, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { AppUser, Semester } from '../../types';

interface StudentRosterEditsPageProps {
  currentUser: AppUser;
  initialYearId?: string;
}

interface GradebookRosterRow {
  id: string;
  teaching_assignment_id: string;
  teacher_id: string;
  students: unknown;
  updated_at: string | null;
  created_at: string | null;
}

interface AssignmentRosterRow {
  id: string;
  teacher_id: string;
  semester_id: string;
  profiles?: {
    full_name: string;
    title: string | null;
    username: string | null;
  } | null;
  subjects?: {
    subject_code: string;
    subject_name: string;
    learning_area: string;
  } | null;
  classrooms?: {
    name: string;
    class_level_code: string;
  } | null;
}

interface RosterStudent {
  id: string;
  studentId: string;
  citizenId: string;
  name: string;
  targetPercentage: number | null;
}

interface RosterReport {
  gradebookId: string;
  teacherName: string;
  subjectCode: string;
  subjectName: string;
  learningArea: string;
  classroomName: string;
  semesterNumber: number | null;
  updatedAt: string | null;
  students: RosterStudent[];
}

interface RosterAuditRow {
  id: string;
  teaching_assignment_id: string;
  teacher_id: string;
  student_id: string;
  action: 'add' | 'update' | 'remove';
  before_data: unknown;
  after_data: unknown;
  created_at: string;
}

interface RosterActivity {
  id: string;
  teacherName: string;
  studentName: string;
  studentCode: string;
  action: 'add' | 'update' | 'remove';
  actionLabel: string;
  detail: string;
  subjectLabel: string;
  classroomName: string;
  createdAt: string;
}

function normalizeStudents(value: unknown): RosterStudent[] {
  if (!Array.isArray(value)) return [];

  return value.map((student, index) => {
    const row = (student ?? {}) as Record<string, unknown>;
    const composedName = [
      row.title,
      row.firstName ?? row.first_name,
      row.lastName ?? row.last_name,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      id: String(row.id ?? index),
      studentId: String(row.studentId ?? row.student_code ?? row.code ?? ''),
      citizenId: String(row.citizenId ?? row.citizen_id ?? ''),
      name: String(row.name ?? row.fullName ?? row.full_name ?? composedName ?? ''),
      targetPercentage:
        typeof row.targetPercentage === 'number'
          ? row.targetPercentage
          : typeof row.target_percentage === 'number'
            ? row.target_percentage
            : null,
    };
  });
}

function profileName(profile: AssignmentRosterRow['profiles']): string {
  if (!profile) return 'ไม่พบชื่อครู';
  return [profile.title, profile.full_name].filter(Boolean).join(' ');
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function snapshotRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function snapshotValue(snapshot: Record<string, unknown> | null, ...keys: string[]): string {
  for (const key of keys) {
    const value = snapshot?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function snapshotName(snapshot: Record<string, unknown> | null): string {
  const direct = snapshotValue(snapshot, 'name', 'fullName', 'full_name');
  if (direct) return direct;
  return [
    snapshotValue(snapshot, 'title'),
    snapshotValue(snapshot, 'firstName', 'first_name'),
    snapshotValue(snapshot, 'lastName', 'last_name'),
  ].filter(Boolean).join(' ');
}

function auditActionLabel(action: RosterActivity['action']): string {
  if (action === 'add') return 'เพิ่มนักเรียน';
  if (action === 'remove') return 'ลบนักเรียน';
  return 'แก้ไขข้อมูลนักเรียน';
}

function auditDetail(row: RosterAuditRow): string {
  const before = snapshotRecord(row.before_data);
  const after = snapshotRecord(row.after_data);
  if (row.action === 'add') {
    return `เพิ่ม ${snapshotName(after) || 'นักเรียน'} เข้าห้องเรียน`;
  }
  if (row.action === 'remove') {
    return `นำ ${snapshotName(before) || 'นักเรียน'} ออกจากห้องเรียน`;
  }

  const changes: string[] = [];
  const beforeCode = snapshotValue(before, 'studentId', 'student_code');
  const afterCode = snapshotValue(after, 'studentId', 'student_code');
  const beforeName = snapshotName(before);
  const afterName = snapshotName(after);
  if (beforeCode !== afterCode) changes.push(`รหัส ${beforeCode || '-'} → ${afterCode || '-'}`);
  if (beforeName !== afterName) changes.push(`ชื่อ ${beforeName || '-'} → ${afterName || '-'}`);
  const beforeCitizen = snapshotValue(before, 'citizenId', 'citizen_id');
  const afterCitizen = snapshotValue(after, 'citizenId', 'citizen_id');
  if (beforeCitizen !== afterCitizen) changes.push('เลขประจำตัวประชาชน');
  return changes.length > 0 ? changes.join(' · ') : 'แก้ไขข้อมูลนักเรียน';
}

function isMissingAuditTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return code === 'PGRST205' || code === '42P01' || message.includes('student_roster_audit_logs');
}

export const StudentRosterEditsPage: React.FC<StudentRosterEditsPageProps> = ({
  currentUser,
  initialYearId,
}) => {
  const [reports, setReports] = useState<RosterReport[]>([]);
  const [activities, setActivities] = useState<RosterActivity[]>([]);
  const [yearLabel, setYearLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

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
        setYearLabel('');
        return;
      }

      const { data: semesterRows, error: semesterError } = await supabase
        .from('semesters')
        .select('*')
        .eq('academic_year_id', targetYearId)
        .order('semester_number');

      if (semesterError) throw semesterError;
      const semesters = (semesterRows ?? []) as Semester[];
      const semesterIds = semesters.map((semester) => semester.id);

      if (semesterIds.length === 0) {
        setReports([]);
        setYearLabel(targetYearLabel);
        return;
      }

      const { data: assignmentRows, error: assignmentError } = await supabase
        .from('teaching_assignments')
        .select(`
          id,
          teacher_id,
          semester_id,
          profiles:teacher_id(full_name, title, username),
          subjects:subject_id(subject_code, subject_name, learning_area),
          classrooms:classroom_id(name, class_level_code)
        `)
        .eq('school_id', currentUser.schoolId)
        .in('semester_id', semesterIds)
        .order('created_at', { ascending: false });

      if (assignmentError) throw assignmentError;

      const assignments = (assignmentRows ?? []) as unknown as AssignmentRosterRow[];
      const assignmentIds = assignments.map((assignment) => assignment.id);

      let gradebookRows: unknown[] = [];
      if (assignmentIds.length > 0) {
        const { data, error: gradebookError } = await supabase
          .from('gradebooks')
          .select('id, teaching_assignment_id, teacher_id, students, updated_at, created_at')
          .in('teaching_assignment_id', assignmentIds)
          .order('updated_at', { ascending: false });

        if (gradebookError) throw gradebookError;
        gradebookRows = data ?? [];
      }

      const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
      const mapped = ((gradebookRows ?? []) as GradebookRosterRow[])
        .flatMap((gradebook): RosterReport[] => {
          const assignment = assignmentById.get(gradebook.teaching_assignment_id);
          if (!assignment) return [];
          const semester = semesters.find((item) => item.id === assignment.semester_id);
          return [
            {
              gradebookId: gradebook.id,
              teacherName: profileName(assignment.profiles),
              subjectCode: assignment.subjects?.subject_code ?? '',
              subjectName: assignment.subjects?.subject_name ?? 'ไม่พบรายวิชา',
              learningArea: assignment.subjects?.learning_area ?? 'ไม่ระบุกลุ่มสาระ',
              classroomName: assignment.classrooms?.name ?? 'ไม่พบห้องเรียน',
              semesterNumber: semester?.semester_number ?? null,
              updatedAt: gradebook.updated_at ?? gradebook.created_at,
              students: normalizeStudents(gradebook.students),
            },
          ];
        });

      setReports(mapped);

      let auditRows: RosterAuditRow[] = [];
      if (assignmentIds.length > 0) {
        const { data, error: auditError } = await supabase
          .from('student_roster_audit_logs')
          .select('id, teaching_assignment_id, teacher_id, student_id, action, before_data, after_data, created_at')
          .eq('school_id', currentUser.schoolId)
          .in('teaching_assignment_id', assignmentIds)
          .order('created_at', { ascending: false })
          .limit(500);

        if (auditError && !isMissingAuditTableError(auditError)) throw auditError;
        auditRows = (data ?? []) as RosterAuditRow[];
      }

      const teacherIds = Array.from(new Set(auditRows.map((row) => row.teacher_id).filter(Boolean)));
      const teacherById = new Map<string, string>();
      if (teacherIds.length > 0) {
        const { data: teachers, error: teacherError } = await supabase
          .from('profiles')
          .select('id, title, full_name')
          .in('id', teacherIds);
        if (teacherError) throw teacherError;
        for (const teacher of teachers ?? []) {
          teacherById.set(teacher.id, [teacher.title, teacher.full_name].filter(Boolean).join(' '));
        }
      }

      const activityItems = auditRows.flatMap((row): RosterActivity[] => {
        const assignment = assignmentById.get(row.teaching_assignment_id);
        if (!assignment) return [];
        const before = snapshotRecord(row.before_data);
        const after = snapshotRecord(row.after_data);
        const snapshot = row.action === 'remove' ? before : after;
        return [{
          id: row.id,
          teacherName: teacherById.get(row.teacher_id) || profileName(assignment.profiles),
          studentName: snapshotName(snapshot) || 'ไม่ระบุชื่อ',
          studentCode: snapshotValue(snapshot, 'studentId', 'student_code'),
          action: row.action,
          actionLabel: auditActionLabel(row.action),
          detail: auditDetail(row),
          subjectLabel: [assignment.subjects?.subject_code, assignment.subjects?.subject_name].filter(Boolean).join(' '),
          classroomName: assignment.classrooms?.name ?? 'ไม่พบห้องเรียน',
          createdAt: row.created_at,
        }];
      });

      setActivities(activityItems);
      setYearLabel(targetYearLabel);
    } catch (err) {
      const databaseError = err as {
        code?: unknown;
        message?: unknown;
        details?: unknown;
        hint?: unknown;
      };
      console.warn(
        'Unable to load student roster edits:',
        JSON.stringify({
          code: databaseError?.code,
          message: databaseError?.message,
          details: databaseError?.details,
          hint: databaseError?.hint,
        }),
      );
      setReports([]);
      setActivities([]);
      setError('โหลดข้อมูลการแก้ไขรายชื่อนักเรียนไม่สำเร็จ กรุณารีเฟรชหน้าเว็บแล้วลองใหม่');
    } finally {
      setLoading(false);
    }
  }, [currentUser.schoolId, initialYearId]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  useEffect(() => {
    if (!currentUser.schoolId) return;
    const channel = supabase
      .channel('student-roster-audit-admin')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'student_roster_audit_logs',
          filter: `school_id=eq.${currentUser.schoolId}`,
        },
        () => void loadReports(),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [currentUser.schoolId, loadReports]);

  const visibleReports = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return reports;

    return reports.filter((report) => {
      const haystack = [
        report.teacherName,
        report.subjectCode,
        report.subjectName,
        report.learningArea,
        report.classroomName,
        ...report.students.flatMap((student) => [
          student.studentId,
          student.citizenId,
          student.name,
        ]),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [query, reports]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-blue-600">
            <Users className="h-5 w-5" />
            <span className="text-xs font-extrabold uppercase tracking-[0.16em]">
              รายชื่อนักเรียนในสมุด ปพ.5
            </span>
          </div>
          <h4 className="mt-2 text-[22px] font-extrabold tracking-tight text-slate-900">
            การแก้ไขข้อมูลนักเรียน
          </h4>
          <p className="mt-1 text-sm text-slate-500">
            แสดงรายชื่อนักเรียนที่ถูกบันทึกไว้ในสมุด ปพ.5 ของครู ปีการศึกษา {yearLabel || '—'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadReports()}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          รีเฟรช
        </button>
      </div>

      <div className="ui-card p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาครู วิชา ห้องเรียน หรือชื่อนักเรียน"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
        </label>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          กำลังโหลด...
        </div>
      ) : activities.length === 0 && visibleReports.length === 0 ? (
        <div className="ui-card p-10 text-center text-sm text-slate-500">
          ยังไม่พบข้อมูลรายชื่อนักเรียนในสมุด ปพ.5
        </div>
      ) : (
        <div className="space-y-6">
          {activities.length > 0 && (
            <section className="ui-card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <History className="h-5 w-5 text-blue-600" />
                <div>
                  <h5 className="text-base font-extrabold text-slate-900">กิจกรรมการแก้ไขรายชื่อนักเรียน</h5>
                  <p className="mt-0.5 text-xs text-slate-500">บันทึกการเพิ่ม แก้ไข และลบนักเรียนจากสมุด ปพ.5</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-slate-900 text-xs font-bold text-white">
                    <tr>
                      <th className="w-40 px-4 py-3">วันเวลา</th>
                      <th className="w-36 px-4 py-3">การดำเนินการ</th>
                      <th className="px-4 py-3">รายละเอียด</th>
                      <th className="w-44 px-4 py-3">ครูผู้ดำเนินการ</th>
                      <th className="w-56 px-4 py-3">วิชา / ห้องเรียน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.map((activity) => (
                      <tr key={activity.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(activity.createdAt)}</td>
                        <td className="px-4 py-3 font-bold text-slate-800">{activity.actionLabel}</td>
                        <td className="px-4 py-3 text-slate-700">
                          <div>{activity.detail}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {activity.studentCode ? `รหัส ${activity.studentCode} · ` : ''}{activity.studentName}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">{activity.teacherName}</td>
                        <td className="px-4 py-3 text-slate-600">
                          <div>{activity.subjectLabel || 'ไม่พบรายวิชา'}</div>
                          <div className="mt-1 text-xs text-slate-400">{activity.classroomName}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {visibleReports.length > 0 && (
            <section>
              <h5 className="mb-3 text-base font-extrabold text-slate-900">รายชื่อนักเรียนล่าสุดในสมุด ปพ.5</h5>
              <div className="space-y-4">
                {visibleReports.map((report) => (
                  <section key={report.gradebookId} className="ui-card overflow-hidden">
                    <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h5 className="text-base font-extrabold text-slate-900">
                          {report.subjectCode} {report.subjectName}
                        </h5>
                        <p className="mt-1 text-sm text-slate-500">
                          {report.classroomName} · ภาคเรียนที่ {report.semesterNumber ?? '—'} · ครูผู้สอน {report.teacherName}
                        </p>
                      </div>
                      <div className="text-sm font-semibold text-slate-600">
                        {report.students.length.toLocaleString('th-TH')} คน · แก้ไขล่าสุด {formatDateTime(report.updatedAt)}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="bg-slate-900 text-xs font-bold text-white">
                          <tr>
                            <th className="w-16 px-4 py-3 text-center">ลำดับ</th>
                            <th className="px-4 py-3">เลขประจำตัว</th>
                            <th className="px-4 py-3">เลขประจำตัวประชาชน</th>
                            <th className="px-4 py-3">ชื่อ-สกุล</th>
                            <th className="w-36 px-4 py-3 text-center">เป้าหมายเวลาเรียน</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.students.map((student, index) => (
                            <tr key={`${report.gradebookId}-${student.id}-${index}`} className="border-b border-slate-100 last:border-b-0">
                              <td className="px-4 py-3 text-center">{index + 1}</td>
                              <td className="px-4 py-3 font-medium text-slate-800">{student.studentId || '—'}</td>
                              <td className="px-4 py-3 text-slate-600">{student.citizenId || '—'}</td>
                              <td className="px-4 py-3 text-slate-800">{student.name || '—'}</td>
                              <td className="px-4 py-3 text-center text-slate-600">
                                {student.targetPercentage == null ? '—' : `${student.targetPercentage}%`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

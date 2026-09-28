import { supabase } from "./supabase";
import { getErrorMessage, isSchemaCacheErrorFor } from "./dbErrors";
import { buildStudentRoster } from "./teacherGradebooks";
import { mergeRosterWithSavedState } from "./studentRoster";
import { splitStudentNameForAcademicRecord, UUID_PATTERN } from "./studentNames";
import {
  activityStatusFromStats,
  buildActivityGeneralInfo,
  computeActivityStats,
  emptyActivityAssessments,
  EMPTY_ACTIVITY_APPROVAL,
  normalizeActivityAssessments,
  type ActivityApprovalState,
  type ActivityApprovalStatus,
  type ActivityGeneralInfo,
  type StudentActivityData,
} from "./studentActivities";
import type { AppData, Student } from "../types";

export const STUDENT_ACTIVITY_MIGRATION_MESSAGE =
  "ฐานข้อมูลยังไม่รองรับการบันทึกกิจกรรมพัฒนาผู้เรียน กรุณารัน migration `supabase/migrations/0055_student_activity_records.sql` ใน Supabase SQL Editor";

export type StudentActivityRecordStatus = "not_started" | "in_progress" | "completed";

export interface StudentActivityClassroomOption {
  classroomId: string;
  classroomName: string;
  classLevelCode: string;
  roomNumber: number;
  academicYearId: string;
  recordId: string | null;
  completionPercent: number;
  status: StudentActivityRecordStatus | null;
  approvalStatus: ActivityApprovalStatus | null;
  approvalReason: string | null;
}

export interface StudentActivitySession {
  id: string;
  schoolId: string | null;
  classroomId: string;
  academicYearId: string;
  yearBe: number;
  yearIsActive: boolean;
  /** ไม่มีสิทธิ์แก้ไข (ไม่ใช่ครูประจำชั้น หรือปีการศึกษาปิดแล้ว) */
  readOnly: boolean;
  /** ผู้ดูแลระบบพิจารณาอนุมัติได้ */
  canReview: boolean;
  approval: ActivityApprovalState;
  data: StudentActivityData;
}

/** ช่องทางบันทึกข้อมูลของหน้าบันทึกกิจกรรม (แยกไว้ให้หน้าตัวอย่างใช้ข้อมูลในเครื่องได้) */
export interface StudentActivityBackend {
  save(data: StudentActivityData): Promise<void>;
  loadRoster(): Promise<Student[]>;
  subscribeRoster(onChange: () => void): () => void;
  addStudent(student: Student): Promise<Student>;
  updateStudent(student: Student, previousStudent?: Student): Promise<void>;
  removeStudent(student: Student): Promise<void>;
  submit(): Promise<ActivityApprovalState>;
  review(status: "approved" | "revision_requested", reason?: string): Promise<ActivityApprovalState>;
  subscribeApproval(onChange: (approval: ActivityApprovalState) => void): () => void;
}

type RawApprovalFields = {
  approval_status?: ActivityApprovalStatus | null;
  approval_reason?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
};

type RawActivityRecord = RawApprovalFields & {
  id: string;
  school_id: string;
  academic_year_id: string;
  classroom_id: string;
  general_info: Partial<ActivityGeneralInfo> | null;
  students: Student[] | null;
  attendance: AppData["attendance"] | null;
  assessments: unknown;
  stats: { completionPercent?: number } | null;
  status: StudentActivityRecordStatus | null;
};

type ActivityContext = {
  school_id: string | null;
  school_name: string | null;
  classroom: { id: string; name: string; class_level_code: string | null; room_number: number | null };
  year: {
    id: string;
    year_be: number;
    is_active: boolean;
    start_date: string | null;
    end_date: string | null;
    study_start_date: string | null;
    study_end_date: string | null;
  };
  semesters: Array<{ semester_number: number; start_date: string | null; end_date: string | null }>;
  homeroom_teachers: Array<string | null>;
  officials: {
    head_of_activities?: string | null;
    head_of_evaluation?: string | null;
    deputy_director?: string | null;
    school_director?: string | null;
  } | null;
  can_edit: boolean;
  can_review?: boolean;
};

const APPROVAL_STATUSES = new Set<ActivityApprovalStatus>(["pending", "approved", "revision_requested"]);

export function parseActivityApproval(raw: RawApprovalFields | null | undefined): ActivityApprovalState {
  if (!raw) return EMPTY_ACTIVITY_APPROVAL;
  const status = raw.approval_status && APPROVAL_STATUSES.has(raw.approval_status) ? raw.approval_status : null;
  return {
    status,
    reason: typeof raw.approval_reason === "string" && raw.approval_reason.trim() ? raw.approval_reason : null,
    submittedAt: raw.submitted_at ?? null,
    reviewedAt: raw.reviewed_at ?? null,
  };
}

function isMissingActivitySchema(error: unknown): boolean {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  // 42703/PGRST204: an older copy of migration 0055 without the approval columns.
  if (code === "42P01" || code === "42703" || code === "PGRST202" || code === "PGRST204" || code === "PGRST205") {
    return true;
  }
  return (
    isSchemaCacheErrorFor(error, "student_activity_records") ||
    isSchemaCacheErrorFor(error, "get_student_activity_context") ||
    isSchemaCacheErrorFor(error, "submit_student_activity_record") ||
    isSchemaCacheErrorFor(error, "review_student_activity_record") ||
    isSchemaCacheErrorFor(error, "approval_status") ||
    isSchemaCacheErrorFor(error, "homeroom_")
  );
}

function activityError(error: unknown, fallback: string): Error {
  if (isMissingActivitySchema(error)) return new Error(STUDENT_ACTIVITY_MIGRATION_MESSAGE);
  return new Error(getErrorMessage(error, fallback));
}

function parseCompletion(stats: RawActivityRecord["stats"]): number {
  const value = Number(stats?.completionPercent);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.floor(value))) : 0;
}

type ClassroomRow = {
  id: string;
  name: string;
  class_level_code: string;
  room_number: number;
  academic_year_id: string;
};

async function queryActivityClassrooms(options: {
  teacherId: string;
  academicYearIds: string[];
  includeAllClassrooms?: boolean;
}): Promise<ClassroomRow[]> {
  const runQuery = (homeroomFields: string[]) => {
    let query = supabase
      .from("classrooms")
      .select("id, name, class_level_code, room_number, academic_year_id")
      .in("academic_year_id", options.academicYearIds)
      .order("class_level_code")
      .order("room_number");
    if (!options.includeAllClassrooms) {
      query = query.or(homeroomFields.map((field) => `${field}.eq.${options.teacherId}`).join(","));
    }
    return query;
  };

  let result = await runQuery(["homeroom_teacher_id", "homeroom_teacher_2_id", "homeroom_teacher_3_id"]);
  if (result.error && isSchemaCacheErrorFor(result.error, "homeroom_teacher_3_id")) {
    result = await runQuery(["homeroom_teacher_id", "homeroom_teacher_2_id"]);
  }
  if (result.error) throw new Error(getErrorMessage(result.error, "โหลดห้องเรียนไม่สำเร็จ"));
  return (result.data ?? []) as ClassroomRow[];
}

async function attachActivityRecords(
  rows: ClassroomRow[],
): Promise<{ classrooms: StudentActivityClassroomOption[]; migrationMissing: boolean }> {
  type RecordRow = Pick<RawActivityRecord, "id" | "classroom_id" | "academic_year_id" | "stats" | "status"> & RawApprovalFields;
  const records = new Map<string, RecordRow>();
  let migrationMissing = false;
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from("student_activity_records")
      .select("id, classroom_id, academic_year_id, stats, status, approval_status, approval_reason")
      .in("classroom_id", rows.map((row) => row.id));
    if (error) {
      if (!isMissingActivitySchema(error)) throw new Error(getErrorMessage(error, "โหลดสถานะการบันทึกไม่สำเร็จ"));
      migrationMissing = true;
    }
    for (const row of (data ?? []) as RecordRow[]) {
      records.set(`${row.classroom_id}:${row.academic_year_id}`, row);
    }
  }

  return {
    migrationMissing,
    classrooms: rows.map((row) => {
      const record = records.get(`${row.id}:${row.academic_year_id}`);
      const approval = parseActivityApproval(record);
      return {
        classroomId: row.id,
        classroomName: row.name,
        classLevelCode: row.class_level_code,
        roomNumber: row.room_number,
        academicYearId: row.academic_year_id,
        recordId: record?.id ?? null,
        completionPercent: parseCompletion(record?.stats ?? null),
        status: record?.status ?? null,
        approvalStatus: approval.status,
        approvalReason: approval.reason,
      };
    }),
  };
}

/** ห้องเรียนที่เปิดบันทึกกิจกรรมพัฒนาผู้เรียนได้ในปีการศึกษา (ครู: ห้องที่เป็นครูประจำชั้น) */
export async function fetchStudentActivityClassrooms(options: {
  teacherId: string;
  academicYearId: string;
  includeAllClassrooms?: boolean;
}): Promise<{ classrooms: StudentActivityClassroomOption[]; migrationMissing: boolean }> {
  const rows = await queryActivityClassrooms({
    teacherId: options.teacherId,
    academicYearIds: [options.academicYearId],
    includeAllClassrooms: options.includeAllClassrooms,
  });
  return attachActivityRecords(rows);
}

/** สถานะการส่งการประเมินกิจกรรมของห้องที่ครูเป็นครูประจำชั้น แยกตามปีการศึกษา (ใช้ในตารางหน้าครู) */
export async function fetchHomeroomActivityStatuses(options: {
  teacherId: string;
  academicYearIds: string[];
}): Promise<{ byYear: Map<string, StudentActivityClassroomOption[]>; migrationMissing: boolean }> {
  const academicYearIds = Array.from(new Set(options.academicYearIds.filter(Boolean)));
  if (academicYearIds.length === 0) return { byYear: new Map(), migrationMissing: false };
  const rows = await queryActivityClassrooms({ teacherId: options.teacherId, academicYearIds });
  const { classrooms, migrationMissing } = await attachActivityRecords(rows);
  const byYear = new Map<string, StudentActivityClassroomOption[]>();
  for (const classroom of classrooms) {
    const list = byYear.get(classroom.academicYearId) ?? [];
    list.push(classroom);
    byYear.set(classroom.academicYearId, list);
  }
  return { byYear, migrationMissing };
}

async function selectActivityRecord(classroomId: string, academicYearId: string): Promise<RawActivityRecord | null> {
  const { data, error } = await supabase
    .from("student_activity_records")
    .select("*")
    .eq("classroom_id", classroomId)
    .eq("academic_year_id", academicYearId)
    .maybeSingle();
  if (error) throw activityError(error, "โหลดบันทึกกิจกรรมพัฒนาผู้เรียนไม่สำเร็จ");
  return (data as RawActivityRecord | null) ?? null;
}

export async function loadStudentActivitySession(classroomId: string): Promise<StudentActivitySession> {
  const { data: rawContext, error: contextError } = await supabase.rpc("get_student_activity_context", {
    p_classroom_id: classroomId,
  });
  if (contextError) throw activityError(contextError, "เปิดบันทึกกิจกรรมพัฒนาผู้เรียนไม่สำเร็จ");
  const context = rawContext as ActivityContext;
  const semester1 = context.semesters.find((semester) => semester.semester_number === 1);
  const semester2 = context.semesters.find((semester) => semester.semester_number === 2);

  const [roster, existingRecord] = await Promise.all([
    buildStudentRoster(classroomId, context.year.id),
    selectActivityRecord(classroomId, context.year.id),
  ]);

  const generalInfo = buildActivityGeneralInfo(
    {
      schoolName: context.school_name,
      classroomName: context.classroom.name,
      classLevelCode: context.classroom.class_level_code,
      yearBe: context.year.year_be,
      homeroomTeachers: context.homeroom_teachers.map((name) => name ?? ""),
      officials: {
        headOfActivities: context.officials?.head_of_activities ?? "",
        headOfEvaluation: context.officials?.head_of_evaluation ?? "",
        deputyDirector: context.officials?.deputy_director ?? "",
        schoolDirector: context.officials?.school_director ?? "",
      },
      studyStartDate: context.year.study_start_date ?? semester1?.start_date ?? context.year.start_date,
      studyEndDate: context.year.study_end_date ?? semester2?.end_date ?? context.year.end_date,
      semester1EndDate: semester1?.end_date,
      semester2StartDate: semester2?.start_date,
    },
    existingRecord?.general_info,
  );

  let record = existingRecord;
  if (!record && context.can_edit) {
    const initialData: StudentActivityData = {
      generalInfo,
      students: roster,
      attendance: {},
      assessments: emptyActivityAssessments(),
    };
    const stats = computeActivityStats(initialData);
    const { data: inserted, error: insertError } = await supabase
      .from("student_activity_records")
      .insert({
        school_id: context.school_id,
        academic_year_id: context.year.id,
        classroom_id: classroomId,
        general_info: generalInfo,
        students: roster,
        attendance: {},
        assessments: initialData.assessments,
        stats,
        status: activityStatusFromStats(stats),
      })
      .select("*")
      .single();
    if (insertError) {
      // Another homeroom teacher may have opened the same classroom at the same moment.
      record = await selectActivityRecord(classroomId, context.year.id);
      if (!record) throw activityError(insertError, "สร้างบันทึกกิจกรรมพัฒนาผู้เรียนไม่สำเร็จ");
    } else {
      record = inserted as RawActivityRecord;
    }
  }

  return {
    id: record?.id ?? "",
    schoolId: context.school_id,
    classroomId,
    academicYearId: context.year.id,
    yearBe: context.year.year_be,
    yearIsActive: context.year.is_active,
    readOnly: !context.can_edit || !record,
    canReview: Boolean(context.can_review) && Boolean(record),
    approval: parseActivityApproval(record),
    data: {
      generalInfo,
      students: mergeRosterWithSavedState(roster, Array.isArray(record?.students) ? record.students : []),
      attendance: record?.attendance ?? {},
      assessments: normalizeActivityAssessments(record?.assessments),
    },
  };
}

export async function saveStudentActivityRecord(recordId: string, data: StudentActivityData): Promise<void> {
  const stats = computeActivityStats(data);
  const { data: saved, error } = await supabase
    .from("student_activity_records")
    .update({
      general_info: data.generalInfo,
      students: data.students,
      attendance: data.attendance,
      assessments: data.assessments,
      stats,
      status: activityStatusFromStats(stats),
    })
    .eq("id", recordId)
    .select("id")
    .maybeSingle();
  if (error) throw activityError(error, "บันทึกไม่สำเร็จ");
  if (!saved) throw new Error("ไม่สามารถบันทึกข้อมูลได้ กรุณาตรวจสอบสิทธิ์ครูประจำชั้น");
}

export function createSupabaseActivityBackend(
  session: Pick<StudentActivitySession, "id" | "classroomId" | "academicYearId" | "schoolId">,
): StudentActivityBackend {
  const studentPayload = (student: Student) => {
    const studentCode = student.studentId.trim();
    const { title, firstName, lastName } = splitStudentNameForAcademicRecord(student.name);
    if (!studentCode || !firstName.trim()) {
      throw new Error("กรุณากรอกรหัสนักเรียนและชื่อนักเรียนก่อนบันทึก");
    }
    return {
      studentCode,
      citizenId: student.citizenId?.trim() || null,
      title,
      firstName,
      lastName,
    };
  };

  return {
    save: (data) => saveStudentActivityRecord(session.id, data),
    loadRoster: () => buildStudentRoster(session.classroomId, session.academicYearId),
    subscribeRoster(onChange) {
      let channel = supabase.channel(`student-activity-roster-${session.classroomId}`);
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "student_enrollments",
          filter: `academic_year_id=eq.${session.academicYearId}`,
        },
        () => onChange(),
      );
      if (session.schoolId) {
        channel = channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "students", filter: `school_id=eq.${session.schoolId}` },
          () => onChange(),
        );
      }
      channel.subscribe();
      return () => {
        void supabase.removeChannel(channel);
      };
    },
    async addStudent(student) {
      const payload = studentPayload(student);
      const { data: studentId, error } = await supabase.rpc("homeroom_add_classroom_student", {
        p_classroom_id: session.classroomId,
        p_student_code: payload.studentCode,
        p_citizen_id: payload.citizenId,
        p_title: payload.title,
        p_first_name: payload.firstName,
        p_last_name: payload.lastName,
        p_student_number: student.studentNumber ?? null,
      });
      if (error) throw activityError(error, "ไม่สามารถเพิ่มนักเรียนในฐานข้อมูลกลางได้");
      if (typeof studentId !== "string" || !UUID_PATTERN.test(studentId)) {
        throw new Error("ระบบไม่ได้รับรหัสนักเรียนที่บันทึกจากฐานข้อมูลกลาง");
      }
      return {
        ...student,
        id: studentId,
        studentId: payload.studentCode,
        citizenId: payload.citizenId ?? undefined,
        name: [payload.title, payload.firstName, payload.lastName].filter(Boolean).join(" "),
      };
    },
    async updateStudent(student, previousStudent) {
      const payload = studentPayload(student);
      const { error } = await supabase.rpc("homeroom_update_classroom_student", {
        p_classroom_id: session.classroomId,
        p_student_id: UUID_PATTERN.test(student.id) ? student.id : null,
        p_previous_student_code: previousStudent?.studentId.trim() || payload.studentCode,
        p_student_code: payload.studentCode,
        p_citizen_id: payload.citizenId,
        p_title: payload.title,
        p_first_name: payload.firstName,
        p_last_name: payload.lastName,
      });
      if (error) throw activityError(error, "ไม่สามารถอัปเดตข้อมูลนักเรียนในฐานข้อมูลกลางได้");
    },
    async removeStudent(student) {
      // A row that was never saved centrally only exists in this editor.
      if (!UUID_PATTERN.test(student.id)) return;
      const roster = await buildStudentRoster(session.classroomId, session.academicYearId);
      if (!roster.some((current) => current.id === student.id)) return;
      const { error } = await supabase.rpc("homeroom_remove_classroom_student", {
        p_classroom_id: session.classroomId,
        p_student_id: student.id,
      });
      if (error) throw activityError(error, "ไม่สามารถลบนักเรียนออกจากห้องเรียนได้");
    },
    async submit() {
      const { data, error } = await supabase.rpc("submit_student_activity_record", { p_record_id: session.id });
      if (error) throw activityError(error, "ส่งการประเมินกิจกรรมพัฒนาผู้เรียนไม่สำเร็จ");
      return parseActivityApproval(data as RawApprovalFields);
    },
    async review(status, reason) {
      const { data, error } = await supabase.rpc("review_student_activity_record", {
        p_record_id: session.id,
        p_status: status,
        p_reason: reason ?? null,
      });
      if (error) throw activityError(error, "บันทึกผลการพิจารณาไม่สำเร็จ");
      return parseActivityApproval(data as RawApprovalFields);
    },
    subscribeApproval(onChange) {
      const channel = supabase
        .channel(`student-activity-approval-${session.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "student_activity_records", filter: `id=eq.${session.id}` },
          (payload) => onChange(parseActivityApproval(payload.new as RawApprovalFields)),
        )
        .subscribe();
      return () => {
        void supabase.removeChannel(channel);
      };
    },
  };
}

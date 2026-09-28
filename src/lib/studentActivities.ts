import type { AppData, Student } from "../types";
import type { AttendancePeriodConfig } from "./attendanceSchedule";
import { classLevelFromCode, GUIDANCE_OBJECTIVES, SCOUT_UNITS } from "../data/studentActivityCurriculum.js";

/** เครื่องหมายรายการประเมิน: ผ่าน (ผ) / ไม่ผ่าน (มผ) */
export type ActivityMark = "ผ" | "มผ";
/** ผลการประเมินระดับกิจกรรม ใช้คำว่า ผ่าน / ไม่ผ่าน เท่านั้น */
export type ActivityResult = "ผ่าน" | "ไม่ผ่าน";
/** กิจกรรมพัฒนาผู้เรียน 4 กิจกรรม เรียงตามแท็บและตารางสรุปผล */
export type ActivityKind = "guidance" | "scout" | "club" | "social";
export const ACTIVITY_KINDS: readonly ActivityKind[] = ["guidance", "scout", "club", "social"];

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  guidance: "กิจกรรมแนะแนว",
  scout: "กิจกรรมลูกเสือ",
  club: "กิจกรรมชุมนุม",
  social: "กิจกรรมเพื่อสังคมและสาธารณประโยชน์",
};

export interface ActivityAssessmentItem {
  key: string;
  label: string;
}

export interface ActivityAssessmentGroup {
  key: string;
  label: string;
  items: ActivityAssessmentItem[];
}

export interface ActivityAssessmentDefinition {
  kind: ActivityKind;
  title: string;
  shortTitle: string;
  groups: ActivityAssessmentGroup[];
}

export interface ActivityGeneralInfo {
  schoolName: string;
  agencyName: string;
  logoUrl: string;
  /** ชื่อห้องเรียน เช่น ม.1/4 */
  gradeLevel: string;
  classLevelCode: string;
  academicYear: string;
  hoursPerWeek: string;
  hoursPerYear: string;
  homeroomTeacher1: string;
  homeroomTeacher2: string;
  homeroomTeacher3: string;
  headOfActivities: string;
  headOfEvaluation: string;
  deputyDirector: string;
  schoolDirector: string;
  approvalDate: string;
  studyStartDate: string;
  studyEndDate: string;
  /** วันสุดท้ายของช่วงเรียนภาคเรียนที่ 1 (ก่อนปิดภาค) */
  semester1EndDate: string;
  /** วันแรกของช่วงเรียนภาคเรียนที่ 2 (หลังปิดภาค) */
  semester2StartDate: string;
}

export type ActivityMarkRows = Record<string, Record<string, ActivityMark>>;

export interface ActivityAssessments {
  clubName: string;
  guidance: ActivityMarkRows;
  scout: ActivityMarkRows;
  club: ActivityMarkRows;
  social: ActivityMarkRows;
  /** ผลรายกิจกรรมที่ครูกำหนดเองในแท็บสรุปผล ใช้แทนผลที่คำนวณจากรายการประเมิน */
  results: Record<string, Partial<Record<ActivityKind, ActivityResult>>>;
}

export interface StudentActivityData {
  generalInfo: ActivityGeneralInfo;
  students: Student[];
  attendance: AppData["attendance"];
  assessments: ActivityAssessments;
}

export interface StudentActivityStats {
  completionPercent: number;
  hasTeacherInput: boolean;
  studentCount: number;
  passedCount: number;
  failedCount: number;
}

export type ActivityApprovalStatus = "pending" | "approved" | "revision_requested";

export interface ActivityApprovalState {
  status: ActivityApprovalStatus | null;
  reason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
}

export const EMPTY_ACTIVITY_APPROVAL: ActivityApprovalState = {
  status: null,
  reason: null,
  submittedAt: null,
  reviewedAt: null,
};

export const ACTIVITY_HOURS_PER_WEEK = 3;
export const ACTIVITY_TEACHING_WEEKS = 40;
export const ACTIVITY_TOTAL_HOURS = ACTIVITY_HOURS_PER_WEEK * ACTIVITY_TEACHING_WEEKS;
export const ACTIVITY_MIN_ATTENDANCE_PERCENT = 80;
/** ร้อยละขั้นต่ำของรายการที่ได้ "ผ" จึงจะผ่านรายภาค/รายปี (ผ่าน = ร้อยละ 50 - 100) */
export const ACTIVITY_PASS_PERCENT = 50;
export const ACTIVITY_HEAD_LEARNING_AREA = "กิจกรรมพัฒนาผู้เรียน";

const DEFAULT_SCHOOL_NAME = "โรงเรียนกาฬสินธุ์ปัญญานุกูล จังหวัดกาฬสินธุ์";
const DEFAULT_AGENCY_NAME = "สำนักบริหารงานการศึกษาพิเศษ";
const DEFAULT_LOGO_URL = "/logo3.png";
const KALASIN_PANYANUKUL_SCHOOL_NAME_PART = "กาฬสินธุ์ปัญญานุกูล";
const KALASIN_DEFAULT_OFFICIALS = {
  headOfActivities: "นางสาว ธารดี มูลเมือง",
  headOfEvaluation: "นางสาว ประภาวดี ศรีทับ",
  deputyDirector: "นางสาว อัจฉราภรณ์ เศษวิ",
  schoolDirector: "นาย มีเกียรติ นาสมตรึก",
};

const CLUB_GROUPS: ActivityAssessmentGroup[] = [
  {
    key: "process",
    label: "1. ด้านกระบวนการ",
    items: [
      { key: "c1_1", label: "1. ศึกษาสภาพปัญหา/ความจำเป็น" },
      { key: "c1_2", label: "2. วิเคราะห์วางแผน" },
      { key: "c1_3", label: "3. ปฏิบัติตามแผน" },
      { key: "c1_4", label: "4. ติดตามและแก้ไขระหว่างการทำงาน" },
      { key: "c1_5", label: "5. ประเมินและปรับปรุงการทำงาน" },
    ],
  },
  {
    key: "objective",
    label: "2. ด้านจุดประสงค์/ตัวชี้วัด",
    items: [
      { key: "c2_1", label: "1. ความเป็นผู้นำ ผู้ตามที่ดี" },
      { key: "c2_2", label: "2. การทำงานร่วมกัน" },
      { key: "c2_3", label: "3. การรู้จักแก้ปัญหาอย่างมีเหตุผล" },
      { key: "c2_4", label: "4. การตัดสินใจที่เหมาะสม" },
      { key: "c2_5", label: "5. มีความเอื้ออาทรและสมานฉันท์" },
    ],
  },
  {
    key: "output",
    label: "3. ด้านกิจกรรม/ผลงาน",
    items: [
      { key: "c3_1", label: "1. การทำโครงงาน/ผลงาน/ชิ้นงาน" },
      { key: "c3_2", label: "2. การฝึกทักษะการคิดการตัดสินใจและการแก้ปัญหา" },
      { key: "c3_3", label: "3. การฝึกทักษะการวางแผนและการจัดการ" },
      { key: "c3_4", label: "4. การประยุกต์เทคโนโลยีกับภูมิปัญญาไทย" },
      { key: "c3_5", label: "5. การใช้ภาษาและการสื่อสาร" },
    ],
  },
];

const SOCIAL_GROUPS: ActivityAssessmentGroup[] = [
  {
    key: "objective",
    label: "1. ด้านจุดประสงค์/ตัวชี้วัด",
    items: [
      { key: "s1_1", label: "1. ความมีวินัย" },
      { key: "s1_2", label: "2. การเสริมสร้างความดีงาม" },
      { key: "s1_3", label: "3. ความเสียสละต่อสังคม" },
      { key: "s1_4", label: "4. มีจิตสาธารณะ" },
      { key: "s1_5", label: "5. ความรับผิดชอบทางสังคม" },
    ],
  },
  {
    key: "participation",
    label: "2. ด้านกิจกรรมที่ปฏิบัติ/เข้าร่วม",
    items: [
      { key: "s2_1", label: "1. กิจกรรมวันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี" },
      { key: "s2_2", label: "2. กิจกรรมวันสุนทรภู่และวันภาษาไทย" },
      { key: "s2_3", label: "3. กิจกรรมวันอาสาฬหบูชาและวันเข้าพรรษา" },
      { key: "s2_4", label: "4. วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระวชิรเกล้าเจ้าอยู่หัว รัชกาลที่ 10" },
      { key: "s2_5", label: "5. กิจกรรมวันแม่แห่งชาติ" },
      { key: "s2_6", label: "6. กิจกรรมวันวิทยาศาสตร์" },
      { key: "s2_7", label: "7. กิจกรรมวันลอยกระทง" },
      { key: "s2_8", label: "8. กิจกรรมวันคริสต์มาสและวันขึ้นปีใหม่" },
      { key: "s2_9", label: "9. กิจกรรมวันวาเลนไทน์" },
      { key: "s2_10", label: "10. กิจกรรมวันมาฆบูชา" },
    ],
  },
];

const FIXED_ITEM_KEYS = {
  club: new Set(CLUB_GROUPS.flatMap((group) => group.items.map((item) => item.key))),
  social: new Set(SOCIAL_GROUPS.flatMap((group) => group.items.map((item) => item.key))),
};

/** รายการแนะแนวและลูกเสือขึ้นกับระดับชั้น จึงตรวจรูปแบบคีย์แทนรายการคงที่ */
const ITEM_KEY_ALLOWED: Record<ActivityKind, (key: string) => boolean> = {
  guidance: (key) => /^g[1-9]\d{0,2}$/.test(key),
  scout: (key) => /^u[1-9]\d{0,2}$/.test(key),
  club: (key) => FIXED_ITEM_KEYS.club.has(key),
  social: (key) => FIXED_ITEM_KEYS.social.has(key),
};

/** ระดับชั้นของห้อง เช่น ม.1/4 → ม.1 (ใช้เลือกรายการประเมินตามหลักสูตร) */
export function activityClassLevel(info: Pick<ActivityGeneralInfo, "classLevelCode" | "gradeLevel">): string {
  return classLevelFromCode(info.classLevelCode) || classLevelFromCode(info.gradeLevel);
}

export function activityAssessmentDefinition(kind: ActivityKind, classLevel: string): ActivityAssessmentDefinition {
  if (kind === "guidance") {
    const curriculum = GUIDANCE_OBJECTIVES[classLevel];
    return {
      kind,
      title: "บันทึกผลการประเมินกิจกรรมแนะแนว",
      shortTitle: ACTIVITY_LABELS.guidance,
      groups: curriculum
        ? [
            {
              key: "objectives",
              label: curriculum.title,
              items: curriculum.items.map((item, index) => ({ key: `g${index + 1}`, label: `${index + 1}. ${item.text}` })),
            },
          ]
        : [],
    };
  }
  if (kind === "scout") {
    const curriculum = SCOUT_UNITS[classLevel];
    return {
      kind,
      title: "บันทึกผลการประเมิน กิจกรรมลูกเสือ",
      shortTitle: ACTIVITY_LABELS.scout,
      groups: curriculum
        ? [
            {
              key: "units",
              label: `หน่วยการเรียนรู้ ${curriculum.title}`,
              items: curriculum.items.map((item, index) => ({ key: `u${index + 1}`, label: `${index + 1}. ${item.text}` })),
            },
          ]
        : [],
    };
  }
  if (kind === "club") {
    return { kind, title: "บันทึกผลการประเมิน กิจกรรมชุมนุม", shortTitle: ACTIVITY_LABELS.club, groups: CLUB_GROUPS };
  }
  return {
    kind,
    title: "บันทึกผลการประเมิน กิจกรรมเพื่อสังคมและสาธารณประโยชน์",
    shortTitle: ACTIVITY_LABELS.social,
    groups: SOCIAL_GROUPS,
  };
}

export type ActivityDefinitions = Record<ActivityKind, ActivityAssessmentDefinition>;

export function activityAssessmentDefinitions(
  info: Pick<ActivityGeneralInfo, "classLevelCode" | "gradeLevel">,
): ActivityDefinitions {
  const classLevel = activityClassLevel(info);
  return {
    guidance: activityAssessmentDefinition("guidance", classLevel),
    scout: activityAssessmentDefinition("scout", classLevel),
    club: activityAssessmentDefinition("club", classLevel),
    social: activityAssessmentDefinition("social", classLevel),
  };
}

export function definitionItemKeys(definition: ActivityAssessmentDefinition): string[] {
  return definition.groups.flatMap((group) => group.items.map((item) => item.key));
}

export function emptyActivityAssessments(): ActivityAssessments {
  return { clubName: "", guidance: {}, scout: {}, club: {}, social: {}, results: {} };
}

function isActivityResult(value: unknown): value is ActivityResult {
  return value === "ผ่าน" || value === "ไม่ผ่าน";
}

/** รับข้อมูล JSON จากฐานข้อมูลแล้วคืนเฉพาะค่าที่ถูกต้อง เพื่อไม่ให้ค่าผิดรูปแบบทำให้หน้าจอพัง */
export function normalizeActivityAssessments(value: unknown): ActivityAssessments {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const marks = (rows: unknown, kind: ActivityKind) => {
    const result: ActivityMarkRows = {};
    if (!rows || typeof rows !== "object") return result;
    for (const [studentId, row] of Object.entries(rows as Record<string, unknown>)) {
      if (!row || typeof row !== "object") continue;
      const clean: Record<string, ActivityMark> = {};
      for (const [key, mark] of Object.entries(row as Record<string, unknown>)) {
        if (ITEM_KEY_ALLOWED[kind](key) && (mark === "ผ" || mark === "มผ")) clean[key] = mark;
      }
      if (Object.keys(clean).length) result[studentId] = clean;
    }
    return result;
  };
  // ข้อมูลรุ่นแรกเก็บผลแนะแนว/ลูกเสือที่ครูลงเองไว้ใน results จึงใช้เป็นผลที่กำหนดเองต่อได้ทันที
  const results: ActivityAssessments["results"] = {};
  if (source.results && typeof source.results === "object") {
    for (const [studentId, row] of Object.entries(source.results as Record<string, unknown>)) {
      if (!row || typeof row !== "object") continue;
      const clean: Partial<Record<ActivityKind, ActivityResult>> = {};
      for (const kind of ACTIVITY_KINDS) {
        const result = (row as Record<string, unknown>)[kind];
        if (isActivityResult(result)) clean[kind] = result;
      }
      if (Object.keys(clean).length) results[studentId] = clean;
    }
  }
  return {
    clubName: typeof source.clubName === "string" ? source.clubName : "",
    guidance: marks(source.guidance, "guidance"),
    scout: marks(source.scout, "scout"),
    club: marks(source.club, "club"),
    social: marks(source.social, "social"),
    results,
  };
}

export interface AssessmentYearResult {
  marked: number;
  total: number;
  passedItems: number;
  percent: number | null;
  result: ActivityResult | null;
}

/** ผลการประเมินสิ้นปีจากรายการประเมิน — ต้องประเมินครบทุกรายการก่อนจึงสรุปผล */
export function assessmentYearResult(
  row: Record<string, ActivityMark> | undefined,
  keys: string[],
): AssessmentYearResult {
  const marked = keys.filter((key) => row?.[key] === "ผ" || row?.[key] === "มผ").length;
  const passedItems = keys.filter((key) => row?.[key] === "ผ").length;
  if (keys.length === 0 || marked < keys.length) {
    return { marked, total: keys.length, passedItems, percent: null, result: null };
  }
  const percent = (passedItems / keys.length) * 100;
  return {
    marked,
    total: keys.length,
    passedItems,
    percent,
    result: percent >= ACTIVITY_PASS_PERCENT ? "ผ่าน" : "ไม่ผ่าน",
  };
}

function hoursFromText(text: unknown): number {
  if (typeof text !== "string" || !text.trim()) return 0;
  if (text.includes("-")) {
    const [start, end] = text.split("-").map(Number);
    return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start + 1 : 0;
  }
  return 1;
}

export interface ActivityAttendanceSummary {
  scheduled: boolean;
  attendedHours: number;
  percent: number;
}

/** เวลาเข้าร่วมกิจกรรมของนักเรียนเทียบกับเวลาเรียนทั้งปี */
export function activityAttendanceSummary(
  attendance: AppData["attendance"] | undefined,
  studentId: string,
  totalHours = ACTIVITY_TOTAL_HOURS,
): ActivityAttendanceSummary {
  const hoursMap = (attendance?.hoursMap ?? {}) as Record<string, string>;
  const records = (attendance?.records?.[studentId] ?? {}) as Record<string, string>;
  const scheduled = Object.values(hoursMap).some((value) => hoursFromText(value) > 0);
  let attendedHours = 0;
  for (const [dateKey, mark] of Object.entries(records)) {
    if (typeof mark === "string" && mark.trim()) attendedHours += hoursFromText(hoursMap[dateKey]);
  }
  return {
    scheduled,
    attendedHours,
    percent: totalHours > 0 ? (attendedHours / totalHours) * 100 : 0,
  };
}

export interface ActivityResultCell {
  /** ผลที่ใช้สรุป: ผลที่ครูกำหนดเอง หรือผลที่คำนวณจากรายการประเมิน */
  result: ActivityResult | null;
  /** ผลที่คำนวณจากรายการประเมินของกิจกรรม */
  derived: ActivityResult | null;
  /** ผลที่ครูกำหนดเองในแท็บสรุปผล */
  override: ActivityResult | null;
  marked: number;
  total: number;
}

export interface ActivitySummaryRow {
  activities: Record<ActivityKind, ActivityResultCell>;
  /** เวลาเข้าร่วมกิจกรรมต่ำกว่าเกณฑ์ร้อยละ 80 (คิดเมื่อมีการจัดตารางเวลาเรียนแล้ว) */
  attendanceShort: boolean;
  attendancePercent: number | null;
  overall: ActivityResult | null;
}

export function activityResultCell(
  assessments: ActivityAssessments,
  definition: ActivityAssessmentDefinition,
  studentId: string,
): ActivityResultCell {
  const yearResult = assessmentYearResult(assessments[definition.kind][studentId], definitionItemKeys(definition));
  const override = assessments.results[studentId]?.[definition.kind] ?? null;
  return {
    result: override ?? yearResult.result,
    derived: yearResult.result,
    override,
    marked: yearResult.marked,
    total: yearResult.total,
  };
}

export function activitySummaryRow(
  data: StudentActivityData,
  studentId: string,
  definitions: ActivityDefinitions = activityAssessmentDefinitions(data.generalInfo),
): ActivitySummaryRow {
  const activities = Object.fromEntries(
    ACTIVITY_KINDS.map((kind) => [kind, activityResultCell(data.assessments, definitions[kind], studentId)]),
  ) as Record<ActivityKind, ActivityResultCell>;
  const attendance = activityAttendanceSummary(data.attendance, studentId);
  const attendanceShort = attendance.scheduled && attendance.percent < ACTIVITY_MIN_ATTENDANCE_PERCENT;
  const results = ACTIVITY_KINDS.map((kind) => activities[kind].result);

  let overall: ActivityResult | null = null;
  if (results.includes("ไม่ผ่าน")) overall = "ไม่ผ่าน";
  else if (results.every((result) => result === "ผ่าน")) overall = attendanceShort ? "ไม่ผ่าน" : "ผ่าน";

  return {
    activities,
    attendanceShort,
    attendancePercent: attendance.scheduled ? attendance.percent : null,
    overall,
  };
}

export interface ActivityCoverSummary {
  totalStudents: number;
  passed: number;
  failed: number;
  pending: number;
  passedPercent: number;
}

export function activityCoverSummary(data: StudentActivityData): ActivityCoverSummary {
  const definitions = activityAssessmentDefinitions(data.generalInfo);
  let passed = 0;
  let failed = 0;
  for (const student of data.students) {
    const overall = activitySummaryRow(data, student.id, definitions).overall;
    if (overall === "ผ่าน") passed += 1;
    else if (overall === "ไม่ผ่าน") failed += 1;
  }
  const totalStudents = data.students.length;
  return {
    totalStudents,
    passed,
    failed,
    pending: totalStudents - passed - failed,
    passedPercent: totalStudents > 0 ? Math.round((passed / totalStudents) * 100) : 0,
  };
}

export function computeActivityStats(data: StudentActivityData): StudentActivityStats {
  const students = data.students;
  const summary = activityCoverSummary(data);
  const definitions = activityAssessmentDefinitions(data.generalInfo);
  const hoursMap = (data.attendance?.hoursMap ?? {}) as Record<string, string>;
  const records = (data.attendance?.records ?? {}) as Record<string, Record<string, string>>;
  const scheduled = Object.values(hoursMap).some((value) => hoursFromText(value) > 0);
  const hasAttendanceInput =
    scheduled || students.some((student) => Object.values(records[student.id] ?? {}).some((mark) => String(mark ?? "").trim()));
  const hasAssessmentInput =
    Boolean(data.assessments.clubName.trim()) ||
    ACTIVITY_KINDS.some((kind) => Object.keys(data.assessments[kind]).length > 0) ||
    Object.keys(data.assessments.results).length > 0;

  if (students.length === 0) {
    return {
      completionPercent: 0,
      hasTeacherInput: hasAttendanceInput || hasAssessmentInput,
      studentCount: 0,
      passedCount: 0,
      failedCount: 0,
    };
  }

  const attendanceDone = scheduled
    ? students.filter((student) => Object.values(records[student.id] ?? {}).some((mark) => String(mark ?? "").trim())).length
    : 0;
  // A student counts as done for an activity once it has a final result (from the items or set by the teacher);
  // before that the share of assessed items shows the progress.
  const activityParts = ACTIVITY_KINDS.map((kind) => {
    const done = students.reduce((sum, student) => {
      const cell = activityResultCell(data.assessments, definitions[kind], student.id);
      if (cell.result) return sum + 1;
      return sum + (cell.total > 0 ? cell.marked / cell.total : 0);
    }, 0);
    return Math.min(1, done / students.length);
  });

  const parts = [Math.min(1, attendanceDone / students.length), ...activityParts];
  const completionPercent = Math.floor((parts.reduce((sum, value) => sum + value, 0) / parts.length) * 100 + 1e-9);

  return {
    completionPercent,
    hasTeacherInput: hasAttendanceInput || hasAssessmentInput,
    studentCount: students.length,
    passedCount: summary.passed,
    failedCount: summary.failed,
  };
}

export function activityStatusFromStats(stats: StudentActivityStats): "not_started" | "in_progress" | "completed" {
  if (stats.completionPercent >= 100) return "completed";
  return stats.hasTeacherInput || stats.completionPercent > 0 ? "in_progress" : "not_started";
}

/** ป้องกันการส่งซ้ำระหว่างรออนุมัติหรือหลังอนุมัติ โดยยังแก้ไขข้อมูลได้ */
export function activityApprovalPreventsSubmission(status: ActivityApprovalStatus | null | undefined): boolean {
  return status === "pending" || status === "approved";
}

/** ป.1/1 → ประถมศึกษาปีที่ 1/1, ม.1/4 → มัธยมศึกษาปีที่ 1/4 */
export function longClassroomName(name: string): string {
  const trimmed = name.trim();
  const match = trimmed.match(/^(ป|ม)\.?\s*(\d+)(?:\s*\/\s*(\d+))?$/);
  if (!match) return trimmed;
  const stage = match[1] === "ป" ? "ประถมศึกษาปีที่" : "มัธยมศึกษาปีที่";
  return `${stage} ${match[2]}${match[3] ? `/${match[3]}` : ""}`;
}

function yearBeToCe(yearBe: string | number): number {
  const year = Number(yearBe);
  if (!Number.isFinite(year) || year <= 0) return new Date().getFullYear();
  return year > 2400 ? year - 543 : year;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** แปลงวันที่ที่อาจบันทึกเป็น พ.ศ. ให้เป็น ค.ศ. เพื่อใช้คำนวณตาราง */
export function normalizeActivityDate(value: unknown): string | null {
  if (!isIsoDate(value)) return null;
  const [year, month, day] = value.split("-");
  const numericYear = Number(year);
  return `${numericYear >= 2400 ? numericYear - 543 : numericYear}-${month}-${day}`;
}

export interface ActivityStudyPeriodInput {
  yearBe: string | number;
  studyStartDate?: string | null;
  studyEndDate?: string | null;
  semester1EndDate?: string | null;
  semester2StartDate?: string | null;
}

/**
 * ช่วงเวลาเรียนทั้งปีการศึกษา: กลางเดือนพฤษภาคม ถึงสิ้นเดือนมีนาคมของปีถัดไป
 * โดยเว้นช่วงปิดภาคเรียนระหว่างภาคเรียนที่ 1 และ 2 (ภาคเรียนที่ 1 สิ้นสุดไม่เกิน 30 กันยายน เหมือน ปพ.5)
 */
export function activityStudyPeriod(input: ActivityStudyPeriodInput) {
  const yearCe = yearBeToCe(input.yearBe);
  const defaults = {
    start: `${yearCe}-05-16`,
    semester1End: `${yearCe}-09-30`,
    semester2Start: `${yearCe}-11-01`,
    end: `${yearCe + 1}-03-31`,
  };
  const start = normalizeActivityDate(input.studyStartDate) ?? defaults.start;
  const end = normalizeActivityDate(input.studyEndDate) ?? defaults.end;
  const requestedSemester1End = normalizeActivityDate(input.semester1EndDate) ?? defaults.semester1End;
  const semester1End = requestedSemester1End > defaults.semester1End ? defaults.semester1End : requestedSemester1End;
  const semester2Start = normalizeActivityDate(input.semester2StartDate) ?? defaults.semester2Start;
  return { start, end, semester1End, semester2Start };
}

export function activityStudySegments(info: Pick<ActivityGeneralInfo, "studyStartDate" | "studyEndDate" | "semester1EndDate" | "semester2StartDate">) {
  const start = normalizeActivityDate(info.studyStartDate);
  const end = normalizeActivityDate(info.studyEndDate);
  if (!start || !end || start > end) return [];
  const semester1End = normalizeActivityDate(info.semester1EndDate);
  const semester2Start = normalizeActivityDate(info.semester2StartDate);
  if (!semester1End || !semester2Start || semester1End < start || semester2Start > end || semester1End >= semester2Start) {
    return [{ startDate: start, endDate: end }];
  }
  return [
    { startDate: start, endDate: semester1End },
    { startDate: semester2Start, endDate: end },
  ];
}

const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

/** 2027-03-31 → 31 มีนาคม 2570 */
export function thaiFullDate(value: string | null | undefined): string {
  const iso = normalizeActivityDate(value);
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${THAI_MONTHS[month - 1] ?? ""} ${year + 543}`;
}

function shiftIsoDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** ตั้งค่าหน้าบันทึกเวลาเรียน (ใช้ฟอร์มเดียวกับ ปพ.5) ให้ครอบคลุมทั้งปีการศึกษา */
export function activityAttendancePeriod(info: ActivityGeneralInfo): AttendancePeriodConfig {
  const segments = activityStudySegments(info);
  const startDate = segments[0]?.startDate ?? normalizeActivityDate(info.studyStartDate) ?? info.studyStartDate;
  const endDate = segments.at(-1)?.endDate ?? normalizeActivityDate(info.studyEndDate) ?? info.studyEndDate;
  const breakStart = segments.length === 2 ? shiftIsoDate(segments[0].endDate, 1) : null;
  const breakEnd = segments.length === 2 ? shiftIsoDate(segments[1].startDate, -1) : null;

  return {
    heading: `บันทึกเวลาเรียน กิจกรรมพัฒนาผู้เรียน ชั้น ${info.gradeLevel} ปีการศึกษา ${info.academicYear}`,
    subheading: `รวมเวลาเรียน ${info.hoursPerWeek} ชั่วโมง/สัปดาห์ ${info.hoursPerYear} ชั่วโมง/ปี`,
    note:
      breakStart && breakEnd && breakStart <= breakEnd
        ? `ภาคเรียนที่ 1 และ 2 รวมกัน (ไม่นับช่วงปิดภาคเรียน ${thaiFullDate(breakStart)} – ${thaiFullDate(breakEnd)})`
        : undefined,
    hoursPerWeek: Number(info.hoursPerWeek) || ACTIVITY_HOURS_PER_WEEK,
    totalHours: Number(info.hoursPerYear) || ACTIVITY_TOTAL_HOURS,
    startDate,
    endDate,
    segments: segments.length ? segments : [{ startDate, endDate }],
  };
}

export function defaultActivityApprovalDate(yearBe: string | number): string {
  return `${yearBeToCe(yearBe) + 1}-03-31`;
}

export interface ActivityContextInput {
  schoolName?: string | null;
  classroomName: string;
  classLevelCode?: string | null;
  yearBe: number | string;
  homeroomTeachers: string[];
  officials?: Partial<Pick<ActivityGeneralInfo, "headOfActivities" | "headOfEvaluation" | "deputyDirector" | "schoolDirector">>;
  studyStartDate?: string | null;
  studyEndDate?: string | null;
  semester1EndDate?: string | null;
  semester2StartDate?: string | null;
}

export function buildActivityGeneralInfo(
  context: ActivityContextInput,
  saved?: Partial<ActivityGeneralInfo> | null,
): ActivityGeneralInfo {
  const schoolName = context.schoolName?.trim() || DEFAULT_SCHOOL_NAME;
  const useKalasinDefaults = schoolName.includes(KALASIN_PANYANUKUL_SCHOOL_NAME_PART);
  const fallbackOfficials = useKalasinDefaults
    ? KALASIN_DEFAULT_OFFICIALS
    : { headOfActivities: "", headOfEvaluation: "", deputyDirector: "", schoolDirector: "" };
  const official = (key: keyof typeof KALASIN_DEFAULT_OFFICIALS) =>
    context.officials?.[key]?.trim() || saved?.[key]?.trim() || fallbackOfficials[key];
  const period = activityStudyPeriod(context);
  const [homeroomTeacher1 = "", homeroomTeacher2 = "", homeroomTeacher3 = ""] = context.homeroomTeachers
    .map((name) => name.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return {
    schoolName,
    agencyName: saved?.agencyName?.trim() || DEFAULT_AGENCY_NAME,
    logoUrl: DEFAULT_LOGO_URL,
    gradeLevel: context.classroomName,
    classLevelCode: context.classLevelCode ?? "",
    academicYear: String(context.yearBe),
    hoursPerWeek: String(ACTIVITY_HOURS_PER_WEEK),
    hoursPerYear: String(ACTIVITY_TOTAL_HOURS),
    homeroomTeacher1,
    homeroomTeacher2,
    homeroomTeacher3,
    headOfActivities: official("headOfActivities"),
    headOfEvaluation: official("headOfEvaluation"),
    deputyDirector: official("deputyDirector"),
    schoolDirector: official("schoolDirector"),
    approvalDate: isIsoDate(saved?.approvalDate) ? saved!.approvalDate! : defaultActivityApprovalDate(context.yearBe),
    studyStartDate: period.start,
    studyEndDate: period.end,
    semester1EndDate: period.semester1End,
    semester2StartDate: period.semester2Start,
  };
}

export function activityHomeroomTeachers(info: ActivityGeneralInfo): string[] {
  return [info.homeroomTeacher1, info.homeroomTeacher2, info.homeroomTeacher3].filter((name) => name.trim());
}

/** ข้อมูลหน้าปกในรูปแบบ generalInfo ของ ปพ.5 เพื่อใช้หน้าบันทึกเวลาเรียนชุดเดียวกัน */
export function activityGeneralInfoForAttendance(info: ActivityGeneralInfo): AppData["generalInfo"] {
  return {
    schoolName: info.schoolName,
    agencyName: info.agencyName,
    logoUrl: info.logoUrl,
    gradeLevel: info.gradeLevel,
    semester: "",
    academicYear: info.academicYear,
    subjectCode: "",
    subjectName: ACTIVITY_HEAD_LEARNING_AREA,
    learningArea: ACTIVITY_HEAD_LEARNING_AREA,
    totalHours: info.hoursPerWeek,
    hoursPerWeek: info.hoursPerWeek,
    hoursPerSemester: info.hoursPerYear,
    teacherName: info.homeroomTeacher1,
    teacherName2: info.homeroomTeacher2,
    teacherName3: info.homeroomTeacher3,
    homeroomTeacher1: info.homeroomTeacher1,
    homeroomTeacher2: info.homeroomTeacher2,
    homeroomTeacher3: info.homeroomTeacher3,
    homeroomTeachers: activityHomeroomTeachers(info).map((name, index) => `${index + 1}. ${name}`).join(" "),
    headOfLearningArea: info.headOfActivities,
    headOfEvaluation: info.headOfEvaluation,
    deputyDirector: info.deputyDirector,
    schoolDirector: info.schoolDirector,
    approvalDate: info.approvalDate,
    studyStartDate: info.studyStartDate,
    studyEndDate: info.studyEndDate,
  };
}

export function setAssessmentMark(
  assessments: ActivityAssessments,
  kind: ActivityKind,
  studentId: string,
  itemKey: string,
  mark: ActivityMark | null,
): ActivityAssessments {
  const row = { ...(assessments[kind][studentId] ?? {}) };
  if (mark) row[itemKey] = mark;
  else delete row[itemKey];
  const rows = { ...assessments[kind] };
  if (Object.keys(row).length) rows[studentId] = row;
  else delete rows[studentId];
  return { ...assessments, [kind]: rows };
}

/** ลงผลทุกรายการของกิจกรรมให้นักเรียนที่เลือก (ระบบช่วยบันทึกผลอัตโนมัติ) */
export function fillAssessmentMarks(
  assessments: ActivityAssessments,
  kind: ActivityKind,
  itemKeys: string[],
  studentIds: string[],
  mark: ActivityMark,
): ActivityAssessments {
  const rows = { ...assessments[kind] };
  for (const studentId of studentIds) {
    rows[studentId] = Object.fromEntries(itemKeys.map((key) => [key, mark]));
  }
  return { ...assessments, [kind]: rows };
}

function withoutResultOverrides(
  results: ActivityAssessments["results"],
  shouldRemove: (studentId: string, kind: ActivityKind) => boolean,
): ActivityAssessments["results"] {
  const next: ActivityAssessments["results"] = {};
  for (const [studentId, row] of Object.entries(results)) {
    const kept = Object.fromEntries(
      Object.entries(row).filter(([kind]) => !shouldRemove(studentId, kind as ActivityKind)),
    ) as Partial<Record<ActivityKind, ActivityResult>>;
    if (Object.keys(kept).length) next[studentId] = kept;
  }
  return next;
}

/** ล้างผลของกิจกรรมทั้งรายการประเมินและผลที่กำหนดเองในแท็บสรุปผล */
export function clearAssessmentKind(assessments: ActivityAssessments, kind: ActivityKind): ActivityAssessments {
  return {
    ...assessments,
    [kind]: {},
    results: withoutResultOverrides(assessments.results, (_studentId, resultKind) => resultKind === kind),
  };
}

export function setResultOverride(
  assessments: ActivityAssessments,
  studentId: string,
  kind: ActivityKind,
  result: ActivityResult | null,
): ActivityAssessments {
  const row = { ...(assessments.results[studentId] ?? {}) };
  if (result) row[kind] = result;
  else delete row[kind];
  const results = { ...assessments.results };
  if (Object.keys(row).length) results[studentId] = row;
  else delete results[studentId];
  return { ...assessments, results };
}

/**
 * คลิกช่อง ผ่าน/ไม่ผ่าน ในแท็บสรุปผล: เลือกผลที่ต่างจากเดิมเพื่อกำหนดผลเอง
 * คลิกช่องที่กำหนดเองซ้ำเพื่อกลับไปใช้ผลจากรายการประเมิน
 */
export function toggleSummaryResult(
  assessments: ActivityAssessments,
  cell: ActivityResultCell,
  studentId: string,
  kind: ActivityKind,
  clicked: ActivityResult,
): ActivityAssessments {
  if (cell.result === clicked) {
    return cell.override ? setResultOverride(assessments, studentId, kind, null) : assessments;
  }
  return setResultOverride(assessments, studentId, kind, clicked === cell.derived ? null : clicked);
}

export function fillResultOverrides(
  assessments: ActivityAssessments,
  kinds: ActivityKind[],
  studentIds: string[],
  result: ActivityResult,
): ActivityAssessments {
  const results = { ...assessments.results };
  for (const studentId of studentIds) {
    const row = { ...(results[studentId] ?? {}) };
    for (const kind of kinds) row[kind] = result;
    results[studentId] = row;
  }
  return { ...assessments, results };
}

export function clearResultOverrides(assessments: ActivityAssessments): ActivityAssessments {
  return { ...assessments, results: {} };
}

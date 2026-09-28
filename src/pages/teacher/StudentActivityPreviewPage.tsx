import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, ShieldCheck, Undo2 } from "lucide-react";
import { StudentActivityEditor } from "./StudentActivityEditor";
import {
  activityAssessmentDefinitions,
  buildActivityGeneralInfo,
  computeActivityStats,
  definitionItemKeys,
  EMPTY_ACTIVITY_APPROVAL,
  emptyActivityAssessments,
  fillAssessmentMarks,
  normalizeActivityAssessments,
  setAssessmentMark,
  setResultOverride,
  type ActivityApprovalState,
  type StudentActivityData,
} from "../../lib/studentActivities";
import type { StudentActivityBackend, StudentActivitySession } from "../../lib/studentActivityRecords";
import type { Student } from "../../types";

const STORAGE_KEY = "ksp-preview-student-activities-v2";
const APPROVAL_STORAGE_KEY = "ksp-preview-student-activities-approval-v2";

// Synthetic sample roster for local review only — not real students.
const SAMPLE_STUDENTS: Student[] = [
  "เด็กชาย ทดสอบ หนึ่ง",
  "เด็กชาย ทดสอบ สอง",
  "เด็กชาย ทดสอบ สาม",
  "เด็กชาย ทดสอบ สี่",
  "เด็กชาย ทดสอบ ห้า",
  "เด็กชาย ทดสอบ หก",
  "เด็กหญิง ทดสอบ เจ็ด",
  "เด็กหญิง ทดสอบ แปด",
  "เด็กหญิง ทดสอบ เก้า",
  "เด็กหญิง ทดสอบ สิบ",
  "เด็กหญิง ทดสอบ สิบเอ็ด",
  "เด็กหญิง ทดสอบ สิบสอง",
].map((name, index) => ({
  id: `preview-student-${index + 1}`,
  studentId: String(9001 + index),
  citizenId: `00000000000${String(index + 1).padStart(2, "0")}`,
  name,
  studentNumber: index + 1,
  targetPercentage: 100,
}));

function buildSampleData(): StudentActivityData {
  const generalInfo = buildActivityGeneralInfo({
    schoolName: "โรงเรียนกาฬสินธุ์ปัญญานุกูล จังหวัดกาฬสินธุ์",
    classroomName: "ม.1/4",
    classLevelCode: "ม.1",
    yearBe: 2569,
    homeroomTeachers: ["นาย ครูทดสอบ ประจำชั้น", "นาง ครูทดสอบ ผู้ช่วย"],
    studyStartDate: "2026-05-16",
    studyEndDate: "2027-03-31",
    semester1EndDate: "2026-10-11",
    semester2StartDate: "2026-11-01",
  });
  const definitions = activityAssessmentDefinitions(generalInfo);
  const keys = {
    guidance: definitionItemKeys(definitions.guidance),
    scout: definitionItemKeys(definitions.scout),
    club: definitionItemKeys(definitions.club),
    social: definitionItemKeys(definitions.social),
  };

  const ids = SAMPLE_STUDENTS.map((student) => student.id);
  let assessments = { ...emptyActivityAssessments(), clubName: "ชุมนุมศิลปะสร้างสรรค์" };
  assessments = fillAssessmentMarks(assessments, "guidance", keys.guidance, ids.slice(0, 7), "ผ");
  assessments = setAssessmentMark(assessments, "guidance", ids[2], keys.guidance[4], "มผ");
  assessments = setAssessmentMark(assessments, "guidance", ids[2], keys.guidance[11], "มผ");
  for (const key of keys.guidance.slice(0, 15)) assessments = setAssessmentMark(assessments, "guidance", ids[7], key, "ผ");

  assessments = fillAssessmentMarks(assessments, "scout", keys.scout, ids.slice(0, 7), "ผ");
  for (const key of keys.scout.slice(0, 6)) assessments = setAssessmentMark(assessments, "scout", ids[5], key, "มผ");

  assessments = fillAssessmentMarks(assessments, "club", keys.club, ids.slice(0, 8), "ผ");
  assessments = setAssessmentMark(assessments, "club", ids[3], "c2_4", "มผ");
  assessments = setAssessmentMark(assessments, "club", ids[3], "c3_4", "มผ");

  assessments = fillAssessmentMarks(assessments, "social", keys.social, ids.slice(0, 6), "ผ");
  // ตัวอย่างผลที่ครูกำหนดเองในแท็บสรุปผล
  assessments = setResultOverride(assessments, ids[6], "social", "ผ่าน");

  return {
    generalInfo,
    students: SAMPLE_STUDENTS,
    attendance: {},
    assessments,
  };
}

function readStorage<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preview data still stays in memory for this tab.
  }
}

function loadStoredData(): StudentActivityData | null {
  const stored = readStorage<StudentActivityData>(STORAGE_KEY);
  if (!stored || !Array.isArray(stored.students) || !stored.generalInfo) return null;
  return { ...stored, assessments: normalizeActivityAssessments(stored.assessments) };
}

type PreviewBackend = StudentActivityBackend & {
  approval(): ActivityApprovalState;
  setApproval(next: ActivityApprovalState): void;
};

function createPreviewBackend(initialData: StudentActivityData, initialApproval: ActivityApprovalState): PreviewBackend {
  let roster: Student[] = initialData.students;
  let lastData = initialData;
  let approval = initialApproval;
  const listeners = new Set<(next: ActivityApprovalState) => void>();
  const setApproval = (next: ActivityApprovalState) => {
    approval = next;
    writeStorage(APPROVAL_STORAGE_KEY, next.status ? next : null);
    listeners.forEach((listener) => listener(next));
  };

  return {
    async save(data) {
      roster = data.students;
      lastData = data;
      await new Promise((resolve) => setTimeout(resolve, 250));
      writeStorage(STORAGE_KEY, data);
    },
    loadRoster: async () => roster,
    subscribeRoster: () => () => undefined,
    async addStudent(student) {
      const saved = { ...student, id: `preview-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
      roster = [...roster, saved];
      return saved;
    },
    async updateStudent(student) {
      roster = roster.map((current) => (current.id === student.id ? { ...current, ...student } : current));
    },
    async removeStudent(student) {
      roster = roster.filter((current) => current.id !== student.id);
    },
    async submit() {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (computeActivityStats(lastData).completionPercent < 100) {
        throw new Error("กรุณาบันทึกข้อมูลกิจกรรมพัฒนาผู้เรียนให้ครบ 100% ก่อนส่ง");
      }
      setApproval({ status: "pending", reason: null, submittedAt: new Date().toISOString(), reviewedAt: null });
      return approval;
    },
    async review(status, reason) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (approval.status !== "pending" && approval.status !== "approved") {
        throw new Error("ครูประจำชั้นยังไม่ได้ส่งการประเมินกิจกรรมพัฒนาผู้เรียน");
      }
      setApproval({
        ...approval,
        status,
        reason: status === "revision_requested" ? reason?.trim() || null : null,
        reviewedAt: new Date().toISOString(),
      });
      return approval;
    },
    subscribeApproval(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    approval: () => approval,
    setApproval,
  };
}

/** หน้าตัวอย่างสำหรับตรวจบนเครื่อง (npm run dev) — ไม่เชื่อมต่อฐานข้อมูลจริง */
export function StudentActivityPreviewPage() {
  const [version, setVersion] = useState(0);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [closed, setClosed] = useState(false);
  const session = useMemo<StudentActivitySession>(
    () => ({
      id: `preview-${version}`,
      schoolId: null,
      classroomId: "preview-classroom",
      academicYearId: "preview-year",
      yearBe: 2569,
      yearIsActive: true,
      readOnly: false,
      // ในหน้าตัวอย่างผู้ใช้เป็นทั้งครูประจำชั้นและผู้ดูแลระบบ เพื่อทดลองส่งและอนุมัติได้ในที่เดียว
      canReview: true,
      approval: readStorage<ActivityApprovalState>(APPROVAL_STORAGE_KEY) ?? EMPTY_ACTIVITY_APPROVAL,
      data: loadStoredData() ?? buildSampleData(),
    }),
    [version],
  );
  const backend = useMemo(() => createPreviewBackend(session.data, session.approval), [session]);
  const [approval, setApproval] = useState(session.approval);
  useEffect(() => {
    setApproval(backend.approval());
    return backend.subscribeApproval(setApproval);
  }, [backend]);

  const resetSample = () => {
    writeStorage(STORAGE_KEY, null);
    writeStorage(APPROVAL_STORAGE_KEY, null);
    setClosed(false);
    setVersion((current) => current + 1);
  };

  if (closed) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f5f7] p-6">
        <div className="ui-card max-w-md p-8 text-center">
          <h1 className="text-xl font-extrabold text-slate-900">ออกจากหน้าบันทึกกิจกรรมพัฒนาผู้เรียน</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            ในระบบจริง ปุ่มย้อนกลับจะบันทึกข้อมูลแล้วพากลับไปหน้ารายการปีการศึกษาและภาคเรียนของครู
          </p>
          <button type="button" className="btn btn-primary mt-5" onClick={() => setClosed(false)}>
            เปิดบันทึกอีกครั้ง
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <StudentActivityEditor
        key={session.id}
        session={session}
        backend={backend}
        onBack={() => setClosed(true)}
        onSyncStatusChange={setSyncStatus}
      />
      <div className="fixed bottom-4 left-4 z-[90] flex flex-wrap items-center gap-2 rounded-full border border-amber-200 bg-amber-50/95 py-1.5 pl-3 pr-1.5 text-xs font-semibold text-amber-900 shadow-lg backdrop-blur">
        <span>โหมดตัวอย่าง: ข้อมูลทดสอบ บันทึกไว้ในเบราว์เซอร์นี้เท่านั้น</span>
        {syncStatus === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="กำลังบันทึก" />}
        {syncStatus === "saved" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="บันทึกแล้ว" />}
        {approval.status !== "approved" ? (
          <button
            type="button"
            onClick={() =>
              backend.setApproval({
                status: "approved",
                reason: null,
                submittedAt: approval.submittedAt ?? new Date().toISOString(),
                reviewedAt: new Date().toISOString(),
              })
            }
            className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-emerald-800 ring-1 ring-emerald-200 transition hover:bg-emerald-50"
            title="ข้ามขั้นตอนส่งและอนุมัติ เพื่อทดลองพิมพ์และบันทึก PDF"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            จำลองว่าอนุมัติแล้ว
          </button>
        ) : null}
        {approval.status ? (
          <button
            type="button"
            onClick={() => backend.setApproval(EMPTY_ACTIVITY_APPROVAL)}
            className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-amber-900 ring-1 ring-amber-200 transition hover:bg-amber-100"
          >
            <Undo2 className="h-3.5 w-3.5" />
            ยกเลิกสถานะการส่ง
          </button>
        ) : null}
        <button
          type="button"
          onClick={resetSample}
          className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-amber-900 ring-1 ring-amber-200 transition hover:bg-amber-100"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          รีเซ็ตข้อมูลตัวอย่าง
        </button>
      </div>
    </>
  );
}

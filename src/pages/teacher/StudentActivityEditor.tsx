import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  Printer,
  Send,
  ShieldCheck,
  Undo2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { FolderTabs, type FolderTabItem } from "../../components/FolderTabs";
import { ModalPortal } from "../../components/ModalPortal";
import { StudentsForm } from "../../components/StudentsForm";
import { ActivityCoverPreview } from "../../components/activities/ActivityCoverPreview";
import { ActivityAssessmentForm } from "../../components/activities/ActivityAssessmentForm";
import { ActivitySummaryForm } from "../../components/activities/ActivitySummaryForm";
import { ActivityInstructionsTab } from "../../components/activities/ActivityInstructions";
import { createSaveQueue } from "../../lib/saveQueue";
import { getErrorMessage } from "../../lib/dbErrors";
import { mergeRosterWithSavedState } from "../../lib/studentRoster";
import {
  ACTIVITY_KINDS,
  ACTIVITY_LABELS,
  activityApprovalPreventsSubmission,
  activityAssessmentDefinitions,
  activityAttendancePeriod,
  activityCoverSummary,
  activityGeneralInfoForAttendance,
  activityHomeroomTeachers,
  activityResultCell,
  computeActivityStats,
  type ActivityApprovalState,
  type ActivityKind,
  type StudentActivityData,
} from "../../lib/studentActivities";
import {
  createSupabaseActivityBackend,
  type StudentActivityBackend,
  type StudentActivitySession,
} from "../../lib/studentActivityRecords";
import { downloadStudentActivityPdf } from "../../utils/studentActivityPdf";
import { openStudentActivityPrintDialog } from "../../utils/studentActivityPrintDialog";
import type { Student } from "../../types";

const ACTIVITY_TAB_IDS: Record<ActivityKind, string> = {
  guidance: "activity_guidance",
  scout: "activity_scout",
  club: "activity_club",
  social: "activity_social",
};

const menuItems: FolderTabItem[] = [
  { id: "general", label: "ปก", surface: "document" },
  { id: "students", label: "เวลาเรียน" },
  ...ACTIVITY_KINDS.map((kind) => ({ id: ACTIVITY_TAB_IDS[kind], label: ACTIVITY_LABELS[kind] })),
  { id: "activity_summary", label: "สรุปผลการประเมินกิจกรรมพัฒนาผู้เรียน" },
  { id: "instructions", label: "คำชี้แจง", surface: "document" },
];

const DOCUMENT_TABS = new Set(menuItems.filter((item) => item.surface === "document").map((item) => item.id));
const NOT_APPROVED_MESSAGE = "การประเมินกิจกรรมพัฒนาผู้เรียนยังไม่ได้รับการอนุมัติ";

type PdfDownloadStatus = {
  variant: "preparing" | "success" | "error";
  title: string;
  message: string;
};

type ApprovalDialog = "submit" | "incomplete" | "approve" | "return" | null;

interface StudentActivityEditorProps {
  session: StudentActivitySession;
  onBack: () => void;
  onSyncStatusChange?: (status: "idle" | "saving" | "saved" | "error") => void;
  /** ใช้แทนการบันทึกลง Supabase (เช่น หน้าตัวอย่างบนเครื่อง) */
  backend?: StudentActivityBackend;
}

export const StudentActivityEditor: React.FC<StudentActivityEditorProps> = ({
  session,
  onBack,
  onSyncStatusChange,
  backend: providedBackend,
}) => {
  // The session id fixes the classroom and academic year for this editor instance.
  const backend = useMemo(
    () => providedBackend ?? createSupabaseActivityBackend(session),
    [providedBackend, session.id],
  );
  const [data, setData] = useState<StudentActivityData>(session.data);
  const [approval, setApproval] = useState<ActivityApprovalState>(session.approval);
  const [activeTab, setActiveTab] = useState("general");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ApprovalDialog>(null);
  const [returnReason, setReturnReason] = useState("");
  const [workingAction, setWorkingAction] = useState<"submit" | "review" | "print" | "pdf" | null>(null);
  const [pdfDownloadStatus, setPdfDownloadStatus] = useState<PdfDownloadStatus | null>(null);
  const leaving = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestData = useRef(data);
  latestData.current = data;

  const alreadySubmitted = activityApprovalPreventsSubmission(approval.status);
  const readOnly = session.readOnly;
  const canSubmit = !session.readOnly && !alreadySubmitted;
  const canReview = session.canReview && approval.status === "pending";
  const definitions = useMemo(() => activityAssessmentDefinitions(data.generalInfo), [data.generalInfo]);
  const stats = useMemo(() => computeActivityStats(data), [data]);
  const completionPercent = Math.max(0, Math.min(100, stats.completionPercent));
  const attendancePeriod = useMemo(() => activityAttendancePeriod(data.generalInfo), [data.generalInfo]);
  const attendanceInfo = useMemo(() => activityGeneralInfoForAttendance(data.generalInfo), [data.generalInfo]);
  const homeroomTeachers = activityHomeroomTeachers(data.generalInfo);
  const isDocumentTab = DOCUMENT_TABS.has(activeTab);
  const activeKind = ACTIVITY_KINDS.find((kind) => ACTIVITY_TAB_IDS[kind] === activeTab) ?? null;

  const writeRef = useRef<(value: StudentActivityData) => Promise<void>>(() => Promise.resolve());
  writeRef.current = (value) => (readOnly ? Promise.resolve() : backend.save(value));
  const saveQueue = useMemo(() => createSaveQueue(session.data, (value) => writeRef.current(value)), [session.id]);

  const persist = useCallback(async () => {
    if (session.readOnly || !saveQueue.isDirty()) return;
    onSyncStatusChange?.("saving");
    setSaveError(null);
    try {
      await saveQueue.flush();
      onSyncStatusChange?.("saved");
    } catch (error) {
      setSaveError(`บันทึกไม่สำเร็จ: ${getErrorMessage(error, "Unknown error")}`);
      onSyncStatusChange?.("error");
      throw error;
    }
  }, [saveQueue, session.readOnly, onSyncStatusChange]);

  const handleUpdate = (nextData: StudentActivityData) => {
    if (readOnly) return;
    latestData.current = nextData;
    setData(nextData);
    saveQueue.update(nextData);
    onSyncStatusChange?.("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void persist().catch(() => undefined);
    }, 1500);
  };

  // Keep the roster aligned with the central enrollment tables when the admin
  // or a subject teacher changes this classroom in another tab.
  useEffect(() => {
    let cancelled = false;
    const refreshRoster = async () => {
      try {
        const roster = await backend.loadRoster();
        if (cancelled) return;
        const current = latestData.current;
        const students = mergeRosterWithSavedState(roster, current.students);
        if (JSON.stringify(students) === JSON.stringify(current.students)) return;
        const nextData = { ...current, students };
        latestData.current = nextData;
        setData(nextData);
        if (!session.readOnly) {
          saveQueue.update(nextData);
          void persist().catch(() => undefined);
        }
      } catch {
        // A temporary refresh failure keeps the current roster; the next event retries.
      }
    };
    const unsubscribe = backend.subscribeRoster(() => void refreshRoster());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [backend, persist, saveQueue, session.readOnly]);

  // An admin decision made elsewhere reaches this editor without a reload.
  useEffect(() => backend.subscribeApproval((next) => setApproval(next)), [backend]);

  const handlePersistStudentEdit = useCallback(
    async (student: Student, previousStudent?: Student) => {
      if (readOnly) return;
      await backend.updateStudent(student, previousStudent);
    },
    [backend, readOnly],
  );

  const handlePersistStudentAdd = useCallback(
    async (student: Student): Promise<Student> => {
      if (readOnly) return student;
      return backend.addStudent(student);
    },
    [backend, readOnly],
  );

  const handlePersistStudentDelete = useCallback(
    async (student: Student) => {
      if (readOnly) return;
      await backend.removeStudent(student);
    },
    [backend, readOnly],
  );

  const flushPendingSave = useCallback(async () => {
    if (session.readOnly) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await persist();
  }, [persist, session.readOnly]);

  const handleBack = async () => {
    if (leaving.current) return;
    leaving.current = true;
    try {
      await flushPendingSave();
      onBack();
    } catch {
      // Keep the editor and its unsaved values available for retry.
    } finally {
      leaving.current = false;
    }
  };

  const openSubmitDialog = () => {
    setActionError(null);
    setNotice(null);
    setDialog(stats.completionPercent >= 100 ? "submit" : "incomplete");
  };

  const handleSubmit = async () => {
    setWorkingAction("submit");
    setActionError(null);
    try {
      await flushPendingSave();
      // Store fresh completion stats so the server check matches what the teacher sees.
      await backend.save(latestData.current);
      const next = await backend.submit();
      setApproval(next);
      setDialog(null);
      setNotice("ส่งการประเมินกิจกรรมพัฒนาผู้เรียนแล้ว รอผู้ดูแลระบบอนุมัติ");
    } catch (error) {
      setActionError(getErrorMessage(error, "ส่งการประเมินกิจกรรมพัฒนาผู้เรียนไม่สำเร็จ"));
      setDialog(null);
    } finally {
      setWorkingAction(null);
    }
  };

  const handleReview = async (status: "approved" | "revision_requested") => {
    const reason = returnReason.trim();
    if (status === "revision_requested" && !reason) return;
    setWorkingAction("review");
    setActionError(null);
    try {
      const next = await backend.review(status, reason);
      setApproval(next);
      setDialog(null);
      setReturnReason("");
      setNotice(status === "approved" ? "อนุมัติการประเมินกิจกรรมพัฒนาผู้เรียนแล้ว" : "ส่งกลับให้ครูประจำชั้นแก้ไขแล้ว");
    } catch (error) {
      setActionError(getErrorMessage(error, "บันทึกผลการพิจารณาไม่สำเร็จ"));
      setDialog(null);
    } finally {
      setWorkingAction(null);
    }
  };

  const handlePrint = async () => {
    setActionError(null);
    if (approval.status !== "approved") {
      setActionError(NOT_APPROVED_MESSAGE);
      return;
    }
    const targetWindow = window.open("about:blank", "_blank");
    if (!targetWindow) {
      setActionError("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต Pop-up แล้วลองอีกครั้ง");
      return;
    }
    setWorkingAction("print");
    try {
      await flushPendingSave();
      openStudentActivityPrintDialog({
        id: session.id || session.classroomId,
        data: latestData.current,
        approvalStatus: approval.status,
        targetWindow,
      });
    } catch (error) {
      try {
        targetWindow.close();
      } catch {
        // The error below is enough if the browser refuses to close the tab.
      }
      setActionError(error instanceof Error ? error.message : "ไม่สามารถเปิดหน้าพิมพ์ได้");
    } finally {
      setWorkingAction(null);
    }
  };

  const handleExportPdf = async () => {
    setActionError(null);
    if (approval.status !== "approved") {
      setActionError(NOT_APPROVED_MESSAGE);
      return;
    }
    setWorkingAction("pdf");
    setPdfDownloadStatus({
      variant: "preparing",
      title: "กำลังเตรียมเอกสารกิจกรรมพัฒนาผู้เรียน",
      message: "ระบบกำลังจัดหน้าเอกสารและสร้างไฟล์ PDF กรุณารอสักครู่",
    });
    try {
      await flushPendingSave();
      await downloadStudentActivityPdf({
        id: session.id || session.classroomId,
        data: latestData.current,
        approvalStatus: approval.status,
      });
      setPdfDownloadStatus({
        variant: "success",
        title: "ดาวน์โหลด PDF สำเร็จ",
        message: "ไฟล์ PDF ถูกส่งไปยังรายการดาวน์โหลดของเบราว์เซอร์แล้ว",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ไม่สามารถบันทึกไฟล์ PDF ได้";
      setActionError(message);
      setPdfDownloadStatus({ variant: "error", title: "ดาวน์โหลด PDF ไม่สำเร็จ", message });
    } finally {
      setWorkingAction(null);
    }
  };

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void persist().catch(() => undefined);
      }
    };
  }, [persist]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!saveQueue.isDirty()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [saveQueue]);

  const coverSummary = dialog === "submit" || dialog === "approve" ? activityCoverSummary(data) : null;
  const incompleteItems =
    dialog === "incomplete"
      ? [
          {
            label: "เวลาเรียน",
            done: data.students.filter((student) =>
              Object.values(data.attendance?.records?.[student.id] ?? {}).some((mark) => String(mark ?? "").trim()),
            ).length,
          },
          ...ACTIVITY_KINDS.map((kind) => ({
            label: ACTIVITY_LABELS[kind],
            done: data.students.filter((student) => activityResultCell(data.assessments, definitions[kind], student.id).result).length,
          })),
        ]
      : [];

  return (
    <div className="h-screen overflow-y-auto bg-[#f5f5f7] font-sans">
      {saveError && (
        <div role="alert" className="sticky top-0 z-[110] border-b border-red-200 bg-red-50 p-4 text-red-800">
          <p>{saveError} ข้อมูลยังอยู่ในหน้านี้ กรุณาลองบันทึกอีกครั้งก่อนออก</p>
          <button
            type="button"
            className="mt-2 rounded border border-red-300 px-3 py-1"
            onClick={() => {
              void flushPendingSave().catch(() => undefined);
            }}
          >
            ลองบันทึกอีกครั้ง
          </button>
        </div>
      )}
      {pdfDownloadStatus && (
        <ModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
            <div
              className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 text-center shadow-[0_24px_60px_-28px_rgba(15,23,42,0.6)]"
              role="status"
              aria-live="polite"
            >
              <div
                className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
                  pdfDownloadStatus.variant === "success"
                    ? "bg-emerald-50 text-emerald-600"
                    : pdfDownloadStatus.variant === "error"
                      ? "bg-rose-50 text-rose-600"
                      : "bg-blue-50 text-blue-600"
                }`}
              >
                {pdfDownloadStatus.variant === "success" ? (
                  <CheckCircle2 className="h-8 w-8" />
                ) : pdfDownloadStatus.variant === "error" ? (
                  <AlertCircle className="h-8 w-8" />
                ) : (
                  <Loader2 className="h-8 w-8 animate-spin" />
                )}
              </div>
              <h2 className="text-lg font-extrabold text-slate-950">{pdfDownloadStatus.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{pdfDownloadStatus.message}</p>
              {pdfDownloadStatus.variant !== "preparing" && (
                <button type="button" onClick={() => setPdfDownloadStatus(null)} className="btn btn-secondary mt-5 !h-10 !px-5">
                  ปิด
                </button>
              )}
            </div>
          </div>
        </ModalPortal>
      )}
      {dialog && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[100] grid min-h-dvh place-items-center bg-slate-900/55 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !workingAction) setDialog(null);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="activity-approval-dialog-title"
              className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
            >
              {dialog === "incomplete" && (
                <>
                  <div className="mb-4 flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-600">
                      <AlertTriangle className="h-6 w-6" />
                    </span>
                    <div>
                      <h2 id="activity-approval-dialog-title" className="text-lg font-extrabold text-slate-900">
                        ยังส่งการประเมินไม่ได้
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        บันทึกข้อมูลแล้ว {completionPercent}% กรุณาบันทึกให้ครบ 100% ก่อนส่ง
                      </p>
                    </div>
                  </div>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
                    {incompleteItems.map((item) => {
                      const complete = data.students.length > 0 && item.done >= data.students.length;
                      return (
                        <li key={item.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <span className="font-semibold text-slate-700">{item.label}</span>
                          <span
                            className={`inline-flex items-center gap-1 font-bold ${complete ? "text-emerald-700" : "text-amber-700"}`}
                          >
                            {complete ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                            {item.done}/{data.students.length} คน
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setDialog(null)}
                      className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white hover:bg-slate-800"
                    >
                      กลับไปบันทึกต่อ
                    </button>
                  </div>
                </>
              )}

              {(dialog === "submit" || dialog === "approve") && coverSummary && (
                <>
                  <div className="mb-4 flex items-start gap-3">
                    <span
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${
                        dialog === "submit" ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600"
                      }`}
                    >
                      {dialog === "submit" ? <Send className="h-5 w-5" /> : <ShieldCheck className="h-6 w-6" />}
                    </span>
                    <div>
                      <h2 id="activity-approval-dialog-title" className="text-lg font-extrabold text-slate-900">
                        {dialog === "submit"
                          ? approval.status === "revision_requested"
                            ? "ส่งการประเมินที่แก้ไขแล้ว"
                            : "ส่งการประเมินกิจกรรมพัฒนาผู้เรียน"
                          : "อนุมัติการประเมินกิจกรรมพัฒนาผู้เรียน"}
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        ชั้น {data.generalInfo.gradeLevel} ปีการศึกษา {data.generalInfo.academicYear}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-xl font-extrabold text-slate-900">{coverSummary.totalStudents}</div>
                      <div className="text-slate-500">นักเรียน</div>
                    </div>
                    <div className="rounded-xl bg-emerald-50 px-3 py-2">
                      <div className="text-xl font-extrabold text-emerald-700">{coverSummary.passed}</div>
                      <div className="text-emerald-700">ผ่าน</div>
                    </div>
                    <div className="rounded-xl bg-rose-50 px-3 py-2">
                      <div className="text-xl font-extrabold text-rose-700">{coverSummary.failed}</div>
                      <div className="text-rose-700">ไม่ผ่าน</div>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-600">
                    {dialog === "submit"
                      ? "หลังส่งแล้วยังแก้ไขข้อมูลได้ เมื่ออนุมัติแล้วจึงพิมพ์และบันทึก PDF ได้"
                      : "เมื่ออนุมัติแล้ว ครูประจำชั้นจะพิมพ์และบันทึก PDF ได้ และช่อง “อนุมัติ” บนหน้าปกจะถูกทำเครื่องหมาย"}
                  </p>
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={Boolean(workingAction)}
                      onClick={() => setDialog(null)}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(workingAction)}
                      onClick={() => void (dialog === "submit" ? handleSubmit() : handleReview("approved"))}
                      className={`inline-flex items-center rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60 ${
                        dialog === "submit" ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700"
                      }`}
                    >
                      {workingAction && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {dialog === "submit" ? "ยืนยันการส่ง" : "อนุมัติ"}
                    </button>
                  </div>
                </>
              )}

              {dialog === "return" && (
                <>
                  <div className="mb-4 flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-600">
                      <Undo2 className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 id="activity-approval-dialog-title" className="text-lg font-extrabold text-slate-900">
                        ไม่อนุมัติ และส่งกลับให้แก้ไข
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        ชั้น {data.generalInfo.gradeLevel} ปีการศึกษา {data.generalInfo.academicYear}
                      </p>
                    </div>
                  </div>
                  <label htmlFor="activity-return-reason" className="mb-1.5 block text-sm font-bold text-slate-700">
                    เหตุผลที่ไม่อนุมัติ
                  </label>
                  <textarea
                    id="activity-return-reason"
                    value={returnReason}
                    onChange={(event) => setReturnReason(event.target.value)}
                    rows={4}
                    placeholder="เช่น ตรวจสอบเวลาเรียนเดือนมิถุนายนอีกครั้ง"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
                  />
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={Boolean(workingAction)}
                      onClick={() => setDialog(null)}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(workingAction) || !returnReason.trim()}
                      onClick={() => void handleReview("revision_requested")}
                      className="inline-flex items-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60"
                    >
                      {workingAction && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      ส่งกลับให้แก้ไข
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </ModalPortal>
      )}
      <header className="no-print sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 shadow-[0_12px_28px_-24px_rgb(15,23,42,0.45)] backdrop-blur-xl">
        <div className="px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <img src="/logo3.png" alt="" className="h-14 w-14 shrink-0 scale-110 object-contain" />
              <div className="min-w-0">
                <h1 className="truncate text-[17px] font-extrabold leading-6 tracking-tight text-slate-950 sm:text-xl">
                  กิจกรรมพัฒนาผู้เรียน
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-slate-400" />
                    {data.generalInfo.gradeLevel}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    ปีการศึกษา {data.generalInfo.academicYear} (ทั้งปีการศึกษา)
                  </span>
                  {homeroomTeachers.length > 0 && (
                    <span className="inline-flex max-w-full items-center gap-1 truncate sm:max-w-[360px]">
                      <UserCheck className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">ครูประจำชั้น {homeroomTeachers.join(", ")}</span>
                    </span>
                  )}
                  <span className="inline-flex h-8 w-[176px] shrink-0 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3 text-[11px] font-bold text-slate-500">
                        <span>ความครบถ้วน</span>
                        <span className="text-slate-900">{completionPercent}%</span>
                      </span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <span
                          className="block h-full rounded-full bg-emerald-600 transition-all"
                          style={{ width: `${completionPercent}%` }}
                        />
                      </span>
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
              <button
                type="button"
                onClick={() => void handleBack()}
                className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700 shadow-[0_2px_6px_rgba(15,23,42,0.18)] ring-1 ring-slate-100 transition hover:bg-slate-50 hover:text-slate-950"
                title="ย้อนกลับ"
              >
                <ArrowLeft className="h-[18px] w-[18px]" />
                <span>ย้อนกลับ</span>
              </button>

              <button
                type="button"
                onClick={() => void handlePrint()}
                disabled={workingAction === "print"}
                className="btn !h-10 !rounded-lg !px-3 border border-slate-800 bg-slate-950 text-white shadow-sm hover:border-slate-900 hover:bg-slate-800"
                title="พิมพ์บันทึกกิจกรรมพัฒนาผู้เรียน"
              >
                {workingAction === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                <span className="hidden sm:inline">พิมพ์</span>
              </button>
              <button
                type="button"
                onClick={() => void handleExportPdf()}
                disabled={workingAction === "pdf"}
                className="btn !h-10 !rounded-lg !px-3 border border-blue-600 bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm hover:from-blue-600 hover:to-blue-700"
                title="บันทึกเป็น PDF"
              >
                {workingAction === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                <span className="hidden sm:inline">บันทึก PDF</span>
              </button>

              {canSubmit && (
                <button
                  type="button"
                  onClick={openSubmitDialog}
                  disabled={workingAction === "submit"}
                  className="btn !h-10 !rounded-lg !px-3 border border-emerald-600 bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-sm hover:from-emerald-600 hover:to-emerald-700"
                  title={
                    completionPercent < 100
                      ? `บันทึกแล้ว ${completionPercent}% ต้องครบ 100% จึงส่งได้`
                      : "ส่งการประเมินกิจกรรมพัฒนาผู้เรียนให้ผู้ดูแลระบบอนุมัติ"
                  }
                >
                  {workingAction === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  <span>
                    {approval.status === "revision_requested"
                      ? "ส่งการประเมินที่แก้ไข"
                      : "ส่งการประเมินกิจกรรมพัฒนาผู้เรียน"}
                  </span>
                </button>
              )}
              {approval.status === "pending" && (
                <span className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700">
                  <Clock3 className="h-4 w-4" />
                  ส่งแล้ว รออนุมัติ
                </span>
              )}
              {approval.status === "approved" && (
                <span className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  อนุมัติแล้ว
                </span>
              )}
              {canReview && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      setDialog("approve");
                    }}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    อนุมัติ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      setReturnReason("");
                      setDialog("return");
                    }}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm font-bold text-rose-700 hover:bg-rose-100"
                  >
                    <X className="h-4 w-4" />
                    ไม่อนุมัติ
                  </button>
                </>
              )}
            </div>
          </div>
          {actionError && (
            <div role="alert" className="mt-2 flex items-center gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{actionError}</span>
              <button type="button" onClick={() => setActionError(null)} className="text-rose-400 hover:text-rose-700" aria-label="ปิดข้อความ">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="no-print px-4 pb-6 pt-4 sm:px-6 lg:px-8">
        {approval.status === "revision_requested" && (
          <div role="status" className="mb-3 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
            <div>
              <p className="font-bold">ผู้ดูแลระบบไม่อนุมัติ และส่งกลับให้แก้ไข</p>
              <p className="mt-0.5">{approval.reason || "ไม่มีรายละเอียดเพิ่มเติม"}</p>
              {canSubmit && <p className="mt-1 text-rose-700">แก้ไขข้อมูลแล้วกด “ส่งการประเมินที่แก้ไข” อีกครั้ง</p>}
            </div>
          </div>
        )}
        {alreadySubmitted && (
          <div
            role="status"
            className={`mb-3 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${
              approval.status === "approved"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-blue-200 bg-blue-50 text-blue-800"
            }`}
          >
            {approval.status === "approved" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Clock3 className="h-4 w-4 shrink-0" />}
            {approval.status === "approved"
              ? "อนุมัติแล้ว — เปิดดู พิมพ์ และบันทึก PDF ได้"
              : "ส่งการประเมินแล้ว รอผู้ดูแลระบบอนุมัติ"}
          </div>
        )}
        {notice && !alreadySubmitted && approval.status !== "revision_requested" && (
          <div role="status" className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800">
            {notice}
          </div>
        )}
        <div className="ui-card overflow-hidden animate-fade-up">
          <div className="p-2 sm:p-3">
            <div className={`gradebook-folder-frame gradebook-folder-frame-${activeTab}`}>
              <FolderTabs
                menuItems={menuItems}
                activeId={activeTab}
                onChange={setActiveTab}
                ariaLabel="เมนูบันทึกกิจกรรมพัฒนาผู้เรียน"
                fitLabels
              />
              <div className={`gradebook-folder-content ${isDocumentTab ? "gradebook-folder-content-document" : ""}`}>
                <div key={activeTab} className="gradebook-paper-turn">
                  {activeTab === "general" && <ActivityCoverPreview data={data} approvalStatus={approval.status} />}
                  {activeTab === "students" && (
                    <StudentsForm
                      data={data.students}
                      generalInfo={attendanceInfo}
                      attendance={data.attendance}
                      period={attendancePeriod}
                      readOnly={readOnly}
                      onChange={(students) => handleUpdate({ ...latestData.current, students })}
                      onAttendanceChange={(attendance) => handleUpdate({ ...latestData.current, attendance })}
                      onPersistStudentEdit={handlePersistStudentEdit}
                      onPersistStudentAdd={handlePersistStudentAdd}
                      onPersistStudentDelete={handlePersistStudentDelete}
                    />
                  )}
                  {activeKind && (
                    <ActivityAssessmentForm
                      students={data.students}
                      generalInfo={data.generalInfo}
                      assessments={data.assessments}
                      definition={definitions[activeKind]}
                      readOnly={readOnly}
                      onChange={(assessments) => handleUpdate({ ...latestData.current, assessments })}
                    />
                  )}
                  {activeTab === "activity_summary" && (
                    <ActivitySummaryForm
                      data={data}
                      readOnly={readOnly}
                      onChange={(assessments) => handleUpdate({ ...latestData.current, assessments })}
                    />
                  )}
                  {activeTab === "instructions" && <ActivityInstructionsTab />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

import { createCoalescedRefresh } from '../../lib/coalescedRefresh';
import { configuredIndicatorCodes, missingIndicatorCodes, normalizeIndicatorCode, mergeIndicatorDetails } from '../../lib/indicatorDetails';
import { fetchCurriculumStandards } from '../../lib/curriculum';
import { primaryCombinedConfig } from "../../lib/primaryYear";
import { PrimaryScoresForm } from "../../components/PrimaryScoresForm";
import { PrimaryAssessmentForm } from "../../components/PrimaryAssessmentForm";
import { GradebookDelegationControl } from '../../components/GradebookDelegationControl';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  FileText,
  Loader2,
  Printer,
  Users,
} from "lucide-react";
import { GeneralInfoForm } from "../../components/GeneralInfoForm";
import { StudentsForm } from "../../components/StudentsForm";
import { ScoresForm } from "../../components/ScoresForm";
import { AttributesForm } from "../../components/AttributesForm";
import { Attributes5_8Form } from "../../components/Attributes5_8Form";
import { AnalyticalForm } from "../../components/AnalyticalForm";
import { IndicatorsForm } from "../../components/IndicatorsForm";
import { Instructions1Form } from "../../components/Instructions1Form";
import { Instructions2Form } from "../../components/Instructions2Form";
import { FolderTabs } from "../../components/FolderTabs";
import { ModalPortal } from "../../components/ModalPortal";
import { appDataToRow } from "../../lib/gradebookAdapter";
import { applyPap5OfficialDisplayDefaults } from "../../lib/pap5Officials";
import {
  computeGradebookStats,
} from "../../lib/gradebookStats";
import { createSaveQueue } from "../../lib/saveQueue";
import { constrainScores } from "../../lib/scoreLimits";
import { constrainAssessmentData } from "../../lib/assessmentLimits";
import { supabase } from "../../lib/supabase";
import { downloadPap5Pdf } from "../../utils/pap5PdfPreview";
import { openPap5PrintDialog } from "../../utils/pap5PrintDialog";
import { buildStudentRoster } from "../../lib/teacherGradebooks";
import { mergeRosterWithSavedState } from "../../lib/studentRoster";
import type { GradebookSession } from "../../lib/teacherGradebooks";
import type { AppData, AppUser, GradebookApprovalStatus, Student } from "../../types";

const menuItems = [
  { id: "general", label: "ปก", surface: "document" },
  { id: "students", label: "เวลาเรียน" },
  { id: "scores", label: "คะแนนตามตัวชี้วัด" },
  { id: "attributes1_4", label: "คุณลักษณะ 1-4" },
  { id: "attributes5_8", label: "คุณลักษณะ 5-8" },
  { id: "analytical", label: "คิดวิเคราะห์" },
  { id: "indicators", label: "ตัวชี้วัด" },
  { id: "instructions1", label: "คำชี้แจง", surface: "document" },
  { id: "instructions2", label: "คำชี้แจงต่อ", surface: "document" },
];

const STUDENT_NAME_TITLES = [
  "เด็กชาย",
  "เด็กหญิง",
  "ด.ช.",
  "ด.ญ.",
  "นาย",
  "นางสาว",
  "น.ส.",
  "นาง",
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function splitStudentNameForAcademicRecord(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const title = parts.length > 0 && STUDENT_NAME_TITLES.includes(parts[0]) ? parts.shift() ?? null : null;
  const firstName = parts.shift() ?? "";
  const lastName = parts.join(" ");

  return {
    title,
    firstName: firstName || fullName.trim(),
    lastName,
  };
}

function getSupabaseErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Unknown error";
}

function isMissingStudentUpdateRpcError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";

  return (
    code === "PGRST202" ||
    message.includes("teacher_update_assigned_student") ||
    message.includes("schema cache") ||
    message.includes("could not find the function")
  );
}

interface GradebookEditorProps {
  session: GradebookSession;
  currentUser: AppUser;
  onBack: () => void;
  onSyncStatusChange?: (status: "idle" | "saving" | "saved" | "error") => void;
}

type PdfDownloadStatus = {
  variant: "preparing" | "success" | "error";
  title: string;
  message: string;
};

export const GradebookEditor: React.FC<GradebookEditorProps> = ({
  session,
  currentUser,
  onBack,
  onSyncStatusChange,
}) => {
  const [data, setData] = useState<AppData>(() => {
    const assessments = constrainAssessmentData(session.data).data;
    if (session.data.primaryYear) return assessments;
    const scores = constrainScores(assessments.scores, assessments.scoreConfig).scores;
    return scores === assessments.scores ? assessments : { ...assessments, scores };
  });
  const [approvalStatus, setApprovalStatus] = useState<GradebookApprovalStatus | null>(session.approval_status);
  const [activeTab, setActiveTab] = useState("general");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [printingPap5, setPrintingPap5] = useState(false);
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null);
  const [pdfDownloadStatus, setPdfDownloadStatus] = useState<PdfDownloadStatus | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [scoreRepairNotice, setScoreRepairNotice] = useState('');
  const leaving = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestData = useRef(data);
  latestData.current = data;
  const gradebookStats = useMemo(() => computeGradebookStats(data), [data]);
  const completionPercent = Math.max(0, Math.min(100, Math.round(gradebookStats.completionPercent)));
  const subjectName = data.generalInfo.subjectName?.trim() || session.label;
  const subjectCode = data.generalInfo.subjectCode?.trim();
  const gradeLevel = data.generalInfo.gradeLevel?.trim();
  const learningArea = data.generalInfo.learningArea?.trim();
  const isDocumentPreviewTab =
    activeTab === "general" ||
    activeTab === "instructions1" ||
    activeTab === "instructions2";
  const approvalToolbarBadge = useMemo(() => {
    if (approvalStatus === "approved") {
      return {
        label: "อนุมัติแล้ว",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    }
    if (approvalStatus === "revision_requested") {
      return {
        label: "รอแก้ไข",
        className: "border-rose-200 bg-rose-50 text-rose-700",
      };
    }
    if (approvalStatus === "pending") {
      return {
        label: "รออนุมัติ",
        className: "border-blue-200 bg-blue-50 text-blue-700",
      };
    }
    return null;
  }, [approvalStatus]);

  const savedPrimaryTerms = useRef(session.data.primaryYear?.terms ?? {});
  const writeSnapshot = useCallback(
    async (appData: AppData) => {
      if (session.readOnly) return;
      try {
        const stats = computeGradebookStats(appData);
        const status =
          session.gradebook_status === "completed"
            ? "completed"
            : stats.completionPercent > 0 || stats.hasTeacherInput
              ? "in_progress"
              : "not_started";
        if (appData.primaryYear) {
          const { error } = await supabase.rpc('save_primary_gradebook_year', {
            p_gradebook_id: session.id, p_data: { ...appData, stats }, p_original_terms: savedPrimaryTerms.current,
          });
          if (error) throw error;
          savedPrimaryTerms.current = structuredClone(appData.primaryYear.terms);
          return;
        }
        const { data: saved, error } = await supabase
          .from("gradebooks")
          .update({
            ...appDataToRow(appData),
            stats,
            status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", session.id)
          .select("id")
          .single();

        if (error) throw error;
        if (!saved) throw new Error("ไม่สามารถบันทึกข้อมูลได้ กรุณาตรวจสอบสิทธิ์");
      } catch (error) {
        throw new Error(`บันทึกไม่สำเร็จ: ${getSupabaseErrorMessage(error)}`);
      }
    },
    [session.id, session.readOnly, session.gradebook_status],
  );

  const writeRef = useRef(writeSnapshot);
  writeRef.current = writeSnapshot;
  const saveQueue = useMemo(() => createSaveQueue(session.data, value => writeRef.current(value)), [session.id]);
  const persist = useCallback(async () => {
    if (session.readOnly || !saveQueue.isDirty()) return;
    onSyncStatusChange?.("saving");
    setSaveError(null);
    try {
      await saveQueue.flush();
      onSyncStatusChange?.("saved");
    } catch (error) {
      setSaveError(getSupabaseErrorMessage(error));
      onSyncStatusChange?.("error");
      throw error;
    }
  }, [saveQueue, session.readOnly, onSyncStatusChange]);

  const handleUpdate = (newData: AppData) => {
    if (session.readOnly) return;
    latestData.current = newData;
    setData(newData);
    saveQueue.update(newData);
    onSyncStatusChange?.("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void persist().catch(() => undefined);
    }, 1500);
  };

  useEffect(() => {
    if (session.readOnly || session.data.primaryYear) return;
    const scores = constrainScores(session.data.scores, session.data.scoreConfig);
    const assessments = constrainAssessmentData(session.data);
    if (!scores.changed && !assessments.changed) return;
    const changed = scores.changed + assessments.changed;
    setScoreRepairNotice(`ปรับคะแนนเดิม ${changed} ช่องที่อยู่นอกช่วงคะแนนที่กำหนดแล้ว`);
    handleUpdate({ ...assessments.data, scores: scores.scores });
  }, [session.id]);

  // Keep an already-open gradebook aligned when the admin or another teacher
  // changes the shared classroom roster in another tab/subject.
  useEffect(() => {
    let cancelled = false;

    const refreshRoster = async () => {
      try {
        const roster = await buildStudentRoster(
          session.classroom_id,
          session.academic_year_id,
        );
        if (cancelled) return;

        const current = latestData.current;
        const students = mergeRosterWithSavedState(roster, current.students);
        if (JSON.stringify(students) === JSON.stringify(current.students)) return;

        const nextData = { ...current, students };
        latestData.current = nextData;
        setData(nextData);
        if (!session.readOnly) {
          saveQueue.update(nextData);
          onSyncStatusChange?.("saving");
          void persist().then(
            () => onSyncStatusChange?.("saved"),
            () => onSyncStatusChange?.("error"),
          );
        }
      } catch {
        // Keep the current editor usable during a temporary realtime refresh
        // failure; the next event or page load will retry the roster query.
      }
    };

    let channel = supabase.channel(`gradebook-roster-${session.id}`);
    channel = channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "student_enrollments",
        filter: `academic_year_id=eq.${session.academic_year_id}`,
      },
      () => void refreshRoster(),
    );
    if (currentUser.schoolId) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "students",
          filter: `school_id=eq.${currentUser.schoolId}`,
        },
        () => void refreshRoster(),
      );
    }
    channel.subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [
    currentUser.schoolId,
    onSyncStatusChange,
    persist,
    saveQueue,
    session.academic_year_id,
    session.classroom_id,
    session.id,
    session.readOnly,
  ]);

  const indicatorConfig = primaryCombinedConfig(data);
  const indicatorCodeSignature = JSON.stringify(configuredIndicatorCodes(indicatorConfig));
  const missingDetails = missingIndicatorCodes(indicatorConfig, data.indicators);
  useEffect(() => {
    if (session.readOnly || !missingIndicatorCodes(primaryCombinedConfig(latestData.current), latestData.current.indicators).length) return;
    let cancelled = false;
    const info = latestData.current.generalInfo;
    void fetchCurriculumStandards(info.learningArea, info.gradeLevel, undefined, { subjectCode: info.subjectCode }).then(standards => {
      if (cancelled || leaving.current) return;
      const descriptions = new Map<string,string>();
      standards.forEach(s => s.indicators.forEach(i => { if (i.description?.trim()) descriptions.set(normalizeIndicatorCode(i.code), i.description.trim()); }));
      const current = latestData.current;
      const indicators = mergeIndicatorDetails(current.indicators, configuredIndicatorCodes(primaryCombinedConfig(current)), descriptions);
      if (JSON.stringify(indicators) !== JSON.stringify(current.indicators)) handleUpdate({ ...current, indicators });
    }).catch(() => { /* Missing descriptions remain visible for manual entry or retry. */ });
    return () => { cancelled = true; };
  }, [indicatorCodeSignature, session.readOnly, data.generalInfo.learningArea, data.generalInfo.gradeLevel, data.generalInfo.subjectCode]);

  const handlePersistStudentEdit = useCallback(
    async (student: Student, previousStudent?: Student) => {
      if (session.readOnly) return;

      const studentCode = student.studentId.trim();
      const citizenId = student.citizenId?.trim() || null;
      const { title, firstName, lastName } = splitStudentNameForAcademicRecord(student.name);
      if (!studentCode || !firstName.trim()) {
        throw new Error("กรุณากรอกรหัสนักเรียนและชื่อนักเรียนก่อนบันทึก");
      }

      const payload = {
        student_code: studentCode,
        citizen_id: citizenId,
        title,
        first_name: firstName,
        last_name: lastName,
      };
      const previousStudentCode = previousStudent?.studentId.trim() || studentCode;
      const studentUuid = UUID_PATTERN.test(student.id) ? student.id : null;

      const { error: rpcError } = await supabase.rpc("teacher_update_assigned_student", {
        p_student_id: studentUuid,
        p_previous_student_code: previousStudentCode || null,
        p_student_code: studentCode,
        p_citizen_id: citizenId,
        p_title: title,
        p_first_name: firstName,
        p_last_name: lastName,
      });

      if (!rpcError) return;
      if (!isMissingStudentUpdateRpcError(rpcError)) {
        throw new Error(`ไม่สามารถอัปเดตข้อมูลนักเรียนในฐานข้อมูลกลางได้: ${getSupabaseErrorMessage(rpcError)}`);
      }

      const updateAttempts: Array<() => Promise<{ updated: boolean; error: unknown | null }>> = [];

      if (studentUuid) {
        updateAttempts.push(async () => {
          const { data: updatedRows, error } = await supabase
            .from("students")
            .update(payload)
            .eq("id", studentUuid)
            .select("id");

          return { updated: Boolean(updatedRows?.length), error };
        });
      }

      if (currentUser.schoolId && previousStudentCode) {
        updateAttempts.push(async () => {
          const { data: updatedRows, error } = await supabase
            .from("students")
            .update(payload)
            .eq("school_id", currentUser.schoolId)
            .eq("student_code", previousStudentCode)
            .select("id");

          return { updated: Boolean(updatedRows?.length), error };
        });
      }

      if (updateAttempts.length === 0) return;

      const errors: unknown[] = [];
      for (const attempt of updateAttempts) {
        const result = await attempt();
        if (result.error) {
          errors.push(result.error);
          continue;
        }
        if (result.updated) return;
      }

      const firstError = errors[0];
      throw new Error(
        firstError
          ? `ไม่สามารถอัปเดตข้อมูลนักเรียนในฐานข้อมูลกลางได้: ${getSupabaseErrorMessage(firstError)}`
          : "ไม่พบข้อมูลนักเรียนในฐานข้อมูลกลางที่สามารถอัปเดตได้",
      );
    },
    [currentUser.schoolId, session.readOnly],
  );

  const handlePersistStudentAdd = useCallback(
    async (student: Student): Promise<Student> => {
      if (session.readOnly) return student;

      const studentCode = student.studentId.trim();
      const citizenId = student.citizenId?.trim() || null;
      const { title, firstName, lastName } = splitStudentNameForAcademicRecord(student.name);
      if (!studentCode || !firstName.trim()) {
        throw new Error("กรุณากรอกรหัสนักเรียนและชื่อนักเรียนก่อนบันทึก");
      }

      const { data: studentId, error } = await supabase.rpc("teacher_add_assigned_student", {
        p_teaching_assignment_id: session.teaching_assignment_id,
        p_student_code: studentCode,
        p_citizen_id: citizenId,
        p_title: title,
        p_first_name: firstName,
        p_last_name: lastName,
        p_student_number: student.studentNumber ?? null,
      });

      if (error) {
        throw new Error(`ไม่สามารถเพิ่มนักเรียนในฐานข้อมูลกลางได้: ${getSupabaseErrorMessage(error)}`);
      }
      if (typeof studentId !== "string" || !UUID_PATTERN.test(studentId)) {
        throw new Error("ระบบไม่ได้รับรหัสนักเรียนที่บันทึกจากฐานข้อมูลกลาง");
      }

      return {
        ...student,
        id: studentId,
        studentId: studentCode,
        citizenId: citizenId ?? undefined,
        name: [title, firstName, lastName].filter(Boolean).join(" "),
      };
    },
    [session.readOnly, session.teaching_assignment_id],
  );

  const handlePersistStudentDelete = useCallback(
    async (student: Student): Promise<void> => {
      if (session.readOnly) return;
      if (!UUID_PATTERN.test(student.id)) {
        // An unsaved row only exists in this gradebook editor, so removing it
        // does not require a central roster mutation.
        return;
      }

      // A student can already have been permanently deleted from the admin
      // screen while an older gradebook tab still contains its JSON snapshot.
      // Treat that case as an idempotent success so the stale row can be
      // removed locally instead of showing a misleading permission error.
      const centralRoster = await buildStudentRoster(
        session.classroom_id,
        session.academic_year_id,
      );
      if (!centralRoster.some((currentStudent) => currentStudent.id === student.id)) {
        return;
      }

      const { error } = await supabase.rpc("teacher_remove_assigned_student", {
        p_teaching_assignment_id: session.teaching_assignment_id,
        p_student_id: student.id,
      });
      if (error) {
        throw new Error(`ไม่สามารถลบนักเรียนออกจากห้องเรียนได้: ${getSupabaseErrorMessage(error)}`);
      }
    },
    [
      session.academic_year_id,
      session.classroom_id,
      session.readOnly,
      session.teaching_assignment_id,
    ],
  );

  const flushPendingSave = useCallback(async () => {
    if (session.readOnly) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await persist();
  }, [persist, session.readOnly]);

  const leaveAfterSave = async (navigate: () => void) => {
    if (leaving.current) return;
    leaving.current = true;
    try {
      await flushPendingSave();
      navigate();
    } catch {
      // Keep the editor and its unsaved values available for retry.
    } finally {
      leaving.current = false;
    }
  };
  const handleBack = () => leaveAfterSave(onBack);

  const handleTabChange = useCallback(
    (nextTab: string) => {
      setActiveTab(nextTab);
    },
    [],
  );

  const handleExportPdf = useCallback(async () => {
    setPdfPreviewError(null);

    if (approvalStatus !== "approved") {
      setPdfPreviewError("ปพ.5 ยังไม่ได้รับการอนุมัติ");
      return;
    }

    setExportingPdf(true);
    setPdfDownloadStatus({
      variant: "preparing",
      title: "กำลังเตรียมเอกสาร ปพ.5",
      message: "ระบบกำลังจัดหน้าเอกสารและสร้างไฟล์ PDF กรุณารอสักครู่",
    });
    try {
      await flushPendingSave();
      const preparedData = {
        ...latestData.current,
        generalInfo: applyPap5OfficialDisplayDefaults(latestData.current.generalInfo),
      };
      await downloadPap5Pdf({
        id: session.id,
        data: preparedData,
        approvalStatus,
      });
      setPdfDownloadStatus({
        variant: "success",
        title: "ดาวน์โหลด ปพ.5 สำเร็จ",
        message: "ไฟล์ PDF ถูกส่งไปยังรายการดาวน์โหลดของเบราว์เซอร์แล้ว",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ไม่สามารถบันทึกไฟล์ PDF ได้";
      setPdfPreviewError(message);
      setPdfDownloadStatus({
        variant: "error",
        title: "ดาวน์โหลด ปพ.5 ไม่สำเร็จ",
        message,
      });
    } finally {
      setExportingPdf(false);
    }
  }, [approvalStatus, flushPendingSave, session.id]);

  const handlePrintPap5 = useCallback(async () => {
    setPdfPreviewError(null);

    if (approvalStatus !== "approved") {
      setPdfPreviewError("ปพ.5 ยังไม่ได้รับการอนุมัติ");
      return;
    }

    const targetWindow = window.open("about:blank", "_blank");
    if (!targetWindow) {
      setPdfPreviewError("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต Pop-up แล้วลองอีกครั้ง");
      return;
    }

    setPrintingPap5(true);
    try {
      await flushPendingSave();
      const preparedData = {
        ...latestData.current,
        generalInfo: applyPap5OfficialDisplayDefaults(latestData.current.generalInfo),
      };
      openPap5PrintDialog({
        id: session.id,
        data: preparedData,
        approvalStatus,
        targetWindow,
      });
    } catch (error) {
      try {
        targetWindow.close();
      } catch {
        // The user-facing error below is enough if the browser refuses to close the tab.
      }
      setPdfPreviewError(error instanceof Error ? error.message : "ไม่สามารถเปิดหน้าพิมพ์ ปพ.5 ได้");
    } finally {
      setPrintingPap5(false);
    }
  }, [approvalStatus, flushPendingSave, session.id]);

  useEffect(() => {
    setApprovalStatus(session.approval_status);
  }, [session.approval_status]);

  useEffect(() => {
    const syncApprovalStatus = async () => {
      const { data: row, error } = await supabase
        .from("gradebooks")
        .select("approval_status")
        .eq("id", session.id)
        .maybeSingle();

      if (error) return;

      setApprovalStatus(
        ((row?.approval_status as GradebookApprovalStatus | null | undefined) ?? null),
      );
    };

    const channel = supabase
      .channel(`gradebook-editor-approval-${session.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "gradebooks", filter: `id=eq.${session.id}` },
        (payload) => {
          const nextStatus = (payload.new as { approval_status?: GradebookApprovalStatus | null }).approval_status;
          setApprovalStatus(nextStatus ?? null);
        },
      )
      .subscribe();

    const refresher = createCoalescedRefresh(syncApprovalStatus, { debounceMs: 0 });

    return () => {
      refresher.dispose();
      void supabase.removeChannel(channel);
    };
  }, [session.id]);

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

  return (
    <div className="h-screen overflow-y-auto bg-[#f5f5f7] font-sans">
      {saveError && (
        <div role="alert" className="sticky top-0 z-[110] bg-red-50 border-b border-red-200 p-4 text-red-800">
          <p>{saveError} ข้อมูลยังอยู่ในหน้านี้ กรุณาลองบันทึกอีกครั้งก่อนออก</p>
          <button type="button" className="mt-2 rounded border border-red-300 px-3 py-1" onClick={() => { void flushPendingSave().catch(() => undefined); }}>ลองบันทึกอีกครั้ง</button>
        </div>
      )}
      {scoreRepairNotice && <div role="status" className="sticky top-0 z-[109] border-b border-amber-200 bg-amber-50 px-4 py-2 text-amber-800">{scoreRepairNotice}</div>}
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
                <button
                  type="button"
                  onClick={() => setPdfDownloadStatus(null)}
                  className="btn btn-secondary mt-5 !h-10 !px-5"
                >
                  ปิด
                </button>
              )}
            </div>
          </div>
        </ModalPortal>
      )}
      <header className="no-print sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 shadow-[0_12px_28px_-24px_rgb(15,23,42,0.45)] backdrop-blur-xl">
        <div className="px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src="/logo3.png"
                alt=""
                className="h-14 w-14 shrink-0 scale-110 object-contain"
              />

              <div className="min-w-0">
                <h1 className="truncate text-[17px] font-extrabold leading-6 tracking-tight text-slate-950 sm:text-xl">
                  {subjectName}
                </h1>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
                  {subjectCode && (
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5 text-slate-400" />
                      {subjectCode}
                    </span>
                  )}
                  {gradeLevel && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      {gradeLevel}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    ปี {session.year_be} ภาคเรียนที่ {session.semester_number}
                  </span>
                  {learningArea && (
                    <span className="max-w-full truncate sm:max-w-[280px]">
                      {learningArea}
                    </span>
                  )}
                  {approvalToolbarBadge && (
                    <span className={`inline-flex h-8 shrink-0 items-center rounded-lg border px-3 text-xs font-bold shadow-sm ${approvalToolbarBadge.className}`}>
                      {approvalToolbarBadge.label}
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
                          className="block h-full rounded-full bg-blue-600 transition-all"
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
              <GradebookDelegationControl session={session} currentUserId={currentUser.id} beforeChange={flushPendingSave} />

              {session.readOnly ? (
                <div className="flex h-10 shrink-0 items-center rounded-lg border border-amber-100 bg-amber-50 px-3 text-xs font-semibold text-amber-800 shadow-sm">
                  ระบบปิดการแก้ไข — ดูและดาวน์โหลดไฟล์ได้ แต่แก้ไขไม่ได้
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void handlePrintPap5()}
                disabled={printingPap5}
                className="btn !h-10 !rounded-lg !px-3 border border-slate-800 bg-slate-950 text-white shadow-sm hover:border-slate-900 hover:bg-slate-800"
                title="พิมพ์ ปพ.5"
              >
                {printingPap5 ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">พิมพ์ ปพ.5</span>
              </button>

              <button
                type="button"
                onClick={() => void handleExportPdf()}
                disabled={exportingPdf}
                className="btn !h-10 !rounded-lg !px-3 border border-blue-600 bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm hover:from-blue-600 hover:to-blue-700"
                title="บันทึก ปพ.5 เป็น PDF"
              >
                {exportingPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">บันทึก PDF ปพ.5</span>
              </button>
              {pdfPreviewError && (
                <div className="max-w-[220px] text-xs font-medium text-red-600">
                  {pdfPreviewError}
                </div>
              )}

            </div>
          </div>
        </div>

      </header>

      <main className="no-print px-4 pt-4 pb-6 sm:px-6 lg:px-8">
        <div className="ui-card overflow-hidden animate-fade-up">
          <div className="p-2 sm:p-3">
            <div className={`gradebook-folder-frame gradebook-folder-frame-${activeTab}`}>
              <FolderTabs
                menuItems={menuItems}
                activeId={activeTab}
                onChange={handleTabChange}
              />
              <div
                className={`gradebook-folder-content ${
                  isDocumentPreviewTab ? "gradebook-folder-content-document" : ""
                }`}
              >
                {missingDetails.length > 0 && <button type="button" onClick={() => setActiveTab('indicators')} className="m-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">รายละเอียดตัวชี้วัดยังไม่ครบ {missingDetails.length} ข้อ: {missingDetails.join(', ')} — กดเพื่อตรวจสอบ</button>}
                <div key={activeTab} className="gradebook-paper-turn">

            {activeTab === "general" && (
              <GeneralInfoForm
                data={data.generalInfo}
                appData={data}
                approvalStatus={approvalStatus}
                readOnly
                onChange={() => undefined}
              />
            )}
            {activeTab === "students" && (
              <StudentsForm
                data={data.students}
                generalInfo={data.generalInfo}
                attendance={data.attendance}
                readOnly={session.readOnly}
                onChange={(students) =>
                  !session.readOnly && handleUpdate({ ...latestData.current, students })
                }
                onAttendanceChange={(attendance) =>
                  !session.readOnly && handleUpdate({ ...latestData.current, attendance })
                }
                onPersistStudentEdit={handlePersistStudentEdit}
                onPersistStudentAdd={handlePersistStudentAdd}
                onPersistStudentDelete={handlePersistStudentDelete}
              />
            )}
            {activeTab === "scores" && (data.primaryYear ? <PrimaryScoresForm data={data} readOnly={session.readOnly} currentGradebookId={session.id} onChange={handleUpdate} /> : (
              <ScoresForm
                students={data.students}
                data={data.scores}
                generalInfo={data.generalInfo}
                scoreConfig={data.scoreConfig}
                readOnly={session.readOnly}
                currentGradebookId={session.id}
                onChange={(scores) =>
                  !session.readOnly && handleUpdate({ ...data, scores })
                }
                onConfigChange={(scoreConfig) => {
                  if (session.readOnly) return;
                  const repaired = constrainScores(data.scores, scoreConfig);
                  if (repaired.changed) setScoreRepairNotice(`ปรับคะแนน ${repaired.changed} ช่องให้ไม่เกินคะแนนเต็มที่ตั้งใหม่แล้ว`);
                  handleUpdate({ ...data, scoreConfig, scores: repaired.scores });
                }}
                onClearScoresAndConfig={() =>
                  !session.readOnly && handleUpdate({ ...data, scores: {}, scoreConfig: undefined })
                }
              />
            ))}
            {activeTab === "attributes1_4" && (data.primaryYear ? <PrimaryAssessmentForm kind="1-4" data={data} readOnly={session.readOnly} onChange={handleUpdate} /> : (
              <AttributesForm
                students={data.students}
                data={data.attributes}
                generalInfo={data.generalInfo}
                readOnly={session.readOnly}
                onChange={(attributes) =>
                  !session.readOnly && handleUpdate({ ...data, attributes })
                }
              />
            ))}
            {activeTab === "attributes5_8" && (data.primaryYear ? <PrimaryAssessmentForm kind="5-8" data={data} readOnly={session.readOnly} onChange={handleUpdate} /> : (
              <Attributes5_8Form
                students={data.students}
                data={data.attributes}
                generalInfo={data.generalInfo}
                readOnly={session.readOnly}
                onChange={(attributes) =>
                  !session.readOnly && handleUpdate({ ...data, attributes })
                }
              />
            ))}
            {activeTab === "analytical" && (data.primaryYear ? <PrimaryAssessmentForm kind="analytical" data={data} readOnly={session.readOnly} onChange={handleUpdate} /> : (
              <AnalyticalForm
                students={data.students}
                data={data.analytical}
                generalInfo={data.generalInfo}
                readOnly={session.readOnly}
                onChange={(analytical) =>
                  !session.readOnly && handleUpdate({ ...data, analytical })
                }
              />
            ))}
            {activeTab === "indicators" && (
              <IndicatorsForm
                data={data.indicators}
                scoreConfig={primaryCombinedConfig(data)}
                generalInfo={data.generalInfo}
                readOnly={session.readOnly}
                onChange={(indicators) =>
                  !session.readOnly && handleUpdate({ ...data, indicators })
                }
              />
            )}
            {activeTab === "instructions1" && <Instructions1Form />}
            {activeTab === "instructions2" && <Instructions2Form />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};


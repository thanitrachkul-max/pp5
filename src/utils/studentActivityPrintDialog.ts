import type { ActivityApprovalStatus, StudentActivityData } from "../lib/studentActivities";

export interface StudentActivityPrintPayload {
  data: StudentActivityData;
  approvalStatus?: ActivityApprovalStatus | null;
}

interface OpenStudentActivityPrintDialogOptions extends StudentActivityPrintPayload {
  id: string;
  targetWindow?: Window | null;
}

export const STUDENT_ACTIVITY_PRINT_WINDOW_KIND = "activity-print-payload";
export const STUDENT_ACTIVITY_PRINT_STORAGE_PREFIX = "activity-print-payload";
/** ตัวแปรที่ระบบสร้าง PDF ฝังข้อมูลไว้ก่อนเปิดหน้าพิมพ์ */
export const STUDENT_ACTIVITY_PRINT_PAYLOAD_GLOBAL = "__ACTIVITY_PRINT_PAYLOAD__";

function createPrintId(id: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
  return `${id || "activities"}-${suffix}`;
}

function writeWindowNamePayload(targetWindow: Window | null | undefined, printId: string, serializedPayload: string) {
  if (!targetWindow) return false;
  try {
    targetWindow.name = JSON.stringify({
      kind: STUDENT_ACTIVITY_PRINT_WINDOW_KIND,
      printId,
      payload: serializedPayload,
    });
    return true;
  } catch {
    return false;
  }
}

/** เปิดแท็บพิมพ์ทั้งเล่ม (ใช้ข้อมูลในหน้าบันทึกขณะนั้น) แล้วเรียกหน้าต่างพิมพ์ของเบราว์เซอร์ */
export function openStudentActivityPrintDialog({ id, data, approvalStatus, targetWindow }: OpenStudentActivityPrintDialogOptions) {
  const printId = createPrintId(id);
  const storageKey = `${STUDENT_ACTIVITY_PRINT_STORAGE_PREFIX}:${printId}`;
  const serializedPayload = JSON.stringify({ data, approvalStatus } satisfies StudentActivityPrintPayload);
  const wroteWindowName = writeWindowNamePayload(targetWindow, printId, serializedPayload);
  let wroteLocalStorage = false;

  try {
    window.localStorage.setItem(storageKey, serializedPayload);
    wroteLocalStorage = true;
  } catch {
    if (!wroteWindowName) {
      throw new Error("ไม่สามารถเตรียมข้อมูลสำหรับหน้าพิมพ์ได้ กรุณาลองใหม่อีกครั้ง");
    }
  }

  try {
    targetWindow?.sessionStorage.setItem(storageKey, serializedPayload);
  } catch {
    // localStorage above is shared by same-origin print tabs and remains the primary handoff.
  }

  const printUrl = `/print/activities/${encodeURIComponent(printId)}?page=all&autoPrint=1`;
  const printWindow = targetWindow ?? window.open(printUrl, "_blank");
  if (!printWindow) {
    if (wroteLocalStorage) window.localStorage.removeItem(storageKey);
    throw new Error("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต Pop-up แล้วลองอีกครั้ง");
  }
  if (targetWindow) targetWindow.location.replace(printUrl);

  window.setTimeout(() => {
    if (wroteLocalStorage) window.localStorage.removeItem(storageKey);
  }, 10 * 60 * 1000);
}

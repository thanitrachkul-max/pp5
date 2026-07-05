import type { AppData, GradebookApprovalStatus } from "../types";

interface Pap5PrintPayload {
  data: AppData;
  approvalStatus?: GradebookApprovalStatus | null;
}

interface OpenPap5PrintDialogOptions extends Pap5PrintPayload {
  id: string;
  targetWindow?: Window | null;
}

const WINDOW_NAME_PAYLOAD_KIND = "pap5-print-payload";

function createPrintId(id: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now());

  return `${id || "pap5"}-${suffix}`;
}

function writeWindowNamePayload(
  targetWindow: Window | null | undefined,
  printId: string,
  serializedPayload: string,
) {
  if (!targetWindow) return false;

  try {
    targetWindow.name = JSON.stringify({
      kind: WINDOW_NAME_PAYLOAD_KIND,
      printId,
      payload: serializedPayload,
    });
    return true;
  } catch {
    return false;
  }
}

export function openPap5PrintDialog({
  id,
  data,
  approvalStatus,
  targetWindow,
}: OpenPap5PrintDialogOptions) {
  const printId = createPrintId(id);
  const storageKey = `pap5-print-payload:${printId}`;
  const payload: Pap5PrintPayload = { data, approvalStatus };
  const serializedPayload = JSON.stringify(payload);
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

  const printUrl = `/print/pap5/${encodeURIComponent(printId)}?page=all&autoPrint=1`;
  const printWindow = targetWindow ?? window.open(printUrl, "_blank");

  if (!printWindow) {
    if (wroteLocalStorage) window.localStorage.removeItem(storageKey);
    throw new Error("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต Pop-up แล้วลองอีกครั้ง");
  }

  if (targetWindow) {
    targetWindow.location.replace(printUrl);
  }

  window.setTimeout(() => {
    if (wroteLocalStorage) window.localStorage.removeItem(storageKey);
  }, 10 * 60 * 1000);
}

import { Pap5SingleOriginalPrintPage } from "../../components/PrintAllPap5Document";
import type { AppData, GradebookApprovalStatus } from "../../types";

interface Pap5PrintPayload {
  data: AppData;
  approvalStatus?: GradebookApprovalStatus | null;
}

function getPrintIdFromPath() {
  const match = window.location.pathname.match(/^\/print\/pap5\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "current";
}

function readPayload(printId: string): Pap5PrintPayload | null {
  const injectedPayload = (window as typeof window & { __PAP5_PRINT_PAYLOAD__?: Pap5PrintPayload }).__PAP5_PRINT_PAYLOAD__;
  if (injectedPayload?.data) return injectedPayload;

  const raw = window.localStorage.getItem(`pap5-print-payload:${printId}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Pap5PrintPayload;
  } catch {
    return null;
  }
}

export function Pap5PrintRoutePage() {
  const printId = getPrintIdFromPath();
  const pageId = new URLSearchParams(window.location.search).get("page") || "cover";
  const payload = readPayload(printId);

  if (!payload?.data) {
    return (
      <main className="grid min-h-screen place-items-center bg-white p-8 text-center text-slate-700" data-pap5-ready="true">
        <div>
          <h1 className="text-xl font-bold">ไม่พบข้อมูลสำหรับพิมพ์ ปพ.5</h1>
          <p className="mt-2 text-sm">กรุณากลับไปกดปุ่มพิมพ์ / บันทึก ปพ.5 จากหน้าเอกสารอีกครั้ง</p>
        </div>
      </main>
    );
  }

  return (
    <div className="pap5-pdf-route-root" data-pap5-ready="true">
      <Pap5SingleOriginalPrintPage
        data={payload.data}
        approvalStatus={payload.approvalStatus ?? null}
        pageId={pageId}
      />
    </div>
  );
}

import { useEffect } from "react";
import {
  Pap5SingleOriginalPrintPage,
  PrintAllPap5Document,
} from "../../components/PrintAllPap5Document";
import type { AppData, GradebookApprovalStatus } from "../../types";

interface Pap5PrintPayload {
  data: AppData;
  approvalStatus?: GradebookApprovalStatus | null;
}

const WINDOW_NAME_PAYLOAD_KIND = "pap5-print-payload";

function getPrintIdFromPath() {
  const match = window.location.pathname.match(/^\/print\/pap5\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "current";
}

function readWindowNamePayload(printId: string): Pap5PrintPayload | null {
  if (!window.name) return null;

  try {
    const parsed = JSON.parse(window.name) as {
      kind?: unknown;
      printId?: unknown;
      payload?: unknown;
    };
    if (
      parsed.kind !== WINDOW_NAME_PAYLOAD_KIND ||
      parsed.printId !== printId ||
      typeof parsed.payload !== "string"
    ) {
      return null;
    }

    const payload = JSON.parse(parsed.payload) as Pap5PrintPayload;
    if (!payload?.data) return null;
    window.name = "";
    return payload;
  } catch {
    return null;
  }
}

function readPayload(printId: string): Pap5PrintPayload | null {
  const injectedPayload = (window as typeof window & { __PAP5_PRINT_PAYLOAD__?: Pap5PrintPayload }).__PAP5_PRINT_PAYLOAD__;
  if (injectedPayload?.data) return injectedPayload;

  const windowNamePayload = readWindowNamePayload(printId);
  if (windowNamePayload?.data) return windowNamePayload;

  const storageKey = `pap5-print-payload:${printId}`;
  const raw =
    window.sessionStorage.getItem(storageKey) ??
    window.localStorage.getItem(storageKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Pap5PrintPayload;
  } catch {
    return null;
  }
}

function waitForImages() {
  return Promise.all(
    Array.from(document.images)
      .filter((image) => !image.complete)
      .map((image) => new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      })),
  );
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function Pap5PrintRoutePage() {
  const printId = getPrintIdFromPath();
  const searchParams = new URLSearchParams(window.location.search);
  const pageId = searchParams.get("page") || "cover";
  const autoPrint = searchParams.get("autoPrint") === "1";
  const payload = readPayload(printId);
  const hasPayload = Boolean(payload?.data);

  useEffect(() => {
    if (!autoPrint || !hasPayload) return;

    let cancelled = false;
    const autoPrintKey = `pap5-auto-print:${printId}:${pageId}`;
    const timer = window.setTimeout(() => {
      void (async () => {
        await document.fonts?.ready.catch(() => undefined);
        await waitForImages();
        await waitForNextPaint();
        if (cancelled || window.sessionStorage.getItem(autoPrintKey)) return;
        window.sessionStorage.setItem(autoPrintKey, "1");
        window.print();
      })();
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [autoPrint, hasPayload, pageId, printId]);

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
      {pageId === "all" ? (
        <PrintAllPap5Document
          data={payload.data}
          approvalStatus={payload.approvalStatus ?? null}
        />
      ) : (
        <Pap5SingleOriginalPrintPage
          data={payload.data}
          approvalStatus={payload.approvalStatus ?? null}
          pageId={pageId}
        />
      )}
    </div>
  );
}

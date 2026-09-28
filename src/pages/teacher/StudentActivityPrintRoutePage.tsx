import { useEffect } from "react";
import {
  StudentActivityPrintDocument,
  StudentActivitySinglePrintPage,
} from "../../components/activities/StudentActivityPrintDocument";
import { normalizeActivityAssessments, type StudentActivityData } from "../../lib/studentActivities";
import {
  STUDENT_ACTIVITY_PRINT_PAYLOAD_GLOBAL,
  STUDENT_ACTIVITY_PRINT_STORAGE_PREFIX,
  STUDENT_ACTIVITY_PRINT_WINDOW_KIND,
  type StudentActivityPrintPayload,
} from "../../utils/studentActivityPrintDialog";

function getPrintIdFromPath() {
  const match = window.location.pathname.match(/^\/print\/activities\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "current";
}

function readWindowNamePayload(printId: string): StudentActivityPrintPayload | null {
  if (!window.name) return null;
  try {
    const parsed = JSON.parse(window.name) as { kind?: unknown; printId?: unknown; payload?: unknown };
    if (parsed.kind !== STUDENT_ACTIVITY_PRINT_WINDOW_KIND || parsed.printId !== printId || typeof parsed.payload !== "string") {
      return null;
    }
    const payload = JSON.parse(parsed.payload) as StudentActivityPrintPayload;
    if (!payload?.data) return null;
    window.name = "";
    return payload;
  } catch {
    return null;
  }
}

function readPayload(printId: string): StudentActivityPrintPayload | null {
  const injected = (window as unknown as Record<string, StudentActivityPrintPayload | undefined>)[
    STUDENT_ACTIVITY_PRINT_PAYLOAD_GLOBAL
  ];
  if (injected?.data) return injected;

  const fromWindowName = readWindowNamePayload(printId);
  if (fromWindowName?.data) return fromWindowName;

  const storageKey = `${STUDENT_ACTIVITY_PRINT_STORAGE_PREFIX}:${printId}`;
  try {
    const raw = window.sessionStorage.getItem(storageKey) ?? window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as StudentActivityPrintPayload) : null;
  } catch {
    return null;
  }
}

/** ข้อมูลที่ส่งมาพิมพ์อาจมาจากเล่มรุ่นก่อน จึงจัดรูปแบบผลการประเมินก่อนแสดง */
function preparePrintData(data: StudentActivityData): StudentActivityData | null {
  if (!data?.generalInfo || !Array.isArray(data.students)) return null;
  return {
    ...data,
    attendance: data.attendance ?? {},
    assessments: normalizeActivityAssessments(data.assessments),
  };
}

function waitForImages() {
  return Promise.all(
    Array.from(document.images)
      .filter((image) => !image.complete)
      .map(
        (image) =>
          new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          }),
      ),
  );
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function StudentActivityPrintRoutePage() {
  const printId = getPrintIdFromPath();
  const searchParams = new URLSearchParams(window.location.search);
  const pageId = searchParams.get("page") || "cover";
  const autoPrint = searchParams.get("autoPrint") === "1";
  const payload = readPayload(printId);
  const data = payload ? preparePrintData(payload.data) : null;
  const hasData = Boolean(data);

  useEffect(() => {
    if (!autoPrint || !hasData) return;
    let cancelled = false;
    const autoPrintKey = `activity-auto-print:${printId}:${pageId}`;
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
  }, [autoPrint, hasData, pageId, printId]);

  if (!data) {
    return (
      <main className="grid min-h-screen place-items-center bg-white p-8 text-center text-slate-700" data-pap5-ready="true">
        <div>
          <h1 className="text-xl font-bold">ไม่พบข้อมูลสำหรับพิมพ์บันทึกกิจกรรมพัฒนาผู้เรียน</h1>
          <p className="mt-2 text-sm">กรุณากลับไปกดปุ่มพิมพ์ / บันทึก PDF จากหน้าบันทึกกิจกรรมพัฒนาผู้เรียนอีกครั้ง</p>
        </div>
      </main>
    );
  }

  return (
    <div className="pap5-pdf-route-root" data-pap5-ready="true">
      {pageId === "all" ? (
        <StudentActivityPrintDocument data={data} approvalStatus={payload?.approvalStatus ?? null} />
      ) : (
        <StudentActivitySinglePrintPage data={data} approvalStatus={payload?.approvalStatus ?? null} pageId={pageId} />
      )}
    </div>
  );
}

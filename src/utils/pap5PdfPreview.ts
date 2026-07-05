import type { AppData, GradebookApprovalStatus } from "../types";

function writePreviewStatus(
  previewWindow: Window | null,
  title: string,
  message: string,
  variant: "loading" | "error" = "loading",
) {
  if (!previewWindow) return;

  try {
    const document = previewWindow.document;
    document.open();
    document.write(`<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title></title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f8fafc;
        color: #0f172a;
        font-family: "Sarabun", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(520px, calc(100vw - 32px));
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #ffffff;
        padding: 28px;
        text-align: center;
        box-shadow: 0 16px 40px -28px rgba(15, 23, 42, 0.45);
      }
      .spinner {
        width: 32px;
        height: 32px;
        margin: 0 auto 16px;
        border: 3px solid #dbeafe;
        border-top-color: #2563eb;
        border-radius: 999px;
        animation: spin 0.8s linear infinite;
      }
      .error-icon {
        width: 40px;
        height: 40px;
        margin: 0 auto 16px;
        border-radius: 999px;
        background: #fee2e2;
        color: #dc2626;
        display: grid;
        place-items: center;
        font-size: 24px;
        font-weight: 800;
      }
      h1 {
        margin: 0;
        font-size: 20px;
        line-height: 1.35;
      }
      p {
        margin: 10px 0 0;
        color: #475569;
        font-size: 14px;
        line-height: 1.7;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
  </head>
  <body>
    <main>
      <div id="status-icon"></div>
      <h1 id="status-title"></h1>
      <p id="status-message"></p>
    </main>
  </body>
</html>`);
    document.close();

    document.title = title;
    const icon = document.getElementById("status-icon");
    if (icon) {
      icon.className = variant === "error" ? "error-icon" : "spinner";
      icon.textContent = variant === "error" ? "!" : "";
    }
    const titleNode = document.getElementById("status-title");
    if (titleNode) titleNode.textContent = title;
    const messageNode = document.getElementById("status-message");
    if (messageNode) messageNode.textContent = message;
  } catch {
    // Best effort: the calling page still receives and displays the same error.
  }
}

function readErrorMessage(text: string) {
  try {
    const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error;
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message;
  } catch {
    // Fall back to a compact text-only snippet below.
  }

  const compact = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return compact ? compact.slice(0, 300) : "";
}

export async function openPap5PdfPreview({
  id,
  data,
  approvalStatus,
}: {
  id: string;
  data: AppData;
  approvalStatus?: GradebookApprovalStatus | null;
}) {
  const previewWindow = window.open("about:blank", "_blank");
  writePreviewStatus(
    previewWindow,
    "กำลังสร้างไฟล์ ปพ.5",
    "ระบบกำลังจัดหน้าเอกสารและสร้าง PDF กรุณารอสักครู่",
  );

  const response = await fetch("/api/export/pap5/preview", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ id, data, approvalStatus }),
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.toLowerCase().includes("application/pdf")) {
    const errorText = await response.text().catch(() => "");
    const responseMessage = readErrorMessage(errorText);
    const message = response.ok
      ? `ระบบสร้าง PDF ตอบกลับเป็น ${contentType || "unknown"} ไม่ใช่ application/pdf`
      : responseMessage || "ไม่สามารถสร้างไฟล์ PDF ได้";

    writePreviewStatus(previewWindow, "สร้างไฟล์ ปพ.5 ไม่สำเร็จ", message, "error");
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  if (previewWindow) {
    previewWindow.location.href = url;
  } else {
    window.open(url, "_blank");
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

import { savePap5PdfBlob } from "./pap5PdfPreview";
import type { ActivityApprovalStatus, StudentActivityData } from "../lib/studentActivities";

const DEFAULT_FILE_NAME = "แบบบันทึกกิจกรรมพัฒนาผู้เรียน.pdf";

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

function readDownloadFileName(response: Response) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  return DEFAULT_FILE_NAME;
}

/** สร้าง PDF ทั้งเล่มจากหน้าพิมพ์เดียวกับปุ่มพิมพ์ แล้วบันทึกลงเครื่อง */
export async function createStudentActivityPdfFile(request: {
  id: string;
  data: StudentActivityData;
  approvalStatus?: ActivityApprovalStatus | null;
}) {
  let response: Response;
  try {
    response = await fetch("/api/student-activity-pdf", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new Error("ไม่สามารถเชื่อมต่อระบบสร้าง PDF ได้ กรุณาลองใหม่อีกครั้ง");
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.toLowerCase().includes("application/pdf")) {
    const message = readErrorMessage(await response.text().catch(() => ""));
    throw new Error(
      response.ok
        ? `ระบบสร้าง PDF ตอบกลับเป็น ${contentType || "unknown"} ไม่ใช่ application/pdf`
        : message || "ไม่สามารถสร้างไฟล์ PDF ได้",
    );
  }

  const blob = new Blob([await response.arrayBuffer()], { type: "application/pdf" });
  return { blob, fileName: readDownloadFileName(response) };
}

export async function downloadStudentActivityPdf(request: Parameters<typeof createStudentActivityPdfFile>[0]) {
  const { blob, fileName } = await createStudentActivityPdfFile(request);
  savePap5PdfBlob(blob, fileName);
}

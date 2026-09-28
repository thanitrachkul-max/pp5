import { generateStudentActivityPdf, type StudentActivityPdfPayload } from "./studentActivityPdfGenerator.js";

export interface StudentActivityPdfHttpResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer | string;
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}

function getFileName(payload: StudentActivityPdfPayload) {
  const gradeLevel = (payload.data.generalInfo.gradeLevel || "ระดับชั้น").replace(/\//g, "-");
  const academicYear = payload.data.generalInfo.academicYear || "";
  return (
    sanitizeFileName(`แบบบันทึกกิจกรรมพัฒนาผู้เรียน ${gradeLevel} ปีการศึกษา ${academicYear}.pdf`) ||
    "แบบบันทึกกิจกรรมพัฒนาผู้เรียน.pdf"
  );
}

export function parseStudentActivityPdfRequestPayload(rawBody: string, contentType = ""): StudentActivityPdfPayload {
  const body = rawBody.replace(/^﻿/, "");
  if (contentType.toLowerCase().includes("application/x-www-form-urlencoded")) {
    const formPayload = new URLSearchParams(body).get("payload");
    if (formPayload) return JSON.parse(formPayload) as StudentActivityPdfPayload;
  }
  return JSON.parse(body || "{}") as StudentActivityPdfPayload;
}

export async function createStudentActivityPdfHttpResult({
  payload,
  origin,
  headers,
}: {
  payload: StudentActivityPdfPayload;
  origin: string;
  headers?: Record<string, string>;
}): Promise<StudentActivityPdfHttpResult> {
  if (!payload?.data?.generalInfo || !Array.isArray(payload.data.students)) {
    return {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Missing student activity payload" }),
    };
  }

  const pdf = await generateStudentActivityPdf(payload, { origin, headers });
  const fileName = encodeURIComponent(getFileName(payload));

  return {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-length": String(pdf.byteLength),
      "content-disposition": `attachment; filename*=UTF-8''${fileName}`,
      "cache-control": "no-store",
    },
    body: pdf,
  };
}

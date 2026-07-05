import { generatePap5Pdf, type Pap5PdfPayload } from "./pap5PdfGenerator.js";

export interface Pap5PdfHttpResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer | string;
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}

function getFileName(payload: Pap5PdfPayload) {
  const subjectName = payload.data.generalInfo.subjectName || "รายวิชา";
  const gradeLevel = payload.data.generalInfo.gradeLevel || "ระดับชั้น";
  return sanitizeFileName(`แบบปพ.5 ${subjectName} ${gradeLevel}.pdf`) || "แบบปพ.5.pdf";
}

export async function createPap5PdfHttpResult({
  payload,
  origin,
  headers,
}: {
  payload: Pap5PdfPayload;
  origin: string;
  headers?: Record<string, string>;
}): Promise<Pap5PdfHttpResult> {
  if (!payload?.data?.generalInfo) {
    return {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Missing Pap5 payload" }),
    };
  }

  const pdf = await generatePap5Pdf(payload, { origin, headers });
  const fileName = encodeURIComponent(getFileName(payload));

  return {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-length": String(pdf.byteLength),
      "content-disposition": `inline; filename*=UTF-8''${fileName}`,
      "cache-control": "no-store",
    },
    body: pdf,
  };
}

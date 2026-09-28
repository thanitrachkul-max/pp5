import {
  generatePrintRoutePdf,
  safeActivityPrintId,
  type Pap5PdfGenerateOptions,
  type PrintRouteTarget,
} from "./pap5PdfGenerator.js";
import { getStudentActivityPrintPageSpecs } from "../utils/studentActivityPrintLayout.js";
import type { ActivityApprovalStatus, StudentActivityData } from "../lib/studentActivities";

export interface StudentActivityPdfPayload {
  id?: string;
  data: StudentActivityData;
  approvalStatus?: ActivityApprovalStatus | null;
}

/** ต้องตรงกับค่าที่หน้า /print/activities อ่าน (src/utils/studentActivityPrintDialog.ts) */
const STUDENT_ACTIVITY_PRINT_ROUTE: PrintRouteTarget = {
  routePath: "/print/activities",
  payloadGlobal: "__ACTIVITY_PRINT_PAYLOAD__",
  storageKeyPrefix: "activity-print-payload",
};

export async function generateStudentActivityPdf(payload: StudentActivityPdfPayload, options: Pap5PdfGenerateOptions) {
  return generatePrintRoutePdf({
    payload,
    printId: safeActivityPrintId(payload.id),
    specs: getStudentActivityPrintPageSpecs(payload.data),
    target: STUDENT_ACTIVITY_PRINT_ROUTE,
    options,
  });
}

import {
  ACTIVITY_KINDS,
  activityAssessmentDefinitions,
  activityStudySegments,
  definitionItemKeys,
  type ActivityAssessmentDefinition,
  type ActivityDefinitions,
  type ActivityKind,
  type StudentActivityData,
} from "../lib/studentActivities.js";

export type ActivityPrintOrientation = "portrait" | "landscape";

export interface ActivityPrintPageSpec {
  id: string;
  orientation: ActivityPrintOrientation;
  label: string;
}

export interface ActivityAttendancePrintRange {
  id: string;
  label: string;
  months: number[];
  fillToWeeks?: number;
}

export interface ActivityStudentPrintRange {
  id: string;
  studentStartIndex: number;
  studentEndIndex: number;
  pageNumber: number;
  totalPages: number;
}

export interface ActivityAssessmentPrintRange extends ActivityStudentPrintRange {
  kind: ActivityKind;
  label: string;
  itemStartIndex: number;
  itemEndIndex: number;
}

/** เวลาเรียนทั้งปีพิมพ์เป็นหน้าละ 2 เดือน (ไม่เกิน 9 สัปดาห์) เหมือนหน้าเวลาเรียน ปพ.5 */
export const ACTIVITY_ATTENDANCE_PRINT_RANGES: ActivityAttendancePrintRange[] = [
  { id: "attendance-1", label: "เวลาเรียน พฤษภาคม - มิถุนายน", months: [5, 6] },
  { id: "attendance-2", label: "เวลาเรียน กรกฎาคม - สิงหาคม", months: [7, 8] },
  { id: "attendance-3", label: "เวลาเรียน กันยายน - ตุลาคม", months: [9, 10], fillToWeeks: 9 },
  { id: "attendance-4", label: "เวลาเรียน พฤศจิกายน - ธันวาคม", months: [11, 12] },
  { id: "attendance-5", label: "เวลาเรียน มกราคม - กุมภาพันธ์", months: [1, 2] },
  { id: "attendance-6", label: "เวลาเรียน มีนาคม", months: [3, 4], fillToWeeks: 9 },
];

/** นักเรียนต่อหน้าในตารางการประเมิน (เท่าหน้าคุณลักษณะของ ปพ.5) */
export const ACTIVITY_ASSESSMENT_STUDENTS_PER_PAGE = 12;
/** นักเรียนต่อหน้าในตารางสรุปผลและสรุปเวลาเรียน */
export const ACTIVITY_SUMMARY_STUDENTS_PER_PAGE = 15;
/** รายการประเมินต่อหน้า (ช่อง ผ/มผ ยังอ่านได้บน A4 แนวนอน) */
export const ACTIVITY_ITEMS_PER_PAGE = 15;

export const ACTIVITY_INSTRUCTION_PAGES = [
  { id: "instructions-1", label: "คำชี้แจง 1" },
  { id: "instructions-2", label: "คำชี้แจง 2" },
  { id: "instructions-3", label: "คำชี้แจง 3" },
  { id: "instructions-4", label: "คำชี้แจง 4" },
] as const;

function studentRanges(studentCount: number, perPage: number, idPrefix: string): ActivityStudentPrintRange[] {
  const totalPages = Math.max(1, Math.ceil(studentCount / perPage));
  return Array.from({ length: totalPages }, (_, index) => ({
    id: index === 0 ? idPrefix : `${idPrefix}-${index + 1}`,
    studentStartIndex: index * perPage,
    studentEndIndex: Math.min(studentCount, (index + 1) * perPage),
    pageNumber: index + 1,
    totalPages,
  }));
}

/** แบ่งรายการประเมินให้แต่ละหน้ามีจำนวนใกล้เคียงกัน เช่น 31 รายการ → 11, 10, 10 */
export function splitActivityItems(itemCount: number, perPage = ACTIVITY_ITEMS_PER_PAGE): Array<[number, number]> {
  const pages = Math.max(1, Math.ceil(itemCount / perPage));
  const base = Math.floor(itemCount / pages);
  const extra = itemCount % pages;
  const ranges: Array<[number, number]> = [];
  let start = 0;
  for (let index = 0; index < pages; index += 1) {
    const size = base + (index < extra ? 1 : 0);
    ranges.push([start, start + size]);
    start += size;
  }
  return ranges;
}

export function getActivityAssessmentPrintRanges(
  data: StudentActivityData,
  definition: ActivityAssessmentDefinition,
): ActivityAssessmentPrintRange[] {
  const itemRanges = splitActivityItems(definitionItemKeys(definition).length);
  const students = studentRanges(data.students.length, ACTIVITY_ASSESSMENT_STUDENTS_PER_PAGE, "students");
  const totalPages = itemRanges.length * students.length;
  const ranges: ActivityAssessmentPrintRange[] = [];
  for (const [itemStartIndex, itemEndIndex] of itemRanges) {
    for (const studentRange of students) {
      const pageNumber = ranges.length + 1;
      ranges.push({
        ...studentRange,
        id: pageNumber === 1 ? definition.kind : `${definition.kind}-${pageNumber}`,
        kind: definition.kind,
        label: totalPages === 1 ? definition.shortTitle : `${definition.shortTitle} ${pageNumber}/${totalPages}`,
        itemStartIndex,
        itemEndIndex,
        pageNumber,
        totalPages,
      });
    }
  }
  return ranges;
}

export function getActivitySummaryPrintRanges(data: StudentActivityData): ActivityStudentPrintRange[] {
  return studentRanges(data.students.length, ACTIVITY_SUMMARY_STUDENTS_PER_PAGE, "summary");
}

export function getActivityAttendanceSummaryPrintRanges(data: StudentActivityData): ActivityStudentPrintRange[] {
  return studentRanges(data.students.length, ACTIVITY_SUMMARY_STUDENTS_PER_PAGE, "attendance-summary");
}

/** เดือนที่อยู่ในช่วงเรียนทั้งปี (ไม่รวมเดือนที่ปิดภาคเรียนทั้งเดือน) เรียงตามปีการศึกษา */
export function getActivityStudyMonths(data: StudentActivityData): number[] {
  const months: number[] = [];
  for (const segment of activityStudySegments(data.generalInfo)) {
    const [startYear, startMonth] = segment.startDate.split("-").map(Number);
    const [endYear, endMonth] = segment.endDate.split("-").map(Number);
    for (let year = startYear, month = startMonth; year < endYear || (year === endYear && month <= endMonth); ) {
      if (!months.includes(month)) months.push(month);
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return months.length ? months : [5, 6, 7, 8, 9, 11, 12, 1, 2, 3];
}

export function getStudentActivityPrintPageSpecs(
  data: StudentActivityData,
  definitions: ActivityDefinitions = activityAssessmentDefinitions(data.generalInfo),
): ActivityPrintPageSpec[] {
  const landscape = (id: string, label: string): ActivityPrintPageSpec => ({ id, orientation: "landscape", label });
  const attendanceSummary = getActivityAttendanceSummaryPrintRanges(data);
  const summary = getActivitySummaryPrintRanges(data);

  return [
    { id: "cover", orientation: "portrait", label: "ปก" },
    ...ACTIVITY_ATTENDANCE_PRINT_RANGES.map((range) => landscape(range.id, range.label)),
    ...attendanceSummary.map((range) =>
      landscape(range.id, range.totalPages === 1 ? "สรุปเวลาเรียน" : `สรุปเวลาเรียน ${range.pageNumber}/${range.totalPages}`),
    ),
    ...ACTIVITY_KINDS.flatMap((kind) =>
      getActivityAssessmentPrintRanges(data, definitions[kind]).map((range) => landscape(range.id, range.label)),
    ),
    ...summary.map((range) =>
      landscape(
        range.id,
        range.totalPages === 1
          ? "สรุปผลการประเมินกิจกรรมพัฒนาผู้เรียน"
          : `สรุปผลการประเมินกิจกรรมพัฒนาผู้เรียน ${range.pageNumber}/${range.totalPages}`,
      ),
    ),
    ...ACTIVITY_INSTRUCTION_PAGES.map((page) => ({ id: page.id, orientation: "portrait" as const, label: page.label })),
  ];
}

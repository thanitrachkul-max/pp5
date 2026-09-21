import { isPrimaryGrade } from "../lib/primaryYear.js";
import type { AppData } from "../types";

export type Pap5PrintOrientation = "portrait" | "landscape";

export interface Pap5PrintPageSpec {
  id: string;
  orientation: Pap5PrintOrientation;
  label: string;
}

export interface AttendancePrintDate {
  key: string;
  month: number;
  day: number;
  monthLabel: string;
  hourText: string;
}

export interface AttendancePrintChunk {
  id: string;
  title: string;
  dates: AttendancePrintDate[];
}

export interface AttendancePrintMonthRange {
  id: string;
  label: string;
  months: number[];
  fillToWeeks?: number;
}

export interface ScoreSummaryPrintRange {
  id: string;
  label: string;
  startUnitIndex: number;
  endUnitIndex: number;
  pageNumber: number;
  totalPages: number;
  studentStartIndex: number;
  studentEndIndex: number;
  studentPageNumber: number;
  totalStudentPages: number;
  summaryPageNumber: number;
  totalSummaryPages: number;
}

export interface ScoreDetailPrintRange {
  id: string;
  label: string;
  startUnitIndex: number;
  endUnitIndex: number;
  pageNumber: number;
  totalPages: number;
}

export interface StudentEvaluationPrintRange {
  id: string;
  label: string;
  studentStartIndex: number;
  studentEndIndex: number;
  pageNumber: number;
  totalPages: number;
}

const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

const SEMESTER_ONE_CHUNK_MONTHS = [
  [[5, 6, 7, 8, 9]],
  [[5, 6, 7], [8, 9]],
  [[5, 6], [7, 8], [9]],
  [[5], [6], [7], [8, 9]],
];

const SEMESTER_TWO_CHUNK_MONTHS = [
  [[10, 11, 12, 1, 2, 3]],
  [[10, 11, 12], [1, 2, 3]],
  [[10, 11], [12, 1], [2, 3]],
  [[10], [11, 12], [1, 2], [3]],
];

const SEMESTER_ONE_PRINT_MONTH_RANGES: AttendancePrintMonthRange[] = [
  { id: "attendance-1", label: "เวลาเรียน พฤษภาคม - มิถุนายน", months: [5, 6] },
  { id: "attendance-2", label: "เวลาเรียน กรกฎาคม - สิงหาคม", months: [7, 8] },
  { id: "attendance-3", label: "เวลาเรียน กันยายน", months: [9], fillToWeeks: 9 },
];

const SEMESTER_TWO_PRINT_MONTH_RANGES: AttendancePrintMonthRange[] = [
  { id: "attendance-1", label: "เวลาเรียน ตุลาคม - พฤศจิกายน", months: [10, 11] },
  { id: "attendance-2", label: "เวลาเรียน ธันวาคม - มกราคม", months: [12, 1] },
  { id: "attendance-3", label: "เวลาเรียน กุมภาพันธ์ - มีนาคม", months: [2, 3], fillToWeeks: 9 },
];

const SCORE_DETAIL_UNITS_PER_PAGE = 3;
const SCORE_SUMMARY_SINGLE_PAGE_UNIT_LIMIT = 8;
const SCORE_SUMMARY_FIRST_PAGE_UNITS_WHEN_SPLIT = 5;
const SCORE_SUMMARY_FOLLOWING_PAGE_UNITS = 3;
const EVALUATION_STUDENTS_PER_PAGE = 12;
const SCORE_SUMMARY_STUDENTS_PER_PAGE = EVALUATION_STUDENTS_PER_PAGE;

function numberFromText(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getHoursFromText(value: string) {
  if (!value.trim()) return 0;
  if (value.includes("-")) {
    const [start, end] = value.split("-").map(Number);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      return Math.max(0, end - start + 1);
    }
  }
  return 1;
}

function getDateSortValue(month: number, day: number, semester: string) {
  const monthOrder = semester === "2" && month <= 3 ? month + 12 : month;
  return monthOrder * 100 + day;
}

function hasAttendanceRecord(data: AppData, dateKey: string) {
  return data.students.some((student) => {
    const value = data.attendance?.records?.[student.id]?.[dateKey];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
}

function getTotalStudyHours(data: AppData) {
  const fromSemester = numberFromText(data.generalInfo.hoursPerSemester);
  if (fromSemester > 0) return fromSemester;

  const fromWeek = numberFromText(data.generalInfo.totalHours || data.generalInfo.hoursPerWeek);
  if (fromWeek > 0) return fromWeek * 20;

  return 20;
}

function fallbackSplitDates(
  dates: AttendancePrintDate[],
  chunkCount: number,
): AttendancePrintChunk[] {
  if (dates.length === 0) return [{ id: "attendance-1", title: "เวลาเรียน", dates }];

  const size = Math.ceil(dates.length / chunkCount);
  return Array.from({ length: chunkCount })
    .map((_, index) => dates.slice(index * size, (index + 1) * size))
    .filter((chunk) => chunk.length > 0)
    .map((chunk, index) => ({
      id: `attendance-${index + 1}`,
      title: buildAttendanceChunkTitle(chunk),
      dates: chunk,
    }));
}

function buildAttendanceChunkTitle(dates: AttendancePrintDate[]) {
  const months = Array.from(new Set(dates.map((date) => date.monthLabel)));
  return months.length ? `เวลาเรียน (${months.join(" - ")})` : "เวลาเรียน";
}

export function getAttendancePrintDates(data: AppData): AttendancePrintDate[] {
  const hoursMap = data.attendance?.hoursMap ?? {};
  const keys = new Set<string>(Object.keys(hoursMap));

  Object.values(data.attendance?.records ?? {}).forEach((studentRecords) => {
    Object.keys(studentRecords ?? {}).forEach((key) => keys.add(key));
  });

  return Array.from(keys)
    .map((key) => {
      const [monthText, dayText] = key.split("-");
      const month = Number(monthText);
      const day = Number(dayText);
      const hourText = String(hoursMap[key] ?? "").trim();
      if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
      if (!hourText && !hasAttendanceRecord(data, key)) return null;

      return {
        key,
        month,
        day,
        monthLabel: THAI_MONTHS_SHORT[month - 1] ?? monthText,
        hourText,
      } satisfies AttendancePrintDate;
    })
    .filter((date): date is AttendancePrintDate => Boolean(date))
    .sort((a, b) => {
      const semester = data.generalInfo.semester || "1";
      return getDateSortValue(a.month, a.day, semester) - getDateSortValue(b.month, b.day, semester);
    });
}

export function getAttendancePrintChunks(data: AppData): AttendancePrintChunk[] {
  const dates = getAttendancePrintDates(data);
  const totalHours = getTotalStudyHours(data);
  const chunkCount = Math.max(1, Math.min(4, Math.ceil(totalHours / 20)));
  const monthPlans = data.generalInfo.semester === "2"
    ? SEMESTER_TWO_CHUNK_MONTHS
    : SEMESTER_ONE_CHUNK_MONTHS;
  const plan = monthPlans[chunkCount - 1];

  if (!plan) return fallbackSplitDates(dates, chunkCount);

  const chunks = plan
    .map((months, index) => {
      const chunkDates = dates.filter((date) => months.includes(date.month));
      return {
        id: `attendance-${index + 1}`,
        title: buildAttendanceChunkTitle(chunkDates),
        dates: chunkDates,
      };
    })
    .filter((chunk) => chunk.dates.length > 0);

  return chunks.length ? chunks : fallbackSplitDates(dates, chunkCount);
}

export function getAttendancePrintMonthRanges(
  generalInfo: AppData["generalInfo"],
): AttendancePrintMonthRange[] {
  return generalInfo.semester === "2"
    ? SEMESTER_TWO_PRINT_MONTH_RANGES
    : SEMESTER_ONE_PRINT_MONTH_RANGES;
}

export function getScoreDetailPrintRanges(data: AppData): ScoreDetailPrintRange[] {
  if (isPrimaryGrade(data.generalInfo.gradeLevel)) return [];
  const units = data.scoreConfig?.units ?? [];
  const totalPages = Math.max(1, Math.ceil(Math.max(1, units.length) / SCORE_DETAIL_UNITS_PER_PAGE));

  return Array.from({ length: totalPages }, (_, pageIndex) => {
    const pageNumber = pageIndex + 1;
    const startUnitIndex = pageIndex * SCORE_DETAIL_UNITS_PER_PAGE;
    const endUnitIndex = Math.min(units.length, startUnitIndex + SCORE_DETAIL_UNITS_PER_PAGE);

    return {
      id: pageIndex === 0 ? "scores" : `scores-${pageNumber}`,
      label: totalPages === 1 ? "คะแนนตามตัวชี้วัด" : `คะแนนตามตัวชี้วัด ${pageNumber}/${totalPages}`,
      startUnitIndex,
      endUnitIndex,
      pageNumber,
      totalPages,
    };
  });
}

function getScoreSummaryUnitRanges(unitCount: number) {
  if (unitCount <= SCORE_SUMMARY_SINGLE_PAGE_UNIT_LIMIT) {
    return [{ startUnitIndex: 0, endUnitIndex: unitCount }];
  }

  const ranges = [{
    startUnitIndex: 0,
    endUnitIndex: SCORE_SUMMARY_FIRST_PAGE_UNITS_WHEN_SPLIT,
  }];

  for (
    let startUnitIndex = SCORE_SUMMARY_FIRST_PAGE_UNITS_WHEN_SPLIT;
    startUnitIndex < unitCount;
    startUnitIndex += SCORE_SUMMARY_FOLLOWING_PAGE_UNITS
  ) {
    ranges.push({
      startUnitIndex,
      endUnitIndex: Math.min(unitCount, startUnitIndex + SCORE_SUMMARY_FOLLOWING_PAGE_UNITS),
    });
  }

  return ranges;
}

export function getScoreSummaryPrintRanges(data: AppData): ScoreSummaryPrintRange[] {
  if (isPrimaryGrade(data.generalInfo.gradeLevel)) return [];
  const units = data.scoreConfig?.units ?? [];
  if (units.length === 0) return [];

  const unitRanges = getScoreSummaryUnitRanges(units.length);
  const totalUnitPages = unitRanges.length;
  const totalStudentPages = Math.max(
    1,
    Math.ceil(data.students.length / SCORE_SUMMARY_STUDENTS_PER_PAGE),
  );
  const totalSummaryPages = totalUnitPages * totalStudentPages;
  const ranges: ScoreSummaryPrintRange[] = [];

  for (let unitPageIndex = 0; unitPageIndex < totalUnitPages; unitPageIndex += 1) {
    const { startUnitIndex, endUnitIndex } = unitRanges[unitPageIndex];

    for (let studentPageIndex = 0; studentPageIndex < totalStudentPages; studentPageIndex += 1) {
      const summaryPageNumber = ranges.length + 1;
      const studentStartIndex = studentPageIndex * SCORE_SUMMARY_STUDENTS_PER_PAGE;
      const studentEndIndex = Math.min(
        data.students.length,
        studentStartIndex + SCORE_SUMMARY_STUDENTS_PER_PAGE,
      );
      const unitPageNumber = unitPageIndex + 1;
      const studentPageNumber = studentPageIndex + 1;
      const id =
        totalStudentPages === 1 || studentPageIndex === 0
          ? `score-summary-${unitPageNumber}`
          : `score-summary-${unitPageNumber}-students-${studentPageNumber}`;

      ranges.push({
        id,
        label:
          totalSummaryPages === 1
            ? "สรุปผลคะแนน"
            : `สรุปผลคะแนน ${summaryPageNumber}/${totalSummaryPages}`,
        startUnitIndex,
        endUnitIndex,
        pageNumber: unitPageNumber,
        totalPages: totalUnitPages,
        studentStartIndex,
        studentEndIndex,
        studentPageNumber,
        totalStudentPages,
        summaryPageNumber,
        totalSummaryPages,
      });
    }
  }

  return ranges;
}

function getStudentEvaluationPrintRanges(
  data: AppData,
  idPrefix: string,
  label: string,
): StudentEvaluationPrintRange[] {
  const totalPages = Math.max(
    1,
    Math.ceil(data.students.length / EVALUATION_STUDENTS_PER_PAGE),
  );

  return Array.from({ length: totalPages }, (_, pageIndex) => {
    const pageNumber = pageIndex + 1;
    const studentStartIndex = pageIndex * EVALUATION_STUDENTS_PER_PAGE;
    const studentEndIndex = Math.min(
      data.students.length,
      studentStartIndex + EVALUATION_STUDENTS_PER_PAGE,
    );

    return {
      id: pageIndex === 0 ? idPrefix : `${idPrefix}-students-${pageNumber}`,
      label: totalPages === 1 ? label : `${label} ${pageNumber}/${totalPages}`,
      studentStartIndex,
      studentEndIndex,
      pageNumber,
      totalPages,
    };
  });
}

export function getAttributePrintRanges(
  data: AppData,
  range: "1-4" | "5-8",
): StudentEvaluationPrintRange[] {
  return getStudentEvaluationPrintRanges(
    data,
    `attributes-${range}`,
    `คุณลักษณะ ${range}`,
  );
}

export function getAnalyticalPrintRanges(data: AppData): StudentEvaluationPrintRange[] {
  return getStudentEvaluationPrintRanges(data, "analytical", "คิดวิเคราะห์");
}

export interface PrimaryScorePrintRange extends StudentEvaluationPrintRange { term?: 1 | 2 }
export function getPrimaryScorePrintRanges(data: AppData): PrimaryScorePrintRange[] {
  if (!isPrimaryGrade(data.generalInfo.gradeLevel)) return [];
  return [1, 2, 0].flatMap(number => getStudentEvaluationPrintRanges(data,
    number ? `scores-term-${number}` : 'scores-summary',
    number ? `คะแนนตามตัวชี้วัด ภาคเรียนที่ ${number}` : 'สรุปคะแนนและระดับผลการเรียนรายปี',
  ).map(range => ({ ...range, term: number ? number as 1 | 2 : undefined })));
}

export function getPap5PrintPageSpecs(data: AppData): Pap5PrintPageSpec[] {
  const attendanceSpecs = getAttendancePrintMonthRanges(data.generalInfo).map((range) => ({
    id: range.id,
    orientation: "landscape" as const,
    label: range.label,
  }));
  const scoreSummarySpecs = getScoreSummaryPrintRanges(data).map((range) => ({
    id: range.id,
    orientation: "landscape" as const,
    label: range.label,
  }));
  const scoreDetailSpecs = getScoreDetailPrintRanges(data).map((range) => ({
    id: range.id,
    orientation: "landscape" as const,
    label: range.label,
  }));
  const attributeOneToFourSpecs = getAttributePrintRanges(data, "1-4").map((range) => ({
    id: range.id,
    orientation: "landscape" as const,
    label: range.label,
  }));
  const attributeFiveToEightSpecs = getAttributePrintRanges(data, "5-8").map((range) => ({
    id: range.id,
    orientation: "landscape" as const,
    label: range.label,
  }));
  const analyticalSpecs = getAnalyticalPrintRanges(data).map((range) => ({
    id: range.id,
    orientation: "landscape" as const,
    label: range.label,
  }));

  return [
    { id: "cover", orientation: "portrait", label: "ปก" },
    ...attendanceSpecs,
    { id: "attendance-summary", orientation: "landscape", label: "สรุปเวลาเรียน" },
    ...(isPrimaryGrade(data.generalInfo.gradeLevel)
      ? getPrimaryScorePrintRanges(data).map(range => ({ id: range.id, orientation: 'landscape' as const, label: range.label }))
      : scoreDetailSpecs),
    ...scoreSummarySpecs,
    ...attributeOneToFourSpecs,
    ...attributeFiveToEightSpecs,
    ...analyticalSpecs,
    { id: "indicators", orientation: "landscape", label: "ตัวชี้วัด" },
    { id: "explanation", orientation: "portrait", label: "คำชี้แจง" },
    { id: "explanation-next", orientation: "portrait", label: "คำชี้แจงต่อ" },
  ];
}

export function attendanceHoursFromText(value: string) {
  return getHoursFromText(value);
}

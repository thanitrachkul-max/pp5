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

export function getPap5PrintPageSpecs(data: AppData): Pap5PrintPageSpec[] {
  const isSecondSemester = data.generalInfo.semester === "2";

  return [
    { id: "cover", orientation: "portrait", label: "ปก" },
    {
      id: "attendance-1",
      orientation: "landscape",
      label: isSecondSemester ? "เวลาเรียน ต.ค.-ธ.ค." : "เวลาเรียน พ.ค.-ก.ค.",
    },
    {
      id: "attendance-2",
      orientation: "landscape",
      label: isSecondSemester ? "เวลาเรียน ม.ค.-มี.ค." : "เวลาเรียน ส.ค.-ก.ย.",
    },
    { id: "scores", orientation: "landscape", label: "คะแนนตามตัวชี้วัด" },
    { id: "attributes-1-4", orientation: "landscape", label: "คุณลักษณะ 1-4" },
    { id: "attributes-5-8", orientation: "landscape", label: "คุณลักษณะ 5-8" },
    { id: "analytical", orientation: "landscape", label: "คิดวิเคราะห์" },
    { id: "indicators", orientation: "landscape", label: "ตัวชี้วัด" },
    { id: "explanation", orientation: "portrait", label: "คำชี้แจง" },
    { id: "explanation-next", orientation: "portrait", label: "คำชี้แจงต่อ" },
  ];
}

export function attendanceHoursFromText(value: string) {
  return getHoursFromText(value);
}

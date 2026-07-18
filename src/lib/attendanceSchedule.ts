export interface AttendanceScheduleItem {
  dayOfWeek: number;
  hours: number;
}

export interface AttendanceScheduleDay {
  dateKey: string;
  hours: number;
  date: Date;
}

interface BuildAttendanceScheduleOptions {
  startDate: Date;
  schedule: AttendanceScheduleItem[];
  holidays: Record<string, string>;
  totalHours: number;
  teachingWeeks?: number;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isWeekend(date: Date): boolean {
  return date.getDay() === 0 || date.getDay() === 6;
}

export function attendanceDateKey(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function firstWeekdayOnOrAfter(startDate: Date, dayOfWeek: number): Date {
  const normalizedDay = Math.min(5, Math.max(1, Math.trunc(dayOfWeek)));
  const offset = (normalizedDay - startDate.getDay() + 7) % 7;
  return addDays(startDate, offset);
}

function nextAvailableTeachingDate(
  plannedDate: Date,
  holidays: Record<string, string>,
  usedDateKeys: Set<string>,
): Date {
  let candidate = new Date(plannedDate);

  while (
    isWeekend(candidate) ||
    Boolean(holidays[attendanceDateKey(candidate)]) ||
    usedDateKeys.has(attendanceDateKey(candidate))
  ) {
    candidate = addDays(candidate, 1);
  }

  return candidate;
}

export function buildShiftedAttendanceSchedule({
  startDate,
  schedule,
  holidays,
  totalHours,
  teachingWeeks = 20,
}: BuildAttendanceScheduleOptions): {
  hoursMap: Record<string, string>;
  scheduleDays: AttendanceScheduleDay[];
  lastTeachingDate: Date | null;
} {
  const normalizedSchedule = schedule
    .map((item) => ({
      dayOfWeek: Math.min(5, Math.max(1, Math.trunc(item.dayOfWeek))),
      hours: Math.max(1, Math.trunc(item.hours)),
    }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  const plannedSessions = normalizedSchedule
    .flatMap((item) => {
      const firstDate = firstWeekdayOnOrAfter(startDate, item.dayOfWeek);
      return Array.from({ length: teachingWeeks }, (_, weekIndex) => ({
        date: addDays(firstDate, weekIndex * 7),
        hours: item.hours,
      }));
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const hoursMap: Record<string, string> = {};
  const scheduleDays: AttendanceScheduleDay[] = [];
  const usedDateKeys = new Set<string>();
  let currentHour = 1;

  for (const session of plannedSessions) {
    if (currentHour > totalHours) break;

    const teachingDate = nextAvailableTeachingDate(session.date, holidays, usedDateKeys);
    const dateKey = attendanceDateKey(teachingDate);
    const assignedHours = Math.min(session.hours, totalHours - currentHour + 1);
    const endHour = currentHour + assignedHours - 1;

    hoursMap[dateKey] = currentHour === endHour ? `${currentHour}` : `${currentHour}-${endHour}`;
    scheduleDays.push({ dateKey, hours: assignedHours, date: teachingDate });
    usedDateKeys.add(dateKey);
    currentHour = endHour + 1;
  }

  return {
    hoursMap,
    scheduleDays,
    lastTeachingDate: scheduleDays.at(-1)?.date ?? null,
  };
}

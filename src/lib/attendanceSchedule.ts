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
  endDate?: Date;
  schedule: AttendanceScheduleItem[];
  holidays: Record<string, string>;
  totalHours: number;
  teachingWeeks?: number;
}

export interface AttendanceSegment {
  startDate: Date;
  endDate: Date;
}

/**
 * ช่วงเวลาเรียนที่ยาวกว่า 1 ภาคเรียน เช่น กิจกรรมพัฒนาผู้เรียนทั้งปีการศึกษา
 * แต่ละ segment คือช่วงที่มีการเรียนจริง (วันนอก segment เช่น ปิดภาคเรียน จะไม่ถูกจัดชั่วโมง)
 */
export interface AttendancePeriodConfig {
  heading: string;
  subheading: string;
  note?: string;
  hoursPerWeek: number;
  totalHours: number;
  startDate: string;
  endDate: string;
  segments: Array<{ startDate: string; endDate: string }>;
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
  endDate,
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
    if (endDate && teachingDate > endDate) continue;
    const dateKey = attendanceDateKey(teachingDate);
    const assignedHours = Math.min(session.hours, totalHours - currentHour + 1);
    const endHour = currentHour + assignedHours - 1;

    hoursMap[dateKey] = currentHour === endHour ? `${currentHour}` : `${currentHour}-${endHour}`;
    scheduleDays.push({ dateKey, hours: assignedHours, date: teachingDate });
    usedDateKeys.add(dateKey);
    currentHour = endHour + 1;
  }

  // Fill deficits by weekly load, with ties resolved from the last week backwards.
  // This avoids concentrating replacement lessons in the final week/month.
  if (endDate && currentHour <= totalHours && normalizedSchedule.length) {
    const weeks = new Map<string, Date[]>();
    for (let day = new Date(startDate); day <= endDate; day = addDays(day, 1)) {
      if (isWeekend(day) || holidays[attendanceDateKey(day)]) continue;
      const monday = addDays(day, -((day.getDay() + 6) % 7));
      const key = monday.toISOString();
      weeks.set(key, [...(weeks.get(key) ?? []), new Date(day)]);
    }
    const groups = [...weeks.values()].reverse();
    const load = (days: Date[]) => scheduleDays.filter(s => days.some(d => attendanceDateKey(d) === s.dateKey)).reduce((n,s) => n+s.hours,0);
    while (currentHour <= totalHours && groups.length) {
      const days = [...groups].sort((a,b) => load(a)-load(b))[0];
      const unused = [...days].reverse().find(d => !usedDateKeys.has(attendanceDateKey(d)));
      const day = unused ?? [...days].reverse().sort((a,b) =>
        (scheduleDays.find(s=>s.dateKey===attendanceDateKey(a))?.hours ?? 0) -
        (scheduleDays.find(s=>s.dateKey===attendanceDateKey(b))?.hours ?? 0))[0];
      const dateKey = attendanceDateKey(day);
      const existing = scheduleDays.find(s => s.dateKey === dateKey);
      if (existing) existing.hours++;
      else { scheduleDays.push({dateKey, date:day, hours:1}); usedDateKeys.add(dateKey); }
      currentHour++;
    }
    if (currentHour <= totalHours) throw new Error('ไม่มีวันเรียนที่ใช้จัดชั่วโมงได้ในช่วงวันที่กำหนด');
  }
  scheduleDays.sort((a,b) => a.date.getTime()-b.date.getTime());
  let hour = 1;
  for (const day of scheduleDays) {
    const last = hour + day.hours - 1;
    hoursMap[day.dateKey] = hour === last ? `${hour}` : `${hour}-${last}`;
    hour = last+1;
  }

  return {
    hoursMap,
    scheduleDays,
    lastTeachingDate: scheduleDays.at(-1)?.date ?? null,
  };
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${attendanceDateKey(date)}`;
}

/**
 * Split the total hours evenly across teaching segments (the earlier segment
 * takes the extra hour when the split is uneven), plan each segment with the
 * regular weekly schedule, then number the hours 1..N across the whole period.
 */
export function buildSegmentedAttendanceSchedule({
  segments,
  schedule,
  holidays,
  totalHours,
}: {
  segments: AttendanceSegment[];
  schedule: AttendanceScheduleItem[];
  holidays: Record<string, string>;
  totalHours: number;
}): {
  hoursMap: Record<string, string>;
  scheduleDays: AttendanceScheduleDay[];
  lastTeachingDate: Date | null;
} {
  const validSegments = segments.filter((segment) => segment.startDate.getTime() <= segment.endDate.getTime());
  if (validSegments.length === 0) throw new Error("ยังไม่ได้กำหนดช่วงวันที่เรียน");

  const baseShare = Math.floor(totalHours / validSegments.length);
  const remainder = totalHours % validSegments.length;
  const scheduleDays: AttendanceScheduleDay[] = [];

  validSegments.forEach((segment, index) => {
    const share = baseShare + (index < remainder ? 1 : 0);
    if (share <= 0) return;
    const days = Math.round((segment.endDate.getTime() - segment.startDate.getTime()) / 86_400_000) + 1;
    const plan = buildShiftedAttendanceSchedule({
      startDate: segment.startDate,
      endDate: segment.endDate,
      schedule,
      holidays,
      totalHours: share,
      teachingWeeks: Math.ceil(days / 7) + 1,
    });
    scheduleDays.push(...plan.scheduleDays);
  });

  scheduleDays.sort((a, b) => a.date.getTime() - b.date.getTime());
  const hoursMap: Record<string, string> = {};
  let hour = 1;
  for (const day of scheduleDays) {
    const last = hour + day.hours - 1;
    hoursMap[day.dateKey] = hour === last ? `${hour}` : `${hour}-${last}`;
    hour = last + 1;
  }

  return {
    hoursMap,
    scheduleDays,
    lastTeachingDate: scheduleDays.at(-1)?.date ?? null,
  };
}

/**
 * Weekdays (Mon–Fri) of every week that overlaps a teaching segment. Whole
 * weeks keep the attendance grid aligned in groups of five days, while weeks
 * that fall entirely inside a break between segments are left out.
 */
export function attendanceGridDates(segments: AttendanceSegment[]): Date[] {
  const mondays = new Map<string, Date>();

  for (const segment of segments) {
    let firstDay = new Date(segment.startDate);
    while (isWeekend(firstDay)) firstDay = addDays(firstDay, 1);
    if (firstDay > segment.endDate) continue;

    for (
      let monday = addDays(firstDay, -((firstDay.getDay() + 6) % 7));
      monday <= segment.endDate;
      monday = addDays(monday, 7)
    ) {
      mondays.set(localDayKey(monday), new Date(monday));
    }
  }

  return [...mondays.values()]
    .sort((a, b) => a.getTime() - b.getTime())
    .flatMap((monday) => Array.from({ length: 5 }, (_, index) => addDays(monday, index)));
}

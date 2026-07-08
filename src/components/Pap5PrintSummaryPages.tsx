import React from "react";
import type { AppData } from "../types";
import type { ScoreSummaryPrintRange } from "../utils/pap5PrintLayout";
import { attendanceHoursFromText } from "../utils/pap5PrintLayout";

const THAI_MONTHS_FULL = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const SEMESTER_ONE_MONTHS = [5, 6, 7, 8, 9];
const SEMESTER_TWO_MONTHS = [10, 11, 12, 1, 2, 3];

function numberFromText(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveCourseTotalHours(generalInfo: AppData["generalInfo"]) {
  const semesterHours = numberFromText(generalInfo.hoursPerSemester);
  if (semesterHours > 0) return semesterHours;

  const hoursPerWeek = numberFromText(generalInfo.totalHours || generalInfo.hoursPerWeek);
  if (hoursPerWeek > 0) return hoursPerWeek * 20;

  return 0;
}

function semesterMonths(generalInfo: AppData["generalInfo"]) {
  return generalInfo.semester === "2" ? SEMESTER_TWO_MONTHS : SEMESTER_ONE_MONTHS;
}

function monthFromDateKey(dateKey: string) {
  const [monthText] = dateKey.split("-");
  const month = Number(monthText);
  return Number.isFinite(month) ? month : null;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

function fullName(student: AppData["students"][number]) {
  return student.name || "";
}

function scheduledHoursByMonth(data: AppData, month: number) {
  return Object.entries(data.attendance?.hoursMap ?? {}).reduce((sum, [dateKey, hourText]) => {
    if (monthFromDateKey(dateKey) !== month) return sum;
    return sum + attendanceHoursFromText(String(hourText ?? ""));
  }, 0);
}

function attendedHoursByMonth(data: AppData, studentId: string, month: number) {
  const records = data.attendance?.records?.[studentId] ?? {};
  return Object.entries(records).reduce((sum, [dateKey, mark]) => {
    if (monthFromDateKey(dateKey) !== month) return sum;
    if (mark == null || String(mark).trim() === "") return sum;
    return sum + attendanceHoursFromText(String(data.attendance?.hoursMap?.[dateKey] ?? ""));
  }, 0);
}

function totalAttendedHours(data: AppData, studentId: string) {
  return semesterMonths(data.generalInfo).reduce(
    (sum, month) => sum + attendedHoursByMonth(data, studentId, month),
    0,
  );
}

function getScore(scoreRow: Record<string, unknown>, key: string) {
  const value = Number(scoreRow[key]);
  return Number.isFinite(value) ? value : 0;
}

function unitFullScore(unit: NonNullable<AppData["scoreConfig"]>["units"][number]) {
  return unit.indicators.reduce((sum, indicator) => sum + (indicator.fullScore || 0), 0);
}

function unitPassingScore(unit: NonNullable<AppData["scoreConfig"]>["units"][number]) {
  return unit.indicators.reduce((sum, indicator) => sum + (indicator.passingScore || 0), 0);
}

function studentUnitTotal(
  scoreRow: Record<string, unknown>,
  unit: NonNullable<AppData["scoreConfig"]>["units"][number],
  unitIndex: number,
) {
  return unit.indicators.reduce(
    (sum, _indicator, indicatorIndex) => sum + getScore(scoreRow, `u${unitIndex}_i${indicatorIndex}`),
    0,
  );
}

function studentBetweenTermTotal(data: AppData, studentId: string) {
  const scoreRow = (data.scores[studentId] ?? {}) as Record<string, unknown>;
  return (data.scoreConfig?.units ?? []).reduce(
    (sum, unit, unitIndex) => sum + studentUnitTotal(scoreRow, unit, unitIndex),
    0,
  );
}

function scoreToGrade(totalScore: number) {
  if (totalScore >= 80) return "4";
  if (totalScore >= 75) return "3.5";
  if (totalScore >= 70) return "3";
  if (totalScore >= 65) return "2.5";
  if (totalScore >= 60) return "2";
  if (totalScore >= 55) return "1.5";
  if (totalScore >= 50) return "1";
  return "0";
}

function hasScoreData(scoreRow: Record<string, unknown>) {
  return Object.values(scoreRow).some((value) => value !== "" && value != null);
}

function scoreSummaryUnitDisplayName(
  unit: NonNullable<AppData["scoreConfig"]>["units"][number],
  unitIndex: number,
) {
  const name = unit.name.trim();
  return name ? `${unitIndex + 1}. ${name}` : `${unitIndex + 1}.`;
}

export function Pap5AttendanceSummaryPrintPage({ data }: { data: AppData }) {
  const months = semesterMonths(data.generalInfo);
  const totalHours = resolveCourseTotalHours(data.generalInfo);
  const hoursPerWeek =
    data.generalInfo.totalHours || data.generalInfo.hoursPerWeek || "";
  const hoursPerSemester =
    data.generalInfo.hoursPerSemester || (totalHours > 0 ? String(totalHours) : "");

  return (
    <div className="pap5-summary-page pap5-attendance-summary-page">
      <div className="pap5-summary-heading">
        <h2 className="pap5-summary-heading-title">
          <span>สรุปผลการบันทึกเวลาเรียน</span>
          <span>
            ชั้นมัธยมศึกษาปีที่ {data.generalInfo.gradeLevel} ภาคเรียนที่{" "}
            {data.generalInfo.semester} ปีการศึกษา {data.generalInfo.academicYear}
          </span>
          <span>
            รวมเวลาเรียน {hoursPerWeek} ชั่วโมง/สัปดาห์ {hoursPerSemester} ชั่วโมงภาคเรียน
          </span>
        </h2>
      </div>

      <div className="pap5-summary-table-wrap">
        <table className="excel-table pap5-summary-table pap5-attendance-summary-table">
          <thead>
            <tr>
              <th rowSpan={3} className="col-no">เลขที่</th>
              <th rowSpan={3} className="col-code">เลขประจำตัว</th>
              <th rowSpan={3} className="col-citizen">เลขประจำตัวประชาชน</th>
              <th rowSpan={3} className="col-name">ชื่อ - สกุล</th>
              <th colSpan={months.length}>จำนวนชั่วโมงในแต่ละเดือน</th>
              <th colSpan={3}>สรุปผลเวลาเรียน</th>
            </tr>
            <tr>
              {months.map((month) => (
                <th key={month} className="month-col">
                  {THAI_MONTHS_FULL[month - 1]}
                </th>
              ))}
              <th className="summary-col">ชั่วโมง</th>
              <th className="summary-col">มาเรียน%</th>
              <th className="result-col" rowSpan={2}>สรุปผลการประเมิน</th>
            </tr>
            <tr>
              {months.map((month) => (
                <th key={`hours-${month}`} className="month-col">
                  {scheduledHoursByMonth(data, month)}
                </th>
              ))}
              <th className="summary-col">{totalHours}</th>
              <th className="summary-col">100</th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((student, index) => {
              const attended = totalAttendedHours(data, student.id);
              const percent = totalHours > 0 ? (attended / totalHours) * 100 : 0;
              const passed = totalHours > 0 && attended >= totalHours * 0.8;

              return (
                <tr key={student.id}>
                  <td>{index + 1}</td>
                  <td>{student.studentId}</td>
                  <td>{student.citizenId || ""}</td>
                  <td className="text-left">{fullName(student)}</td>
                  {months.map((month) => (
                    <td key={`${student.id}-${month}`}>{attendedHoursByMonth(data, student.id, month) || ""}</td>
                  ))}
                  <td>{attended}</td>
                  <td>{formatPercent(percent)}</td>
                  <td className={passed ? "pass-text" : "fail-text"}>{passed ? "ผ" : "มผ"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Pap5ScoreSummaryPrintPage({
  data,
  range,
}: {
  data: AppData;
  range: ScoreSummaryPrintRange;
}) {
  const allUnits = data.scoreConfig?.units ?? [];
  const units = allUnits.slice(range.startUnitIndex, range.endUnitIndex);
  const includeFinalSummary = range.endUnitIndex >= allUnits.length;
  const storedScore = data.scoreConfig?.storedScore ?? 70;
  const storedPassingScore = Math.floor(storedScore / 2);
  const dataColumnCount = 1 + units.length + (includeFinalSummary ? 8 : 0);
  const students = data.students.slice(range.studentStartIndex, range.studentEndIndex);
  const titlePageNote =
    range.totalSummaryPages > 1
      ? ` ( หน้า ${range.summaryPageNumber}/${range.totalSummaryPages} )`
      : "";

  return (
    <div className="pap5-summary-page pap5-score-summary-page">
      <div className="pap5-summary-heading">
        <h2>
          สรุปผลคะแนนวัดและประเมินผลการเรียนรู้ ชั้นมัธยมศึกษาปีที่ {data.generalInfo.gradeLevel} ภาคเรียนที่{" "}
          {data.generalInfo.semester} ปีการศึกษา {data.generalInfo.academicYear}
          {titlePageNote}
        </h2>
      </div>

      <div className="pap5-summary-table-wrap">
        <table className="excel-table pap5-summary-table pap5-score-summary-table">
          <thead>
            <tr>
              <th rowSpan={5} className="col-no">เลขที่</th>
              <th rowSpan={5} className="col-code">เลขประจำตัว</th>
              <th rowSpan={5} className="col-citizen">เลขประจำตัวประชาชน</th>
              <th rowSpan={5} className="col-name">ชื่อ - สกุล</th>
              <th colSpan={dataColumnCount}>สรุปผลคะแนน</th>
            </tr>
            <tr>
              <th rowSpan={2} className="item-col">รายการ</th>
              {units.map((_unit, index) => {
                const unitNumber = range.startUnitIndex + index + 1;
                return (
                  <th key={`unit-head-${unitNumber}`} rowSpan={2} className="unit-summary-col">
                    <span className="writing-vertical summary-unit-name inline-block">
                      {scoreSummaryUnitDisplayName(_unit, unitNumber - 1)}
                    </span>
                  </th>
                );
              })}
              {includeFinalSummary && (
                <>
                  <th rowSpan={2} className="final-summary-col">
                    <span className="writing-vertical score-summary-vertical-header inline-block">
                      รวมคะแนนหน่วยการเรียนรู้ระหว่างภาคเรียน
                    </span>
                  </th>
                  <th rowSpan={2} className="final-summary-col">
                    <span className="writing-vertical score-summary-vertical-header inline-block">
                      คะแนนสอบกลางภาค
                    </span>
                  </th>
                  <th rowSpan={2} className="final-summary-col">
                    <span className="writing-vertical score-summary-vertical-header inline-block">
                      คะแนนสอบปลายภาค
                    </span>
                  </th>
                  <th rowSpan={2} className="final-summary-col">
                    <span className="writing-vertical score-summary-vertical-header inline-block">
                      รวมคะแนนตลอดภาคเรียน
                    </span>
                  </th>
                  <th colSpan={2}>ระดับผลการเรียน</th>
                  <th rowSpan={4} className="final-summary-col score-summary-percent-col">
                    <span className="writing-vertical score-summary-vertical-header inline-block">
                      ร้อยละ
                    </span>
                  </th>
                  <th rowSpan={4} className="result-col score-summary-indicator-result-col">
                    <span className="writing-vertical score-summary-vertical-header inline-block">
                      สรุปจำนวนตัวชี้วัด/ผลการเรียนรู้
                    </span>
                  </th>
                </>
              )}
            </tr>
            <tr>
              {includeFinalSummary && (
                <>
                  <th className="grade-col">ปกติ</th>
                  <th className="grade-col">แก้ไข</th>
                </>
              )}
            </tr>
            <tr className="score-summary-full-row">
              <th className="item-col">คะแนนเต็ม</th>
              {units.map((unit, index) => (
                <th key={`full-${range.startUnitIndex + index}`}>{unitFullScore(unit)}</th>
              ))}
              {includeFinalSummary && (
                <>
                  <th>{storedScore}</th>
                  <th>10</th>
                  <th>20</th>
                  <th>100</th>
                  <th colSpan={2}></th>
                </>
              )}
            </tr>
            <tr className="score-summary-passing-row">
              <th className="item-col">คะแนนตามเกณฑ์</th>
              {units.map((unit, index) => (
                <th key={`pass-${range.startUnitIndex + index}`}>{unitPassingScore(unit)}</th>
              ))}
              {includeFinalSummary && (
                <>
                  <th>{storedPassingScore}</th>
                  <th>5</th>
                  <th>10</th>
                  <th>50</th>
                  <th colSpan={2}></th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {students.map((student, studentIndex) => {
              const scoreRow = (data.scores[student.id] ?? {}) as Record<string, unknown>;
              const hasData = hasScoreData(scoreRow);
              const betweenTermTotal = studentBetweenTermTotal(data, student.id);
              const midterm = getScore(scoreRow, "midterm");
              const final = getScore(scoreRow, "final");
              const total = betweenTermTotal + midterm + final;
              const grade = scoreToGrade(total);

              return (
                <tr key={student.id} className="score-summary-student-row">
                  <td>{range.studentStartIndex + studentIndex + 1}</td>
                  <td>{student.studentId}</td>
                  <td>{student.citizenId || ""}</td>
                  <td className="text-left">{fullName(student)}</td>
                  <td></td>
                  {units.map((unit, index) => {
                    const unitIndex = range.startUnitIndex + index;
                    return (
                      <td key={`${student.id}-unit-${unitIndex}`}>
                        {hasData ? studentUnitTotal(scoreRow, unit, unitIndex) : ""}
                      </td>
                    );
                  })}
                  {includeFinalSummary && (
                    <>
                      <td>{hasData ? betweenTermTotal : ""}</td>
                      <td>{hasData ? midterm : ""}</td>
                      <td>{hasData ? final : ""}</td>
                      <td>{hasData ? total : ""}</td>
                      <td>{hasData ? grade : ""}</td>
                      <td className="fail-text">{hasData && total < 50 ? "0" : ""}</td>
                      <td className="score-summary-percent-col">{hasData ? total.toFixed(2) : ""}</td>
                      <td className={`score-summary-indicator-result-col ${hasData && total >= 50 ? "pass-text" : hasData ? "fail-text" : ""}`}>
                        {hasData ? (total >= 50 ? "ผ" : "มผ") : ""}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

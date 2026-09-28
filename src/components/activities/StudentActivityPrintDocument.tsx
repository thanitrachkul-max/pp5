import React from "react";
import { StudentsForm } from "../StudentsForm";
import { ActivityCoverPreview } from "./ActivityCoverPreview";
import {
  ActivityInstructions1,
  ActivityInstructions2,
  ActivityInstructions3,
  ActivityInstructions4,
} from "./ActivityInstructions";
import {
  ACTIVITY_KINDS,
  ACTIVITY_LABELS,
  ACTIVITY_MIN_ATTENDANCE_PERCENT,
  ACTIVITY_TOTAL_HOURS,
  activityAssessmentDefinitions,
  activityAttendancePeriod,
  activityGeneralInfoForAttendance,
  activityResultCell,
  activitySummaryRow,
  longClassroomName,
  type ActivityApprovalStatus,
  type ActivityAssessmentDefinition,
  type ActivityDefinitions,
  type ActivityMark,
  type ActivityResult,
  type StudentActivityData,
} from "../../lib/studentActivities";
import { attendanceHoursFromText } from "../../utils/pap5PrintLayout";
import {
  ACTIVITY_ATTENDANCE_PRINT_RANGES,
  getActivityAssessmentPrintRanges,
  getActivityAttendanceSummaryPrintRanges,
  getActivityStudyMonths,
  getActivitySummaryPrintRanges,
  getStudentActivityPrintPageSpecs,
  type ActivityAssessmentPrintRange,
  type ActivityAttendancePrintRange,
  type ActivityStudentPrintRange,
} from "../../utils/studentActivityPrintLayout";

const noop = () => {};

const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

interface PrintProps {
  data: StudentActivityData;
  approvalStatus?: ActivityApprovalStatus | null;
}

function PrintPageNumber({ pageNumber }: { pageNumber?: number }) {
  if (!pageNumber) return null;
  return <span className="pap5-page-number">หน้า {pageNumber}</span>;
}

function pageNote(range: { pageNumber: number; totalPages: number }) {
  return range.totalPages > 1 ? ` (หน้า ${range.pageNumber}/${range.totalPages})` : "";
}

function classYearLine(data: StudentActivityData) {
  return `ชั้น${longClassroomName(data.generalInfo.gradeLevel)} ปีการศึกษา ${data.generalInfo.academicYear}`;
}

/** เครื่องหมายในเอกสารพิมพ์ใช้ตัวอักษร ผ / มผ แทน ✓ / ✗ */
function PrintMark({ mark }: { mark: ActivityMark }) {
  return <span className={mark === "มผ" ? "fail-text" : "activity-print-pass-mark"}>{mark}</span>;
}

function PrintResult({ result }: { result: ActivityResult | null }) {
  if (!result) return null;
  return <span className={result === "ผ่าน" ? "pass-text" : "fail-text"}>{result}</span>;
}

function CoverPrintPage({ data, approvalStatus }: PrintProps) {
  return (
    <section className="print-page portrait cover-print-page">
      <ActivityCoverPreview data={data} approvalStatus={approvalStatus} mode="print" />
    </section>
  );
}

function AttendancePrintPage({
  data,
  range,
  pageNumber,
}: {
  data: StudentActivityData;
  range: ActivityAttendancePrintRange;
  pageNumber?: number;
}) {
  return (
    <section className="print-page landscape attendance-print-page original-tab-print-page activity-attendance-print-page">
      <PrintPageNumber pageNumber={pageNumber} />
      <StudentsForm
        data={data.students}
        generalInfo={activityGeneralInfoForAttendance(data.generalInfo)}
        attendance={data.attendance}
        period={activityAttendancePeriod(data.generalInfo)}
        printMode
        printDateMonths={range.months}
        printFillToWeeks={range.fillToWeeks}
        onChange={noop}
        onAttendanceChange={noop}
      />
    </section>
  );
}

function monthOfDateKey(dateKey: string) {
  const month = Number(dateKey.split("-")[0]);
  return Number.isFinite(month) ? month : null;
}

function AttendanceSummaryPrintPage({
  data,
  range,
  pageNumber,
}: {
  data: StudentActivityData;
  range: ActivityStudentPrintRange;
  pageNumber?: number;
}) {
  const info = data.generalInfo;
  const months = getActivityStudyMonths(data);
  const totalHours = Number(info.hoursPerYear) || ACTIVITY_TOTAL_HOURS;
  const hoursMap = (data.attendance?.hoursMap ?? {}) as Record<string, string>;
  const records = (data.attendance?.records ?? {}) as Record<string, Record<string, string>>;
  const scheduledByMonth = (month: number) =>
    Object.entries(hoursMap).reduce(
      (sum, [dateKey, hourText]) => (monthOfDateKey(dateKey) === month ? sum + attendanceHoursFromText(String(hourText ?? "")) : sum),
      0,
    );
  const attendedByMonth = (studentId: string, month: number) =>
    Object.entries(records[studentId] ?? {}).reduce((sum, [dateKey, mark]) => {
      if (monthOfDateKey(dateKey) !== month || mark == null || String(mark).trim() === "") return sum;
      return sum + attendanceHoursFromText(String(hoursMap[dateKey] ?? ""));
    }, 0);
  const students = data.students.slice(range.studentStartIndex, range.studentEndIndex);

  return (
    <section className="print-page landscape summary-print-page attendance-summary-print-page">
      <PrintPageNumber pageNumber={pageNumber} />
      <div className="pap5-summary-page pap5-attendance-summary-page">
        <div className="pap5-summary-heading">
          <h2 className="pap5-summary-heading-title">
            <span>สรุปผลการบันทึกเวลาเรียน กิจกรรมพัฒนาผู้เรียน</span>
            <span>
              {classYearLine(data)}
              {pageNote(range)}
            </span>
            <span>
              รวมเวลาเรียน {info.hoursPerWeek} ชั่วโมง/สัปดาห์ {info.hoursPerYear} ชั่วโมง/ปี
            </span>
          </h2>
        </div>

        <div className="pap5-summary-table-wrap">
          <table className="excel-table pap5-summary-table pap5-attendance-summary-table activity-attendance-summary-table">
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
                    {THAI_MONTHS_SHORT[month - 1]}
                  </th>
                ))}
                <th className="summary-col">ชั่วโมง</th>
                <th className="summary-col">มาเรียน%</th>
                <th className="result-col" rowSpan={2}>
                  สรุปผลการประเมิน
                </th>
              </tr>
              <tr>
                {months.map((month) => (
                  <th key={`hours-${month}`} className="month-col">
                    {scheduledByMonth(month)}
                  </th>
                ))}
                <th className="summary-col">{totalHours}</th>
                <th className="summary-col">100</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student, index) => {
                const attended = months.reduce((sum, month) => sum + attendedByMonth(student.id, month), 0);
                const percent = totalHours > 0 ? (attended / totalHours) * 100 : 0;
                const passed = totalHours > 0 && percent >= ACTIVITY_MIN_ATTENDANCE_PERCENT;
                return (
                  <tr key={student.id}>
                    <td>{range.studentStartIndex + index + 1}</td>
                    <td>{student.studentId}</td>
                    <td>{student.citizenId || ""}</td>
                    <td className="text-left">{student.name}</td>
                    {months.map((month) => (
                      <td key={`${student.id}-${month}`}>{attendedByMonth(student.id, month) || ""}</td>
                    ))}
                    <td>{attended}</td>
                    <td>{percent.toFixed(2)}</td>
                    <td className={passed ? "pass-text" : "fail-text"}>{passed ? "ผ" : "มผ"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function AssessmentPrintPage({
  data,
  definition,
  range,
  pageNumber,
}: {
  data: StudentActivityData;
  definition: ActivityAssessmentDefinition;
  range: ActivityAssessmentPrintRange;
  pageNumber?: number;
}) {
  const kind = definition.kind;
  // Keep each item with its group so the group header spans only the items printed on this page.
  let itemIndex = 0;
  const groups = definition.groups
    .map((group) => {
      const items = group.items.filter(() => {
        const current = itemIndex;
        itemIndex += 1;
        return current >= range.itemStartIndex && current < range.itemEndIndex;
      });
      return { ...group, items };
    })
    .filter((group) => group.items.length > 0);
  const items = groups.flatMap((group) => group.items);
  const students = data.students.slice(range.studentStartIndex, range.studentEndIndex);
  const longLabels = items.some((item) => item.label.length > 45);

  return (
    <section className="print-page landscape attribute-print-page original-tab-print-page activity-assessment-print-page">
      <PrintPageNumber pageNumber={pageNumber} />
      <div className="w-full">
        <div className="w-full bg-white">
          <div className="attribute-print-heading">
            <span>
              {definition.title}
              {kind === "club" && data.assessments.clubName.trim() ? ` ${data.assessments.clubName.trim()}` : ""}
            </span>
            <span>
              {classYearLine(data)}
              {pageNote(range)}
            </span>
          </div>
          <div className="excel-scroll-area">
            <div className="excel-scroll-content">
              <table className="excel-table activity-print-table activity-assessment-print-table">
                <colgroup>
                  <col className="activity-col-no" />
                  <col className="activity-col-code" />
                  <col className="activity-col-name" />
                  {items.flatMap((item) => [<col key={`${item.key}-pass`} />, <col key={`${item.key}-fail`} />])}
                  <col className="activity-col-result" />
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan={3} className="bg-orange-excel">เลขที่</th>
                    <th rowSpan={3} className="bg-orange-excel">เลขประจำตัว</th>
                    <th rowSpan={3} className="bg-orange-excel">ชื่อ - สกุล</th>
                    {groups.map((group) => (
                      <th key={group.key} colSpan={group.items.length * 2} className="bg-orange-excel activity-print-group-header">
                        {group.label}
                      </th>
                    ))}
                    <th rowSpan={3} className="bg-orange-excel activity-print-result-header">
                      ผลการประเมิน
                      <br />
                      สิ้นปี
                      <br />
                      ผ่าน/ไม่ผ่าน
                    </th>
                  </tr>
                  <tr>
                    {items.map((item) => (
                      <th
                        key={item.key}
                        colSpan={2}
                        className={`bg-orange-excel writing-vertical activity-print-item-header ${
                          longLabels ? "activity-print-item-header-small" : ""
                        }`}
                      >
                        {item.label}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {items.flatMap((item) => [
                      <th key={`${item.key}-pass`} className="bg-orange-excel activity-print-mark-header">
                        ผ
                      </th>,
                      <th key={`${item.key}-fail`} className="bg-orange-excel activity-print-mark-header">
                        มผ
                      </th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {students.map((student, index) => {
                    const row = data.assessments[kind][student.id];
                    const cell = activityResultCell(data.assessments, definition, student.id);
                    return (
                      <tr key={student.id}>
                        <td>{range.studentStartIndex + index + 1}</td>
                        <td>{student.studentId}</td>
                        <td className="text-left activity-print-name">{student.name}</td>
                        {items.flatMap((item) =>
                          (["ผ", "มผ"] as const).map((mark) => (
                            <td key={`${item.key}-${mark}`} className="activity-print-mark-cell">
                              {row?.[item.key] === mark ? <PrintMark mark={mark} /> : null}
                            </td>
                          )),
                        )}
                        <td className="activity-print-result-cell">
                          <PrintResult result={cell.result} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SummaryPrintPage({
  data,
  definitions,
  range,
  pageNumber,
}: {
  data: StudentActivityData;
  definitions: ActivityDefinitions;
  range: ActivityStudentPrintRange;
  pageNumber?: number;
}) {
  const students = data.students.slice(range.studentStartIndex, range.studentEndIndex);
  return (
    <section className="print-page landscape attribute-print-page original-tab-print-page activity-summary-print-page">
      <PrintPageNumber pageNumber={pageNumber} />
      <div className="w-full">
        <div className="w-full bg-white">
          <div className="attribute-print-heading">
            <span>สรุปผลการประเมินกิจกรรมพัฒนาผู้เรียน</span>
            <span>
              {classYearLine(data)}
              {pageNote(range)}
            </span>
          </div>
          <div className="excel-scroll-area">
            <div className="excel-scroll-content">
              <table className="excel-table activity-print-table activity-summary-print-table">
                <colgroup>
                  <col className="activity-col-no" />
                  <col className="activity-col-code" />
                  <col className="activity-col-name" />
                  {ACTIVITY_KINDS.flatMap((kind) => [<col key={`${kind}-pass`} />, <col key={`${kind}-fail`} />])}
                  <col className="activity-col-overall" />
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan={2} className="bg-orange-excel">เลขที่</th>
                    <th rowSpan={2} className="bg-orange-excel">เลขประจำตัว</th>
                    <th rowSpan={2} className="bg-orange-excel">ชื่อ - สกุล</th>
                    {ACTIVITY_KINDS.map((kind) => (
                      <th key={kind} colSpan={2} className="bg-orange-excel activity-print-activity-header">
                        {ACTIVITY_LABELS[kind]}
                      </th>
                    ))}
                    <th rowSpan={2} className="bg-orange-excel">
                      ผลการประเมิน
                      <br />
                      (ผ่าน/ไม่ผ่าน)
                    </th>
                  </tr>
                  <tr>
                    {ACTIVITY_KINDS.flatMap((kind) => [
                      <th key={`${kind}-pass`} className="bg-orange-excel">
                        ผ่าน
                      </th>,
                      <th key={`${kind}-fail`} className="bg-orange-excel">
                        ไม่ผ่าน
                      </th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {students.map((student, index) => {
                    const row = activitySummaryRow(data, student.id, definitions);
                    return (
                      <tr key={student.id}>
                        <td>{range.studentStartIndex + index + 1}</td>
                        <td>{student.studentId}</td>
                        <td className="text-left activity-print-name">{student.name}</td>
                        {ACTIVITY_KINDS.flatMap((kind) => [
                          <td key={`${kind}-pass`}>
                            {row.activities[kind].result === "ผ่าน" ? <PrintMark mark="ผ" /> : null}
                          </td>,
                          <td key={`${kind}-fail`}>
                            {row.activities[kind].result === "ไม่ผ่าน" ? <PrintMark mark="มผ" /> : null}
                          </td>,
                        ])}
                        <td>
                          <PrintResult result={row.overall} />
                          {row.overall === "ไม่ผ่าน" && row.attendanceShort ? <sup className="fail-text">*</sup> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="activity-print-footnote">
            ผ = ผ่าน, มผ = ไม่ผ่าน · ผลการประเมิน "ผ่าน" เมื่อผ่านครบทั้ง 4 กิจกรรม และมีเวลาเข้าร่วมกิจกรรมไม่น้อยกว่าร้อยละ{" "}
            {ACTIVITY_MIN_ATTENDANCE_PERCENT} (* เวลาเข้าร่วมกิจกรรมไม่ถึงเกณฑ์)
          </p>
        </div>
      </div>
    </section>
  );
}

const INSTRUCTION_PAGE_COMPONENTS: Record<string, (props: { header?: React.ReactNode }) => React.ReactNode> = {
  "instructions-1": ActivityInstructions1,
  "instructions-2": ActivityInstructions2,
  "instructions-3": ActivityInstructions3,
  "instructions-4": ActivityInstructions4,
};

function InstructionPrintPage({ pageId, pageNumber }: { pageId: string; pageNumber?: number }) {
  const Page = INSTRUCTION_PAGE_COMPONENTS[pageId] ?? ActivityInstructions1;
  return (
    <section className="print-page portrait explanation-print-page">
      <PrintPageNumber pageNumber={pageNumber} />
      <Page />
    </section>
  );
}

function renderPrintPage(
  pageId: string,
  pageNumber: number,
  { data, approvalStatus }: PrintProps,
  definitions: ActivityDefinitions,
): React.ReactNode {
  if (pageId === "cover") return <CoverPrintPage data={data} approvalStatus={approvalStatus} />;
  const attendanceRange = ACTIVITY_ATTENDANCE_PRINT_RANGES.find((range) => range.id === pageId);
  if (attendanceRange) return <AttendancePrintPage data={data} range={attendanceRange} pageNumber={pageNumber} />;
  const attendanceSummaryRange = getActivityAttendanceSummaryPrintRanges(data).find((range) => range.id === pageId);
  if (attendanceSummaryRange) {
    return <AttendanceSummaryPrintPage data={data} range={attendanceSummaryRange} pageNumber={pageNumber} />;
  }
  for (const kind of ACTIVITY_KINDS) {
    const assessmentRange = getActivityAssessmentPrintRanges(data, definitions[kind]).find((range) => range.id === pageId);
    if (assessmentRange) {
      return <AssessmentPrintPage data={data} definition={definitions[kind]} range={assessmentRange} pageNumber={pageNumber} />;
    }
  }
  const summaryRange = getActivitySummaryPrintRanges(data).find((range) => range.id === pageId);
  if (summaryRange) return <SummaryPrintPage data={data} definitions={definitions} range={summaryRange} pageNumber={pageNumber} />;
  if (INSTRUCTION_PAGE_COMPONENTS[pageId]) return <InstructionPrintPage pageId={pageId} pageNumber={pageNumber} />;
  return <CoverPrintPage data={data} approvalStatus={approvalStatus} />;
}

/** เอกสารบันทึกกิจกรรมพัฒนาผู้เรียนทั้งเล่มสำหรับพิมพ์ (จัดหน้าแบบเดียวกับ ปพ.5) */
export function StudentActivityPrintDocument({ data, approvalStatus = null }: PrintProps) {
  const definitions = activityAssessmentDefinitions(data.generalInfo);
  const specs = getStudentActivityPrintPageSpecs(data, definitions);
  return (
    <div className="print-document pap5-original-print-document activity-print-document">
      {specs.map((spec, index) => (
        <React.Fragment key={spec.id}>
          {renderPrintPage(spec.id, index + 1, { data, approvalStatus }, definitions)}
        </React.Fragment>
      ))}
    </div>
  );
}

export function StudentActivitySinglePrintPage({ data, approvalStatus = null, pageId }: PrintProps & { pageId: string }) {
  const definitions = activityAssessmentDefinitions(data.generalInfo);
  const pageIndex = getStudentActivityPrintPageSpecs(data, definitions).findIndex((spec) => spec.id === pageId);
  return (
    <div className="print-document pap5-original-print-document activity-print-document">
      {renderPrintPage(pageIndex >= 0 ? pageId : "cover", pageIndex >= 0 ? pageIndex + 1 : 1, { data, approvalStatus }, definitions)}
    </div>
  );
}

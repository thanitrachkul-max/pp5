import React, { useMemo, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { AutoFillActivityModal } from "./AutoFillActivityModal";
import { ConfirmClearDialog } from "./ConfirmClearDialog";
import {
  ACTIVITY_KINDS,
  ACTIVITY_LABELS,
  ACTIVITY_MIN_ATTENDANCE_PERCENT,
  activityAssessmentDefinitions,
  activityCoverSummary,
  activitySummaryRow,
  clearResultOverrides,
  fillResultOverrides,
  toggleSummaryResult,
  type ActivityKind,
  type ActivityResult,
  type ActivityResultCell,
  type StudentActivityData,
} from "../../lib/studentActivities";

const NO_WIDTH = 48;
const CODE_WIDTH = 104;
const NAME_WIDTH = 240;
const RESULT_CELL_WIDTH = 74;
const OVERALL_WIDTH = 132;

function fixedWidth(width: number, left?: number): React.CSSProperties {
  return {
    ...(typeof left === "number" ? { left: `${left}px` } : {}),
    width: `${width}px`,
    minWidth: `${width}px`,
    maxWidth: `${width}px`,
  };
}

const RESULTS: ActivityResult[] = ["ผ่าน", "ไม่ผ่าน"];

function cellTitle(label: string, cell: ActivityResultCell, result: ActivityResult, readOnly: boolean): string {
  const source = cell.override
    ? `${label}: กำหนดผลเอง "${cell.override}"${cell.derived ? ` (ผลจากรายการประเมิน "${cell.derived}")` : ""}`
    : cell.derived
      ? `${label}: ผลจากรายการประเมิน "${cell.derived}"`
      : `${label}: ประเมินแล้ว ${cell.marked}/${cell.total} รายการ`;
  if (readOnly) return source;
  if (cell.result === result) {
    return cell.override ? `${source} — คลิกเพื่อกลับไปใช้ผลจากรายการประเมิน` : source;
  }
  return `${source} — คลิกเพื่อกำหนดผล "${result}"`;
}

interface Props {
  data: StudentActivityData;
  readOnly?: boolean;
  onChange: (assessments: StudentActivityData["assessments"]) => void;
}

export function ActivitySummaryForm({ data, readOnly = false, onChange }: Props) {
  const [showAutoFill, setShowAutoFill] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { students, assessments, generalInfo } = data;
  const definitions = useMemo(() => activityAssessmentDefinitions(generalInfo), [generalInfo]);
  const summary = activityCoverSummary(data);
  const nameLeft = NO_WIDTH + CODE_WIDTH;
  const hasOverrides = Object.keys(assessments.results).length > 0;

  const handleClick = (studentId: string, kind: ActivityKind, cell: ActivityResultCell, result: ActivityResult) => {
    if (readOnly) return;
    const next = toggleSummaryResult(assessments, cell, studentId, kind, result);
    if (next !== assessments) onChange(next);
  };

  return (
    <div className="w-full overflow-auto">
      <div className="w-full min-w-0 bg-white p-4" style={{ minHeight: "calc(100vh - 240px)", fontFamily: "Sarabun" }}>
        <div className="mb-4 text-center">
          <h2 className="text-xl font-bold text-slate-900">สรุปผลการประเมินกิจกรรมพัฒนาผู้เรียน</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            ชั้น {generalInfo.gradeLevel} ปีการศึกษา {generalInfo.academicYear}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 text-sm font-bold">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">นักเรียนทั้งหมด {summary.totalStudents} คน</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-emerald-200">
              ผ่าน {summary.passed} คน
            </span>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700 ring-1 ring-rose-200">
              ไม่ผ่าน {summary.failed} คน
            </span>
            {summary.pending > 0 && (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800 ring-1 ring-amber-200">
                ยังประเมินไม่ครบ {summary.pending} คน
              </span>
            )}
          </div>
        </div>

        <div className="excel-scroll-area max-w-full overflow-auto">
          <div className="excel-scroll-content">
            <table className="excel-table activity-summary-table min-w-max whitespace-nowrap">
              <thead>
                <tr>
                  <th rowSpan={2} className="sticky left-0 z-20 bg-orange-excel" style={fixedWidth(NO_WIDTH)}>
                    เลขที่
                  </th>
                  <th rowSpan={2} className="sticky z-20 bg-orange-excel" style={fixedWidth(CODE_WIDTH, NO_WIDTH)}>
                    เลขประจำตัว
                  </th>
                  <th
                    rowSpan={2}
                    className="sticky z-20 border-r-2 border-r-slate-400 bg-orange-excel"
                    style={fixedWidth(NAME_WIDTH, nameLeft)}
                  >
                    ชื่อ - สกุล
                  </th>
                  {ACTIVITY_KINDS.map((kind) => (
                    <th
                      key={kind}
                      colSpan={2}
                      className="whitespace-normal bg-orange-excel py-2 leading-snug"
                      style={fixedWidth(RESULT_CELL_WIDTH * 2)}
                    >
                      {ACTIVITY_LABELS[kind]}
                    </th>
                  ))}
                  <th rowSpan={2} className="whitespace-normal bg-orange-excel leading-snug" style={fixedWidth(OVERALL_WIDTH)}>
                    ผลการประเมิน
                    <br />
                    (ผ่าน/ไม่ผ่าน)
                  </th>
                </tr>
                <tr>
                  {ACTIVITY_KINDS.flatMap((kind) =>
                    RESULTS.map((result) => (
                      <th
                        key={`${kind}-${result}`}
                        className="bg-orange-excel text-[13px] font-semibold"
                        style={fixedWidth(RESULT_CELL_WIDTH)}
                      >
                        {result}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={4 + ACTIVITY_KINDS.length * 2} className="bg-white py-8 text-center text-slate-500">
                      ยังไม่มีรายชื่อนักเรียน กรุณาเพิ่มรายชื่อในแท็บเวลาเรียน
                    </td>
                  </tr>
                ) : (
                  students.map((student, index) => {
                    const row = activitySummaryRow(data, student.id, definitions);
                    return (
                      <tr key={student.id}>
                        <td className="sticky left-0 z-10 bg-white text-center" style={fixedWidth(NO_WIDTH)}>
                          {index + 1}
                        </td>
                        <td className="sticky z-10 bg-white text-center" style={fixedWidth(CODE_WIDTH, NO_WIDTH)}>
                          {student.studentId}
                        </td>
                        <td
                          className="sticky z-10 border-r-2 border-r-slate-400 bg-white px-2"
                          style={fixedWidth(NAME_WIDTH, nameLeft)}
                        >
                          <div className="truncate text-left">{student.name}</div>
                        </td>
                        {ACTIVITY_KINDS.flatMap((kind) =>
                          RESULTS.map((result) => {
                            const cell = row.activities[kind];
                            const active = cell.result === result;
                            const pass = result === "ผ่าน";
                            const manual = active && Boolean(cell.override);
                            return (
                              <td
                                key={`${kind}-${result}`}
                                className={`activity-summary-cell p-0 ${active ? (pass ? "bg-emerald-50" : "bg-rose-50") : ""} ${
                                  manual ? "activity-summary-cell-manual" : ""
                                }`}
                                style={fixedWidth(RESULT_CELL_WIDTH)}
                              >
                                <button
                                  type="button"
                                  disabled={readOnly}
                                  aria-pressed={active}
                                  aria-label={`${student.name} ${ACTIVITY_LABELS[kind]} ${result}`}
                                  title={cellTitle(ACTIVITY_LABELS[kind], cell, result, readOnly)}
                                  onClick={() => handleClick(student.id, kind, cell, result)}
                                  className={`flex h-8 w-full items-center justify-center outline-none transition-colors disabled:cursor-default ${
                                    readOnly ? "" : pass ? "hover:bg-emerald-100/70" : "hover:bg-rose-100/70"
                                  }`}
                                >
                                  {active ? (
                                    pass ? (
                                      <Check className="h-4 w-4 text-emerald-600" strokeWidth={3.2} aria-hidden="true" />
                                    ) : (
                                      <X className="h-4 w-4 text-rose-600" strokeWidth={3.2} aria-hidden="true" />
                                    )
                                  ) : null}
                                </button>
                              </td>
                            );
                          }),
                        )}
                        <td
                          className="text-center"
                          style={fixedWidth(OVERALL_WIDTH)}
                          title={
                            row.attendanceShort
                              ? `เวลาเข้าร่วมกิจกรรม ${row.attendancePercent?.toFixed(2)}% ต่ำกว่าเกณฑ์ร้อยละ ${ACTIVITY_MIN_ATTENDANCE_PERCENT}`
                              : undefined
                          }
                        >
                          {row.overall && (
                            <span className={`font-bold ${row.overall === "ผ่าน" ? "text-emerald-700" : "text-rose-600"}`}>
                              {row.overall}
                              {row.attendanceShort && row.overall === "ไม่ผ่าน" ? <sup className="ml-0.5 text-rose-500">*</sup> : null}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <ul className="mx-auto mt-4 max-w-4xl space-y-1 text-sm text-slate-500">
          <li>
            • ผลแต่ละกิจกรรมคำนวณจากแท็บกิจกรรมนั้นโดยอัตโนมัติ (ผ่านเมื่อได้ ผ ตั้งแต่ร้อยละ 50 ของรายการประเมิน)
          </li>
          <li>
            • คลิกช่อง ผ่าน (✓) หรือ ไม่ผ่าน (✗) เพื่อกำหนดผลเองได้ทุกกิจกรรม ช่องที่กำหนดเองมีกรอบประ
            <span className="mx-1 inline-block h-3.5 w-5 translate-y-0.5 rounded-sm border border-dashed border-violet-500 bg-violet-50" />
            คลิกซ้ำเพื่อกลับไปใช้ผลจากแท็บกิจกรรม
          </li>
          <li>
            • ผลการประเมิน "ผ่าน" เมื่อผ่านครบทั้ง 4 กิจกรรม และมีเวลาเข้าร่วมกิจกรรมไม่น้อยกว่าร้อยละ{" "}
            {ACTIVITY_MIN_ATTENDANCE_PERCENT} <span className="text-rose-500">*</span> = เวลาเข้าร่วมกิจกรรมไม่ถึงเกณฑ์
          </li>
        </ul>

        {!readOnly && (
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <button
              type="button"
              onClick={() => setShowAutoFill(true)}
              className="flex items-center gap-2 rounded-md bg-emerald-600 px-6 py-2 font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
            >
              <Sparkles size={18} />
              ระบบช่วยบันทึกผลอัตโนมัติ
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              disabled={!hasOverrides}
              className="rounded-lg bg-red-50 px-6 py-2 font-medium text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              title={hasOverrides ? undefined : "ยังไม่มีผลที่กำหนดเองในหน้านี้"}
            >
              ล้างค่า
            </button>
          </div>
        )}
      </div>

      {!readOnly && (
        <>
          <AutoFillActivityModal
            isOpen={showAutoFill}
            onClose={() => setShowAutoFill(false)}
            description="กำหนดผลกิจกรรมที่เลือกให้นักเรียนที่เลือก (ใช้แทนผลที่คำนวณจากแท็บกิจกรรม และคลิกช่องเพื่อแก้ไขรายคนได้ภายหลัง)"
            students={students}
            activities={ACTIVITY_KINDS.map((kind) => ({ value: kind, label: ACTIVITY_LABELS[kind] }))}
            results={[
              { value: "ผ่าน", label: "ผ่าน", description: "ทำเครื่องหมาย ✓ ในช่อง ผ่าน", tone: "pass" },
              { value: "ไม่ผ่าน", label: "ไม่ผ่าน", description: "ทำเครื่องหมาย ✗ ในช่อง ไม่ผ่าน", tone: "fail" },
            ]}
            onFill={({ result, studentIds, activities }) =>
              onChange(fillResultOverrides(assessments, activities as ActivityKind[], studentIds, result))
            }
          />
          <ConfirmClearDialog
            isOpen={showClearConfirm}
            message="คุณแน่ใจหรือไม่ที่จะล้างผลที่กำหนดเองในหน้านี้ทั้งหมด? ระบบจะกลับไปใช้ผลที่คำนวณจากแท็บกิจกรรม (ผลการประเมินรายการในแต่ละแท็บยังอยู่ครบ)"
            onCancel={() => setShowClearConfirm(false)}
            onConfirm={() => {
              onChange(clearResultOverrides(assessments));
              setShowClearConfirm(false);
            }}
          />
        </>
      )}
    </div>
  );
}

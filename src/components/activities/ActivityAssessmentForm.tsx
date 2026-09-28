import React, { useMemo, useState } from "react";
import { Check, PencilLine, Sparkles, X } from "lucide-react";
import { AutoFillActivityModal } from "./AutoFillActivityModal";
import { ConfirmClearDialog } from "./ConfirmClearDialog";
import {
  activityResultCell,
  clearAssessmentKind,
  definitionItemKeys,
  fillAssessmentMarks,
  setAssessmentMark,
  type ActivityAssessmentDefinition,
  type ActivityAssessments,
  type ActivityGeneralInfo,
  type ActivityMark,
} from "../../lib/studentActivities";
import type { Student } from "../../types";

const NO_WIDTH = 48;
const CODE_WIDTH = 96;
const NAME_WIDTH = 216;
const MARK_WIDTH = 25;
const RESULT_WIDTH = 96;
/** หัวตารางแนวตั้งสูงขึ้นเมื่อชื่อรายการยาว (เช่น จุดประสงค์ชั้นปีของกิจกรรมแนะแนว) */
const LONG_LABEL_LENGTH = 70;
/** กลุ่มรายการที่กว้างเกินหน้าจอ (เช่น จุดประสงค์ชั้นปี 31 ข้อ) */
const WIDE_GROUP_ITEMS = 10;

function fixedWidth(width: number, left?: number): React.CSSProperties {
  return {
    ...(typeof left === "number" ? { left: `${left}px` } : {}),
    width: `${width}px`,
    minWidth: `${width}px`,
    maxWidth: `${width}px`,
  };
}

/** ✓ ในช่อง ผ และ ✗ ในช่อง มผ (เวลาพิมพ์/บันทึก PDF จะแสดงเป็น ผ / มผ) */
export function ActivityMarkIcon({ mark }: { mark: ActivityMark }) {
  return mark === "ผ" ? (
    <Check className="h-4 w-4 text-emerald-600" strokeWidth={3.2} aria-hidden="true" />
  ) : (
    <X className="h-4 w-4 text-rose-600" strokeWidth={3.2} aria-hidden="true" />
  );
}

interface Props {
  students: Student[];
  generalInfo: ActivityGeneralInfo;
  assessments: ActivityAssessments;
  definition: ActivityAssessmentDefinition;
  readOnly?: boolean;
  onChange: (assessments: ActivityAssessments) => void;
}

export function ActivityAssessmentForm({ students, generalInfo, assessments, definition, readOnly = false, onChange }: Props) {
  const [showAutoFill, setShowAutoFill] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const kind = definition.kind;
  const itemKeys = useMemo(() => definitionItemKeys(definition), [definition]);
  const itemCount = itemKeys.length;
  const nameLeft = NO_WIDTH + CODE_WIDTH;
  const longestLabel = Math.max(0, ...definition.groups.flatMap((group) => group.items.map((item) => item.label.length)));
  const headerClass = `activity-item-header writing-vertical bg-orange-excel ${
    longestLabel > LONG_LABEL_LENGTH ? "activity-item-header-tall" : ""
  }`;
  const cells = students.map((student) => activityResultCell(assessments, definition, student.id));
  const completedStudents = cells.filter((cell) => cell.result !== null).length;

  const toggleMark = (studentId: string, itemKey: string, mark: ActivityMark) => {
    if (readOnly) return;
    const current = assessments[kind][studentId]?.[itemKey];
    onChange(setAssessmentMark(assessments, kind, studentId, itemKey, current === mark ? null : mark));
  };

  return (
    <div className="w-full overflow-auto">
      <div className="w-full min-w-0 bg-white p-4" style={{ minHeight: "calc(100vh - 240px)", fontFamily: "Sarabun" }}>
        <div className="mb-3 text-center">
          <h2 className="flex flex-wrap items-end justify-center gap-x-2 gap-y-1 text-xl font-bold text-slate-900">
            <span>{definition.title}</span>
            {kind === "club" &&
              (readOnly ? (
                <span className="min-w-[180px] border-b border-dotted border-slate-400 px-2 text-blue-700">
                  {assessments.clubName}
                </span>
              ) : (
                <input
                  type="text"
                  value={assessments.clubName}
                  onChange={(event) => onChange({ ...assessments, clubName: event.target.value })}
                  placeholder="ใส่ชื่อชุมนุม"
                  aria-label="ชื่อชุมนุม"
                  className="w-60 border-b border-dotted border-slate-400 bg-yellow-excel px-2 text-center text-lg font-bold text-blue-700 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-500"
                />
              ))}
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            ชั้น {generalInfo.gradeLevel} ปีการศึกษา {generalInfo.academicYear}
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs font-bold">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{itemCount} รายการประเมิน</span>
            <span
              className={`rounded-full px-3 py-1 ring-1 ${
                students.length > 0 && completedStudents === students.length
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-amber-50 text-amber-800 ring-amber-200"
              }`}
            >
              สรุปผลแล้ว {completedStudents}/{students.length} คน
            </span>
          </div>
        </div>

        {itemCount === 0 ? (
          <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-6 py-10 text-center text-amber-900">
            <p className="font-bold">ไม่พบรายการประเมินของระดับชั้น {generalInfo.classLevelCode || generalInfo.gradeLevel} ในหลักสูตร</p>
            <p className="mt-1 text-sm">บันทึกผล ผ่าน/ไม่ผ่าน ของกิจกรรมนี้ได้ที่แท็บสรุปผลการประเมินกิจกรรมพัฒนาผู้เรียน</p>
          </div>
        ) : (
          <div className="excel-scroll-area max-w-full overflow-auto">
            <div className="excel-scroll-content">
              <table className="excel-table activity-assessment-table min-w-max whitespace-nowrap">
                <thead>
                  <tr>
                    <th rowSpan={3} className="sticky left-0 z-20 bg-orange-excel" style={fixedWidth(NO_WIDTH)}>
                      เลขที่
                    </th>
                    <th rowSpan={3} className="sticky z-20 bg-orange-excel" style={fixedWidth(CODE_WIDTH, NO_WIDTH)}>
                      เลขประจำตัว
                    </th>
                    <th
                      rowSpan={3}
                      className="sticky z-20 border-r-2 border-r-slate-400 bg-orange-excel"
                      style={fixedWidth(NAME_WIDTH, nameLeft)}
                    >
                      ชื่อ - สกุล
                    </th>
                    {definition.groups.map((group) =>
                      group.items.length > WIDE_GROUP_ITEMS ? (
                        <th key={group.key} colSpan={group.items.length * 2} className="bg-orange-excel">
                          {/* A long group keeps its label in view beside the student columns while scrolling. */}
                          <div className="sticky w-max px-3" style={{ left: `${nameLeft + NAME_WIDTH}px` }}>
                            {group.label}
                          </div>
                        </th>
                      ) : (
                        <th key={group.key} colSpan={group.items.length * 2} className="bg-orange-excel">
                          {group.label}
                        </th>
                      ),
                    )}
                    <th rowSpan={3} className="bg-orange-excel leading-tight" style={fixedWidth(RESULT_WIDTH)}>
                      ผลการประเมิน
                      <br />
                      สิ้นปี
                      <br />
                      <span className="text-[12px] font-semibold">ผ่าน/ไม่ผ่าน</span>
                    </th>
                  </tr>
                  <tr>
                    {definition.groups.flatMap((group) =>
                      group.items.map((item) => (
                        <th
                          key={item.key}
                          colSpan={2}
                          title={item.label}
                          className={headerClass}
                          style={fixedWidth(MARK_WIDTH * 2)}
                        >
                          {item.label}
                        </th>
                      )),
                    )}
                  </tr>
                  <tr>
                    {definition.groups.flatMap((group) =>
                      group.items.flatMap((item) => [
                        <th key={`${item.key}-pass`} className="bg-orange-excel text-[12px]" style={fixedWidth(MARK_WIDTH)}>
                          ผ
                        </th>,
                        <th key={`${item.key}-fail`} className="bg-orange-excel text-[12px]" style={fixedWidth(MARK_WIDTH)}>
                          มผ
                        </th>,
                      ]),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {students.length === 0 ? (
                    <tr>
                      <td colSpan={4 + itemCount * 2} className="bg-white py-8 text-center text-slate-500">
                        ยังไม่มีรายชื่อนักเรียน กรุณาเพิ่มรายชื่อในแท็บเวลาเรียน
                      </td>
                    </tr>
                  ) : (
                    students.map((student, index) => {
                      const row = assessments[kind][student.id];
                      const cell = cells[index];
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
                          {definition.groups.flatMap((group) =>
                            group.items.flatMap((item) =>
                              (["ผ", "มผ"] as const).map((mark) => {
                                const active = row?.[item.key] === mark;
                                const pass = mark === "ผ";
                                return (
                                  <td
                                    key={`${item.key}-${mark}`}
                                    className={`activity-mark-cell p-0 ${
                                      active ? (pass ? "bg-emerald-50" : "bg-rose-50") : ""
                                    }`}
                                    style={fixedWidth(MARK_WIDTH)}
                                  >
                                    <button
                                      type="button"
                                      disabled={readOnly}
                                      aria-pressed={active}
                                      aria-label={`${student.name} ${item.label} ${pass ? "ผ่าน" : "ไม่ผ่าน"}`}
                                      title={`${item.label} — ${pass ? "ผ่าน (ผ)" : "ไม่ผ่าน (มผ)"}`}
                                      onClick={() => toggleMark(student.id, item.key, mark)}
                                      className={`flex h-8 w-full items-center justify-center outline-none transition-colors disabled:cursor-default ${
                                        readOnly ? "" : pass ? "hover:bg-emerald-100/70" : "hover:bg-rose-100/70"
                                      }`}
                                    >
                                      {active ? <ActivityMarkIcon mark={mark} /> : null}
                                    </button>
                                  </td>
                                );
                              }),
                            ),
                          )}
                          <td className="text-center" style={fixedWidth(RESULT_WIDTH)}>
                            {cell.result ? (
                              <span
                                className={`inline-flex items-center gap-0.5 font-bold ${
                                  cell.result === "ผ่าน" ? "text-emerald-700" : "text-rose-600"
                                }`}
                                title={cell.override ? "กำหนดผลเองในแท็บสรุปผลการประเมินกิจกรรมพัฒนาผู้เรียน" : undefined}
                              >
                                {cell.result}
                                {cell.override ? <PencilLine className="h-3 w-3 text-violet-500" aria-hidden="true" /> : null}
                              </span>
                            ) : cell.marked > 0 ? (
                              <span
                                className="text-[12px] text-slate-400"
                                title={`ประเมินแล้ว ${cell.marked} จาก ${cell.total} รายการ`}
                              >
                                {cell.marked}/{cell.total}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {itemCount > 0 && (
          <p className="mt-3 text-center text-sm text-slate-500">
            คลิกช่อง <span className="font-bold text-emerald-700">ผ</span> (✓) หรือ <span className="font-bold text-rose-600">มผ</span> (✗)
            เพื่อบันทึกผล ผลการประเมินสิ้นปี "ผ่าน" เมื่อได้ ผ ตั้งแต่ร้อยละ 50 ของรายการประเมิน
            {" "}(เวลาพิมพ์และบันทึก PDF จะแสดงเป็น ผ / มผ)
          </p>
        )}

        {!readOnly && itemCount > 0 && (
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
              className="rounded-lg bg-red-50 px-6 py-2 font-medium text-red-600 transition-colors hover:bg-red-100"
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
            description={`ลงผลการประเมินทุกรายการของ${definition.shortTitle}ให้นักเรียนที่เลือก แล้วแก้ไขรายคนได้ภายหลัง`}
            students={students}
            results={[
              { value: "ผ", label: "ผ่าน (ผ)", description: "ทำเครื่องหมาย ✓ ในช่อง ผ ทุกรายการ", tone: "pass" },
              { value: "มผ", label: "ไม่ผ่าน (มผ)", description: "ทำเครื่องหมาย ✗ ในช่อง มผ ทุกรายการ", tone: "fail" },
            ]}
            onFill={({ result, studentIds }) => onChange(fillAssessmentMarks(assessments, kind, itemKeys, studentIds, result))}
          />
          <ConfirmClearDialog
            isOpen={showClearConfirm}
            message={`คุณแน่ใจหรือไม่ที่จะล้างผลการประเมิน${definition.shortTitle}ทั้งหมด (รวมผลที่กำหนดเองในแท็บสรุปผล)? การกระทำนี้ไม่สามารถย้อนกลับได้`}
            onCancel={() => setShowClearConfirm(false)}
            onConfirm={() => {
              onChange(clearAssessmentKind(assessments, kind));
              setShowClearConfirm(false);
            }}
          />
        </>
      )}
    </div>
  );
}

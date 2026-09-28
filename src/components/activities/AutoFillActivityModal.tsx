import React, { useEffect, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { ModalPortal } from "../ModalPortal";
import type { Student } from "../../types";

type FillMode = "all" | "individual";

export interface AutoFillResultOption<T extends string> {
  value: T;
  label: string;
  description: string;
  tone: "pass" | "fail";
}

interface Props<T extends string> {
  isOpen: boolean;
  onClose: () => void;
  description: string;
  students: Student[];
  results: AutoFillResultOption<T>[];
  /** กิจกรรมที่เลือกลงผลได้ (ไม่ระบุ = ลงผลกิจกรรมที่กำลังเปิดอยู่) */
  activities?: Array<{ value: string; label: string }>;
  onFill: (options: { result: T; studentIds: string[]; activities: string[] }) => void;
}

export function AutoFillActivityModal<T extends string>({
  isOpen,
  onClose,
  description,
  students,
  results,
  activities,
  onFill,
}: Props<T>) {
  const [fillMode, setFillMode] = useState<FillMode>("all");
  const [result, setResult] = useState<T>(results[0].value);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<string[]>(
    () => activities?.map((activity) => activity.value) ?? [],
  );

  useEffect(() => {
    if (!isOpen) return;
    setSelectedStudentIds((current) => current.filter((id) => students.some((student) => student.id === id)));
  }, [isOpen, students]);

  if (!isOpen) return null;

  const targetStudentIds = fillMode === "all" ? students.map((student) => student.id) : selectedStudentIds;
  const canFill =
    targetStudentIds.length > 0 && (!activities || selectedActivities.length > 0);

  const toggleStudent = (studentId: string) =>
    setSelectedStudentIds((current) =>
      current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId],
    );
  const toggleActivity = (value: string) =>
    setSelectedActivities((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );

  const handleFill = () => {
    if (!canFill) return;
    onFill({ result, studentIds: targetStudentIds, activities: selectedActivities });
    onClose();
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[120] grid min-h-dvh place-items-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="activity-autofill-title"
          className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl animate-in zoom-in-95 duration-200"
        >
          <div className="flex items-center justify-between border-b border-slate-100 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <Sparkles size={22} />
              </div>
              <h2 id="activity-autofill-title" className="text-2xl font-bold text-slate-800">
                ระบบช่วยบันทึกผลอัตโนมัติ
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 transition-colors hover:text-slate-600"
              aria-label="ปิดหน้าต่าง"
            >
              <X size={24} />
            </button>
          </div>

          <div className="space-y-6 overflow-y-auto p-6">
            <p className="text-slate-600">{description}</p>

            {activities && (
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">กิจกรรมที่ต้องการบันทึก</label>
                <div className="grid grid-cols-2 gap-2">
                  {activities.map((activity) => {
                    const checked = selectedActivities.includes(activity.value);
                    return (
                      <button
                        key={activity.value}
                        type="button"
                        aria-pressed={checked}
                        onClick={() => toggleActivity(activity.value)}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                          checked
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                            checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white"
                          }`}
                        >
                          {checked && <Check size={14} strokeWidth={3} />}
                        </span>
                        {activity.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">ผลการประเมินที่ต้องการลง</label>
              <div className="grid grid-cols-2 gap-2">
                {results.map((option) => {
                  const selected = option.value === result;
                  const toneClass =
                    option.tone === "pass"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 ring-emerald-100"
                      : "border-rose-300 bg-rose-50 text-rose-700 ring-rose-100";
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setResult(option.value)}
                      className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                        selected ? `${toneClass} ring-4` : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span className="block text-base font-bold">{option.label}</span>
                      <span className="mt-0.5 block text-xs font-medium opacity-80">{option.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">รูปแบบการลงผล</label>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                {(
                  [
                    ["all", "ทั้งหมด"],
                    ["individual", "รายบุคคล"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFillMode(mode)}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                      fillMode === mode ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:bg-white/60"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {fillMode === "individual" && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                {students.length > 0 ? (
                  <>
                    <div className="mb-2 flex items-center justify-between px-1 text-sm">
                      <span className="font-medium text-slate-700">
                        เลือกแล้ว {selectedStudentIds.length} จาก {students.length} คน
                      </span>
                      <span className="flex gap-3">
                        <button
                          type="button"
                          className="font-semibold text-blue-700 hover:underline"
                          onClick={() => setSelectedStudentIds(students.map((student) => student.id))}
                        >
                          เลือกทั้งหมด
                        </button>
                        <button
                          type="button"
                          className="font-semibold text-slate-500 hover:underline"
                          onClick={() => setSelectedStudentIds([])}
                        >
                          ล้างที่เลือก
                        </button>
                      </span>
                    </div>
                    <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                      {students.map((student, index) => {
                        const checked = selectedStudentIds.includes(student.id);
                        return (
                          <label
                            key={student.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                              checked ? "bg-white shadow-sm ring-1 ring-blue-200" : "hover:bg-white"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleStudent(student.id)}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="w-6 text-right text-slate-400">{index + 1}</span>
                            <span className="font-medium text-slate-800">{student.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    ยังไม่มีรายชื่อนักเรียนให้เลือก
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 rounded-b-2xl border-t border-slate-100 bg-slate-50 p-6">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-6 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleFill}
              disabled={!canFill}
              className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles size={18} />
              บันทึกผล
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

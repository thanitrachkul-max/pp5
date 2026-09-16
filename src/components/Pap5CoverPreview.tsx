import React, { useLayoutEffect, useRef } from "react";
import { Check } from "lucide-react";
import { applyPap5OfficialDisplayDefaults } from "../lib/pap5Officials";
import type { AppData, GradebookApprovalStatus } from "../types";

type GeneralInfo = AppData["generalInfo"];
type CoverMode = "edit" | "preview" | "print";

interface Pap5CoverPreviewProps {
  data: GeneralInfo;
  appData: AppData;
  approvalStatus?: GradebookApprovalStatus | null;
  mode?: CoverMode;
  onChange?: (data: GeneralInfo) => void;
}

const DEFAULT_SCHOOL_NAME = "โรงเรียนกาฬสินธุ์ปัญญานุกูล จังหวัดกาฬสินธุ์";
const DEFAULT_AGENCY_NAME = "สำนักบริหารงานการศึกษาพิเศษ";
const DEFAULT_LOGO_URL = "/logo3.png";
const LEGACY_LOGO_URL = "/logo1.png";

const GRADE_KEYS = ["4", "3.5", "3", "2.5", "2", "1.5", "1", "0"] as const;
const QUALITY_KEYS = ["3", "2", "1", "0"] as const;
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

type GradeKey = (typeof GRADE_KEYS)[number] | "ผ" | "มผ";
type QualityKey = (typeof QUALITY_KEYS)[number];

function buildHomeroomTeachersText(data: GeneralInfo): string {
  return [data.homeroomTeacher1, data.homeroomTeacher2, data.homeroomTeacher3]
    .map((name, index) => (name ? `${index + 1}. ${name}` : ""))
    .filter(Boolean)
    .join(" ");
}

function coverTeacherNames(data: GeneralInfo): string[] {
  return [data.teacherName, data.teacherName2, data.teacherName3]
    .map((name) => name?.replace(/\s+/g, " ").trim())
    .filter((name): name is string => Boolean(name));
}

function teacherNamesText(data: GeneralInfo): string {
  const names = coverTeacherNames(data);
  if (names.length <= 1) return names[0] ?? "";
  return names.map((name, index) => `${index + 1}. ${name}`).join("  ");
}

function getAvg(keys: string[], attrs: Record<string, unknown> | undefined) {
  let sum = 0;
  let count = 0;

  keys.forEach((key) => {
    const value = attrs?.[key];
    if (value !== undefined && value !== "") {
      sum += Number(value);
      count += 1;
    }
  });

  return count > 0 ? Math.round(sum / count) : 0;
}

function buildCoverSummary(appData: AppData) {
  const summary = {
    totalStudents: appData.students.length,
    grades: {
      "4": 0,
      "3.5": 0,
      "3": 0,
      "2.5": 0,
      "2": 0,
      "1.5": 0,
      "1": 0,
      "0": 0,
      ผ: 0,
      มผ: 0,
    } satisfies Record<GradeKey, number>,
    analytical: { "3": 0, "2": 0, "1": 0, "0": 0 } satisfies Record<QualityKey, number>,
    attributes: { "3": 0, "2": 0, "1": 0, "0": 0 } satisfies Record<QualityKey, number>,
  };

  appData.students.forEach((student) => {
    const score = appData.scores[student.id] || {};
    let totalBetweenTerm = 0;

    if (appData.scoreConfig?.units) {
      appData.scoreConfig.units.forEach((unit, unitIndex) => {
        unit.indicators.forEach((indicator, indicatorIndex) => {
          if (indicator) {
            totalBetweenTerm += Number(score[`u${unitIndex}_i${indicatorIndex}`]) || 0;
          }
        });
      });
    } else {
      Object.keys(score).forEach((key) => {
        if (key.startsWith("u") && key.includes("_i")) {
          totalBetweenTerm += Number(score[key]) || 0;
        }
      });
    }

    const totalScore =
      totalBetweenTerm + (Number(score.midterm) || 0) + (Number(score.final) || 0);

    let grade: GradeKey = "0";
    if (totalScore >= 80) grade = "4";
    else if (totalScore >= 75) grade = "3.5";
    else if (totalScore >= 70) grade = "3";
    else if (totalScore >= 65) grade = "2.5";
    else if (totalScore >= 60) grade = "2";
    else if (totalScore >= 55) grade = "1.5";
    else if (totalScore >= 50) grade = "1";

    summary.grades[grade] += 1;
    summary.grades[totalScore >= 50 ? "ผ" : "มผ"] += 1;

    const analyticalAverage = getAvg(
      ["attr1", "attr2", "attr3", "attr4", "attr5", "attr6", "attr7"],
      appData.analytical[student.id],
    );
    if (analyticalAverage in summary.analytical) {
      summary.analytical[analyticalAverage.toString() as QualityKey] += 1;
    }

    const attrs = appData.attributes[student.id] || {};
    const attributeAverages = [
      getAvg(["attr1_1", "attr1_2", "attr1_3", "attr1_4"], attrs),
      getAvg(["attr2_1", "attr2_2"], attrs),
      getAvg(["attr3_1", "attr3_2"], attrs),
      getAvg(["attr4_1", "attr4_2"], attrs),
      getAvg(["attr5_1", "attr5_2"], attrs),
      getAvg(["attr6_1", "attr6_2"], attrs),
      getAvg(["attr7_1", "attr7_2", "attr7_3"], attrs),
      getAvg(["attr8_1", "attr8_2"], attrs),
    ];
    const attributeAverage = Math.round(
      attributeAverages.reduce((sum, value) => sum + value, 0) / 8,
    );
    if (attributeAverage in summary.attributes) {
      summary.attributes[attributeAverage.toString() as QualityKey] += 1;
    }
  });

  return summary;
}

function formatThaiFullDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "";
  const thaiYear = year > 2400 ? year : year + 543;
  return `${day} ${THAI_MONTHS_FULL[month - 1] ?? ""} ${thaiYear}`;
}

function fieldBaseClass(className: string) {
  return `${className} border-b border-slate-400 text-center outline-none`;
}

function TextField({
  name,
  value,
  widthClass,
  editable,
  highlighted = false,
  muted = false,
  fit = false,
  type = "text",
  onChange,
}: {
  name: keyof GeneralInfo;
  value: string | number | undefined;
  widthClass: string;
  editable: boolean;
  highlighted?: boolean;
  muted?: boolean;
  fit?: boolean;
  type?: "text" | "number";
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const fieldRef = useRef<HTMLInputElement & HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!fit) return;
    const field = fieldRef.current;
    if (!field) return;
    let disposed = false;
    const resize = () => {
      if (disposed) return;
      field.style.removeProperty('font-size');
      const style = getComputedStyle(field);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return;
      context.font = style.font;
      const textWidth = context.measureText(String(value ?? '')).width;
      const available = field.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2;
      if (textWidth > available && available > 0) {
        field.style.setProperty('font-size', `${parseFloat(style.fontSize) * available / textWidth}px`, 'important');
      }
    };
    resize();
    void document.fonts.ready.then(resize);
    const observer = new ResizeObserver(resize);
    observer.observe(field);
    window.addEventListener('beforeprint', resize);
    window.addEventListener('afterprint', resize);
    return () => { disposed = true; observer.disconnect(); window.removeEventListener('beforeprint', resize); window.removeEventListener('afterprint', resize); };
  }, [fit, value, editable]);
  const backgroundClass = highlighted ? "bg-yellow-excel" : muted ? "bg-slate-50" : "bg-white";
  const className = fieldBaseClass(`${backgroundClass} ${widthClass}`);
  const displayValue = value === undefined || value === null ? "" : String(value);

  if (!editable) {
    const shouldBoldValue = highlighted || muted || name === "academicYear";
    return (
      <span
        ref={fieldRef}
        data-cover-field={name}
        className={`pap5-cover-value pap5-cover-fill-line inline-flex min-h-[20px] items-center justify-center px-1 text-center ${widthClass} ${
          shouldBoldValue ? "font-bold" : ""
        }`}
      >
        {displayValue}
      </span>
    );
  }

  return (
    <input
      ref={fieldRef}
      data-cover-field={name}
      type={type}
      name={name}
      value={displayValue}
      onChange={onChange}
      className={`${className} focus:border-blue-500`}
    />
  );
}

function SemesterField({
  value,
  editable,
  onChange,
}: {
  value: string;
  editable: boolean;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  const className = fieldBaseClass("bg-yellow-excel w-16");

  if (!editable) {
    return (
      <span className="pap5-cover-value pap5-cover-fill-line inline-flex min-h-[20px] w-16 items-center justify-center px-1 text-center font-bold">
        {value}
      </span>
    );
  }

  return (
    <select
      name="semester"
      value={value}
      onChange={onChange}
      className={`${className} focus:border-blue-500 cursor-pointer`}
    >
      <option value="1">1</option>
      <option value="2">2</option>
    </select>
  );
}

function DateField({
  value,
  editable,
  onChange,
}: {
  value: string;
  editable: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  if (!editable) {
    return (
      <span className="inline-flex min-h-[24px] min-w-[150px] items-center justify-center px-2 py-0.5 text-center text-sm font-bold">
        {formatThaiFullDate(value)}
      </span>
    );
  }

  return (
    <input
      type="date"
      name="approvalDate"
      value={value}
      onChange={onChange}
      className="border border-slate-300 rounded px-2 py-1 text-sm outline-none cursor-pointer text-center"
    />
  );
}

function ApprovalChoice({
  checked,
  label,
}: {
  checked: boolean;
  label: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white">
        {checked ? <Check className="h-4 w-4 text-slate-950" strokeWidth={3} /> : null}
      </span>
      <span>{label}</span>
    </span>
  );
}

export function Pap5CoverPreview({
  data,
  appData,
  approvalStatus = null,
  mode = "edit",
  onChange,
}: Pap5CoverPreviewProps) {
  const editable = mode === "edit";
  const displayGeneralInfo = applyPap5OfficialDisplayDefaults(data);
  const schoolName = displayGeneralInfo.schoolName || DEFAULT_SCHOOL_NAME;
  const agencyName = displayGeneralInfo.agencyName || DEFAULT_AGENCY_NAME;
  const logoUrl =
    displayGeneralInfo.logoUrl && displayGeneralInfo.logoUrl !== LEGACY_LOGO_URL
      ? displayGeneralInfo.logoUrl
      : DEFAULT_LOGO_URL;
  const summary = buildCoverSummary(appData);
  const teacherNames = coverTeacherNames(displayGeneralInfo);
  const teacherFields = (teacherNames.length > 0
    ? teacherNames
    : [""]
  ).map((value, index) => ({
    name: (["teacherName", "teacherName2", "teacherName3"] as const)[index],
    value,
  }));
  const getPercent = (count: number) => {
    if (summary.totalStudents === 0) return "0";
    return Math.round((count / summary.totalStudents) * 100).toString();
  };

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    if (!editable || !onChange) return;

    const { name, value } = event.target;
    const nextData = { ...data, [name]: value };

    if (name === "totalHours") {
      const hours = parseFloat(value) || 0;
      nextData.hoursPerWeek = value;
      nextData.hoursPerSemester = (hours * 20).toString();
    }

    if (
      name === "homeroomTeacher1" ||
      name === "homeroomTeacher2" ||
      name === "homeroomTeacher3"
    ) {
      nextData.homeroomTeachers = buildHomeroomTeachersText(nextData);
    }

    onChange(nextData);
  };

  const shellClass =
    mode === "print"
      ? "pap5-cover-shell pap5-cover-shell-print flex justify-center bg-white p-0"
      : "pap5-cover-shell flex justify-center rounded-2xl bg-slate-100/90 p-4 sm:p-6 overflow-auto";

  return (
    <div className={shellClass}>
      <div
        className="pap5-cover-page bg-white p-8 relative text-sm rounded-lg ring-1 ring-slate-200/80 shadow-[0_12px_32px_-8px_rgb(15,23,42,0.12)]"
        style={{ width: "794px", minHeight: "1123px", fontFamily: '"TH Sarabun PSK", Sarabun' }}
      >
        <div className="absolute top-8 right-8 font-bold text-sm">ปพ. 5</div>

        <div className="flex justify-center mb-2">
          <img
            src={logoUrl}
            alt="School Logo"
            className="w-24 h-24 object-contain"
            onError={(event) => {
              const target = event.target as HTMLImageElement;
              if (!target.src.endsWith(DEFAULT_LOGO_URL)) {
                target.src = DEFAULT_LOGO_URL;
              }
            }}
          />
        </div>

        <div className="pap5-cover-title-block mb-4">
          <div className="text-center font-bold text-sm">แบบบันทึกผลการเรียนรายวิชา</div>
          <div className="text-center font-bold text-sm">
            ตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551
          </div>
          <div className="text-center font-bold text-sm">{schoolName}</div>
          <div className="text-center font-bold text-sm">{agencyName}</div>
        </div>

        <div className="flex justify-center items-center gap-2 mb-2">
          <span>ชั้นมัธยมศึกษาปีที่</span>
          <TextField
            name="gradeLevel"
            value={displayGeneralInfo.gradeLevel}
            widthClass="w-20"
            highlighted
            editable={editable}
            onChange={handleChange}
          />
          <span>ภาคเรียนที่</span>
          <SemesterField
            value={displayGeneralInfo.semester}
            editable={editable}
            onChange={handleChange}
          />
          <span>ปีการศึกษา</span>
          <TextField
            name="academicYear"
            value={displayGeneralInfo.academicYear}
            widthClass="w-20"
            editable={editable}
            onChange={handleChange}
          />
        </div>

        <div className="flex justify-center items-center gap-2 mb-2 whitespace-nowrap">
          <div className="flex items-center gap-1">
            <span>รหัสวิชา</span>
            <TextField
              name="subjectCode"
              value={displayGeneralInfo.subjectCode}
              widthClass="w-16"
              highlighted
              editable={editable}
              onChange={handleChange}
            />
          </div>
          <div className="flex items-center gap-1">
            <span>รายวิชา</span>
            <TextField
              fit
              name="subjectName"
              value={displayGeneralInfo.subjectName}
              widthClass="w-40"
              highlighted
              editable={editable}
              onChange={handleChange}
            />
          </div>
          <div className="flex items-center gap-1">
            <span>กลุ่มสาระการเรียนรู้</span>
            <TextField
              fit
              name="learningArea"
              value={displayGeneralInfo.learningArea}
              widthClass="w-56"
              highlighted
              editable={editable}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="flex justify-center items-center gap-2 mb-2">
          <span>รวมเวลาเรียน</span>
          <TextField
            name="totalHours"
            value={displayGeneralInfo.totalHours}
            widthClass="w-12"
            highlighted
            type="number"
            editable={editable}
            onChange={handleChange}
          />
          <span>ชั่วโมง/สัปดาห์</span>
          <TextField
            name="hoursPerSemester"
            value={displayGeneralInfo.hoursPerSemester}
            widthClass="w-12"
            muted
            editable={false}
            onChange={handleChange}
          />
          <span>ชั่วโมง/ภาคเรียน</span>
        </div>

        <div className="mb-2 flex items-center justify-center gap-2 text-center">
          <span className="shrink-0">ครูผู้สอน</span>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            {teacherFields.map((teacher, index) => (
              <span key={teacher.name} className="inline-flex items-center justify-center gap-1">
                {teacherFields.length > 1 ? <span>{index + 1}.</span> : null}
                <TextField
                  fit
                  name={teacher.name}
                  value={teacher.value}
                  widthClass={teacherFields.length === 1 ? "w-72" : teacherFields.length === 2 ? "w-48" : "w-36"}
                  highlighted
                  editable={editable}
                  onChange={handleChange}
                />
              </span>
            ))}
          </div>
        </div>

        <div className="flex justify-center items-center gap-1 mb-4">
          <span>ครูประจำชั้น 1.</span>
          <TextField
            fit
            name="homeroomTeacher1"
            value={displayGeneralInfo.homeroomTeacher1}
            widthClass="w-44"
            editable={editable}
            onChange={handleChange}
          />
          <span>2.</span>
          <TextField
            fit
            name="homeroomTeacher2"
            value={displayGeneralInfo.homeroomTeacher2}
            widthClass="w-44"
            editable={editable}
            onChange={handleChange}
          />
          <span>3.</span>
          <TextField
            fit
            name="homeroomTeacher3"
            value={displayGeneralInfo.homeroomTeacher3 || ""}
            widthClass="w-44"
            editable={editable}
            onChange={handleChange}
          />
        </div>

        <table className="pap5-cover-summary excel-table mb-4 mx-auto w-[90%] [&_th]:text-[12px] [&_td]:text-[12px] [&_th]:p-1 [&_td]:p-1 [&_tr]:h-10">
          <thead>
            <tr>
              <th rowSpan={3} className="leading-tight">
                จำนวน
                <br />
                นักเรียน
                <br />
                ทั้งหมด
              </th>
              <th colSpan={15}>สรุปผลการเรียน</th>
            </tr>
            <tr>
              <th colSpan={8}>จำนวนนักเรียนที่ได้รับระดับผลการเรียน</th>
              <th colSpan={2}>สรุป</th>
              <th rowSpan={2}>รายงานการประเมิน</th>
              <th colSpan={4} className="text-[10px] leading-tight">
                จำนวนนักเรียนที่ได้รับระดับคุณภาพ
              </th>
            </tr>
            <tr>
              {GRADE_KEYS.map((grade) => (
                <th key={grade}>{grade}</th>
              ))}
              <th>ผ</th>
              <th>มผ</th>
              <th className="text-[10px] leading-tight">
                ดีเยี่ยม
                <br />
                (3)
              </th>
              <th className="text-[10px] leading-tight">
                ดี
                <br />
                (2)
              </th>
              <th className="text-[10px] leading-tight">
                ผ่าน
                <br />
                (1)
              </th>
              <th className="text-[10px] leading-tight">
                ไม่ผ่าน
                <br />
                (0)
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{summary.totalStudents}</td>
              {GRADE_KEYS.map((grade) => (
                <td key={grade}>{summary.grades[grade]}</td>
              ))}
              <td>{summary.grades["ผ"]}</td>
              <td>{summary.grades["มผ"]}</td>
              <td className="whitespace-nowrap text-[10px]">การอ่านคิดวิเคราะห์และเขียน</td>
              {QUALITY_KEYS.map((quality) => (
                <td key={quality}>{summary.analytical[quality]}</td>
              ))}
            </tr>
            <tr>
              <td>%</td>
              {GRADE_KEYS.map((grade) => (
                <td key={grade}>{getPercent(summary.grades[grade])}</td>
              ))}
              <td>{summary.grades["ผ"]}</td>
              <td>{summary.grades["มผ"]}</td>
              <td className="whitespace-nowrap text-[10px]">คุณลักษณะอันพึงประสงค์</td>
              {QUALITY_KEYS.map((quality) => (
                <td key={quality}>{summary.attributes[quality]}</td>
              ))}
            </tr>
          </tbody>
        </table>

        <div className="pap5-signatures px-8 space-y-5">
          <div className="font-bold">การอนุมัติผลการเรียน</div>

          {teacherNames.length >= 2 ? (
            <TeacherSignatures names={teacherNames} />
          ) : (
            <SignatureLine
              label="ครูผู้สอน"
              name={teacherNamesText(displayGeneralInfo)}
            />
          )}
          <SignatureLine label="หัวหน้ากลุ่มสาระการเรียนรู้" name={displayGeneralInfo.headOfLearningArea} />
          <SignatureLine label="หัวหน้างานวัดและประเมินผล" name={displayGeneralInfo.headOfEvaluation} />

          <div className="font-bold mt-6">เรียนเสนอเพื่อพิจารณา</div>

          <SignatureLine label="รองผู้อำนวยการฝ่ายวิชาการ" name={displayGeneralInfo.deputyDirector} />

          <div className="flex justify-center gap-12 my-4">
            <ApprovalChoice
              checked={approvalStatus === "approved"}
              label="อนุมัติ"
            />
            <ApprovalChoice
              checked={approvalStatus === "revision_requested"}
              label="ไม่อนุมัติ"
            />
          </div>

          <div className="flex items-end justify-center">
            <div className="w-24 text-right pr-2">ลงชื่อ</div>
            <div className="w-56 border-b border-dotted border-slate-500" />
            <div className="w-56" />
          </div>
          <div className="flex items-center justify-center -mt-4">
            <div className="w-24" />
            <div className="w-56 text-center">( {displayGeneralInfo.schoolDirector} )</div>
            <div className="w-56" />
          </div>
          <div className="flex items-center justify-center -mt-4">
            <div className="w-24" />
            <div className="w-56 text-center whitespace-nowrap">ผู้อำนวยการ{schoolName}</div>
            <div className="w-56" />
          </div>
          <div className="flex items-center justify-center -mt-2">
            <div className="w-24" />
            <div className="w-56 flex justify-center">
              <DateField
                value={displayGeneralInfo.approvalDate}
                editable={editable}
                onChange={handleChange}
              />
            </div>
            <div className="w-56" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TeacherSignatures({ names }: { names: [string, string] | string[] }) {
  return (
    <div className={`pap5-teacher-signatures grid ${names.length >= 3 ? "grid-cols-3 gap-x-4" : "grid-cols-2 gap-x-8"}`}>
      {names.slice(0, 3).map((name, index) => (
        <div key={`${name}-${index}`} className="min-w-0">
          <div className="flex items-end">
            <div className="shrink-0 pr-1 text-right">ลงชื่อ</div>
            <div className="min-w-0 flex-1 border-b border-dotted border-slate-500" />
          </div>
          <div className="text-center text-[13px] leading-tight">( {name} )</div>
          <div className="pl-12 text-center text-[13px] leading-tight">
            ครูผู้สอน
          </div>
        </div>
      ))}
    </div>
  );
}

function SignatureLine({ label, name }: { label: string; name: string | undefined }) {
  return (
    <>
      <div className="flex items-end justify-center">
        <div className="w-24 text-right pr-2">ลงชื่อ</div>
        <div className="w-56 border-b border-dotted border-slate-500" />
        <div className="w-56 pl-2 text-left">{label}</div>
      </div>
      <div className="flex items-center justify-center -mt-4">
        <div className="w-24" />
        <div className="w-56 text-center">( {name || ""} )</div>
        <div className="w-56" />
      </div>
    </>
  );
}

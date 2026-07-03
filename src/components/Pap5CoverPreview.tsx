import React from "react";
import { Check } from "lucide-react";
import { applyPap5OfficialDisplayDefaults } from "../lib/pap5Officials";
import type { AppData, GradebookApprovalStatus } from "../types";

type GeneralInfo = AppData["generalInfo"];
type CoverMode = "edit" | "print";

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

type GradeKey = (typeof GRADE_KEYS)[number] | "ผ" | "มผ";
type QualityKey = (typeof QUALITY_KEYS)[number];

function buildHomeroomTeachersText(data: GeneralInfo): string {
  return [data.homeroomTeacher1, data.homeroomTeacher2, data.homeroomTeacher3]
    .map((name, index) => (name ? `${index + 1}. ${name}` : ""))
    .filter(Boolean)
    .join(" ");
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

function formatThaiNumericDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "";
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year + 543}`;
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
  type = "text",
  onChange,
}: {
  name: keyof GeneralInfo;
  value: string | number | undefined;
  widthClass: string;
  editable: boolean;
  highlighted?: boolean;
  muted?: boolean;
  type?: "text" | "number";
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const backgroundClass = highlighted ? "bg-yellow-excel" : muted ? "bg-slate-50" : "bg-white";
  const className = fieldBaseClass(`${backgroundClass} ${widthClass}`);
  const displayValue = value === undefined || value === null ? "" : String(value);

  if (!editable) {
    return <span className={`${className} inline-block min-h-[20px] px-1`}>{displayValue}</span>;
  }

  return (
    <input
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
    return <span className={`${className} inline-block min-h-[20px] px-1`}>{value}</span>;
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
      <span className="inline-flex min-h-[31px] w-[138px] items-center justify-center rounded border border-slate-300 px-2 py-1 text-center text-sm">
        {formatThaiNumericDate(value)}
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

        <div className="text-center font-bold text-sm">แบบบันทึกผลการเรียนรายวิชา</div>
        <div className="text-center font-bold text-sm">
          ตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551
        </div>
        <div className="text-center font-bold text-sm">{schoolName}</div>
        <div className="text-center font-bold text-sm mb-4">{agencyName}</div>

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

        <div className="flex justify-center items-center gap-2 mb-2">
          <span>ครูผู้สอน 1.</span>
          <TextField
            name="teacherName"
            value={displayGeneralInfo.teacherName}
            widthClass="w-48"
            highlighted
            editable={editable}
            onChange={handleChange}
          />
          <span>2.</span>
          <TextField
            name="teacherName2"
            value={displayGeneralInfo.teacherName2 || ""}
            widthClass="w-48"
            highlighted
            editable={editable}
            onChange={handleChange}
          />
        </div>

        <div className="flex justify-center items-center gap-2 mb-4">
          <span>ครูประจำชั้น 1.</span>
          <TextField
            name="homeroomTeacher1"
            value={displayGeneralInfo.homeroomTeacher1}
            widthClass="w-36"
            editable={editable}
            onChange={handleChange}
          />
          <span>2.</span>
          <TextField
            name="homeroomTeacher2"
            value={displayGeneralInfo.homeroomTeacher2}
            widthClass="w-36"
            editable={editable}
            onChange={handleChange}
          />
          <span>3.</span>
          <TextField
            name="homeroomTeacher3"
            value={displayGeneralInfo.homeroomTeacher3 || ""}
            widthClass="w-36"
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

          <SignatureLine
            label="ครูผู้สอน"
            name={
              displayGeneralInfo.teacherName2
                ? `1. ${displayGeneralInfo.teacherName}  2. ${displayGeneralInfo.teacherName2}`
                : displayGeneralInfo.teacherName
            }
          />
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

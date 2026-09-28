import React from "react";
import { ApprovalChoice, SignatureLine } from "../Pap5CoverPreview";
import {
  activityCoverSummary,
  activityHomeroomTeachers,
  longClassroomName,
  thaiFullDate,
  type ActivityApprovalStatus,
  type StudentActivityData,
} from "../../lib/studentActivities";

const DEFAULT_LOGO_URL = "/logo3.png";

function CoverValue({ children, widthClass }: { children: React.ReactNode; widthClass: string }) {
  return (
    <span
      className={`pap5-cover-value pap5-cover-fill-line inline-flex min-h-[20px] items-center justify-center px-1 text-center font-bold ${widthClass}`}
    >
      {children}
    </span>
  );
}

/** ช่องลงชื่อครูประจำชั้นหลายคนเรียงแนวนอน ใช้ขนาดตัวอักษรและระยะบรรทัดเดียวกับช่องลงชื่ออื่นบนปก */
function HomeroomSignatures({ names }: { names: string[] }) {
  return (
    <div className={`grid ${names.length >= 3 ? "grid-cols-3 gap-x-6" : "grid-cols-2 gap-x-12 px-6"}`}>
      {names.slice(0, 3).map((name, index) => (
        <div key={`${name}-${index}`} className="min-w-0">
          <div className="flex items-end">
            <span className="shrink-0 pr-1">ลงชื่อ</span>
            <span className="min-w-0 flex-1 border-b border-dotted border-slate-500" />
          </div>
          <div className="mt-1.5 truncate text-center">( {name} )</div>
          <div className="mt-1 text-center">ครูประจำชั้น</div>
        </div>
      ))}
    </div>
  );
}

interface ActivityCoverPreviewProps {
  data: StudentActivityData;
  approvalStatus?: ActivityApprovalStatus | null;
  mode?: "display" | "print";
}

/** หน้าปกแบบบันทึกผลการเรียนกิจกรรมพัฒนาผู้เรียน (แสดงผลอัตโนมัติจากข้อมูลในเล่ม) */
export function ActivityCoverPreview({ data, approvalStatus = null, mode = "display" }: ActivityCoverPreviewProps) {
  const info = data.generalInfo;
  const summary = activityCoverSummary(data);
  const homeroomTeachers = activityHomeroomTeachers(info);
  const logoUrl = info.logoUrl || DEFAULT_LOGO_URL;
  const shellClass =
    mode === "print"
      ? "pap5-cover-shell pap5-cover-shell-print flex justify-center bg-white p-0"
      : "pap5-cover-shell flex justify-center overflow-auto rounded-2xl bg-slate-100/90 p-4 sm:p-6";

  return (
    <div className={shellClass}>
      <div
        className="pap5-cover-page relative rounded-lg bg-white p-8 text-sm shadow-[0_12px_32px_-8px_rgb(15,23,42,0.12)] ring-1 ring-slate-200/80"
        style={{ width: "794px", minHeight: "1123px", fontFamily: '"TH Sarabun PSK", Sarabun' }}
      >
        <div className="mb-2 flex justify-center">
          <img
            src={logoUrl}
            alt="School Logo"
            className="h-24 w-24 object-contain"
            onError={(event) => {
              const target = event.target as HTMLImageElement;
              if (!target.src.endsWith(DEFAULT_LOGO_URL)) target.src = DEFAULT_LOGO_URL;
            }}
          />
        </div>

        <div className="pap5-cover-title-block mb-4">
          <div className="text-center text-sm font-bold">แบบบันทึกผลการเรียนกิจกรรมพัฒนาผู้เรียน</div>
          <div className="text-center text-sm font-bold">
            ตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551
          </div>
          <div className="text-center font-bold">
            <span className="text-[18px] leading-7">{info.schoolName}</span>
          </div>
          <div className="text-center text-sm font-bold">{info.agencyName}</div>
        </div>

        <div className="mb-2 flex items-center justify-center gap-2">
          <span>ชั้น</span>
          <CoverValue widthClass="min-w-[176px]">{longClassroomName(info.gradeLevel)}</CoverValue>
          <span className="ml-4">ปีการศึกษา</span>
          <CoverValue widthClass="w-20">{info.academicYear}</CoverValue>
        </div>

        <div className="mb-2 flex items-center justify-center gap-2">
          <span>รวมเวลาเรียน</span>
          <CoverValue widthClass="w-12">{info.hoursPerWeek}</CoverValue>
          <span>ชั่วโมง/สัปดาห์</span>
          <CoverValue widthClass="w-14">{info.hoursPerYear}</CoverValue>
          <span>ชั่วโมง/ปี</span>
        </div>

        <div className="mb-4 flex items-center justify-center gap-2 text-center">
          <span className="shrink-0">ครูประจำชั้น</span>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            {(homeroomTeachers.length ? homeroomTeachers : [""]).map((name, index) => (
              <span key={`${name}-${index}`} className="inline-flex items-center justify-center gap-1">
                {homeroomTeachers.length > 1 ? <span>{index + 1}.</span> : null}
                <CoverValue
                  widthClass={homeroomTeachers.length <= 1 ? "w-72" : homeroomTeachers.length === 2 ? "w-56" : "w-44"}
                >
                  {name}
                </CoverValue>
              </span>
            ))}
          </div>
        </div>

        <table className="pap5-cover-summary excel-table mx-auto mb-5 w-[82%] [&_td]:p-1 [&_td]:text-[13px] [&_th]:p-1 [&_th]:text-[13px] [&_tr]:h-10">
          <thead>
            <tr>
              <th rowSpan={2} className="w-[22%] leading-tight">
                จำนวน
                <br />
                นักเรียนทั้งหมด
              </th>
              <th colSpan={2}>สรุปผลการประเมิน (จำนวนคน)</th>
              <th rowSpan={2} className="w-[18%]">ร้อยละ</th>
              <th rowSpan={2} className="w-[24%]">หมายเหตุ</th>
            </tr>
            <tr>
              <th>ผ่าน</th>
              <th>ไม่ผ่าน</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{summary.totalStudents}</td>
              <td>{summary.passed}</td>
              <td>{summary.failed}</td>
              <td>{summary.passedPercent}</td>
              <td className="text-[12px] text-slate-600">
                {summary.pending > 0 ? `ยังไม่ครบ ${summary.pending} คน` : ""}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="pap5-signatures space-y-5 px-8">
          <div className="font-bold">การอนุมัติผลการเรียน</div>

          {homeroomTeachers.length >= 2 ? (
            <HomeroomSignatures names={homeroomTeachers} />
          ) : (
            <SignatureLine label="ครูประจำชั้น" name={homeroomTeachers[0]} />
          )}
          <SignatureLine label="หัวหน้ากิจกรรมพัฒนาผู้เรียน" name={info.headOfActivities} />
          <SignatureLine label="หัวหน้างานวัดและประเมินผล" name={info.headOfEvaluation} />

          <div className="mt-6 font-bold">เรียนเสนอเพื่อพิจารณา</div>

          <SignatureLine label="รองผู้อำนวยการฝ่ายวิชาการ" name={info.deputyDirector} />

          <div className="my-4 flex justify-center gap-12">
            <ApprovalChoice checked={approvalStatus === "approved"} label="อนุมัติ" />
            <ApprovalChoice checked={approvalStatus === "revision_requested"} label="ไม่อนุมัติ" />
          </div>

          <div className="flex items-end justify-center">
            <div className="w-24 pr-2 text-right">ลงชื่อ</div>
            <div className="w-56 border-b border-dotted border-slate-500" />
            <div className="w-56" />
          </div>
          <div className="-mt-4 flex items-center justify-center">
            <div className="w-24" />
            <div className="w-56 text-center">( {info.schoolDirector} )</div>
            <div className="w-56" />
          </div>
          <div className="-mt-4 flex items-center justify-center">
            <div className="w-24" />
            <div className="w-56 whitespace-nowrap text-center">ผู้อำนวยการ{info.schoolName}</div>
            <div className="w-56" />
          </div>
          <div className="-mt-2 flex items-center justify-center">
            <div className="w-24" />
            <div className="flex w-56 justify-center">
              <span className="inline-flex min-h-[24px] min-w-[150px] items-center justify-center px-2 py-0.5 text-center text-sm font-bold">
                {thaiFullDate(info.approvalDate)}
              </span>
            </div>
            <div className="w-56" />
          </div>
        </div>
      </div>
    </div>
  );
}

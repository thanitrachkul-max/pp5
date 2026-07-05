import React from "react";
import { AnalyticalForm } from "./AnalyticalForm";
import { Attributes5_8Form } from "./Attributes5_8Form";
import { AttributesForm } from "./AttributesForm";
import { IndicatorsForm } from "./IndicatorsForm";
import { Instructions1Form } from "./Instructions1Form";
import { Instructions2Form } from "./Instructions2Form";
import { Pap5CoverPreview } from "./Pap5CoverPreview";
import { ScoresForm } from "./ScoresForm";
import { StudentsForm } from "./StudentsForm";
import type { AppData, GradebookApprovalStatus } from "../types";

interface PrintAllPap5DocumentProps {
  data: AppData;
  approvalStatus?: GradebookApprovalStatus | null;
}

export function getAttendanceMonthRanges(generalInfo: AppData["generalInfo"]) {
  if (generalInfo.semester === "2") {
    return [
      { label: "ต.ค. - ธ.ค.", months: [10, 11, 12] },
      { label: "ม.ค. - มี.ค.", months: [1, 2, 3] },
    ];
  }

  return [
    { label: "พ.ค. - ก.ค.", months: [5, 6, 7] },
    { label: "ส.ค. - ก.ย.", months: [8, 9] },
  ];
}

const noop = () => {};

function CoverOriginalPrintPage({
  data,
  approvalStatus,
}: {
  data: AppData;
  approvalStatus?: GradebookApprovalStatus | null;
}) {
  return (
    <section className="print-page portrait cover-print-page">
      <Pap5CoverPreview
        data={data.generalInfo}
        appData={data}
        approvalStatus={approvalStatus}
        mode="print"
      />
    </section>
  );
}

function AttendanceOriginalPrintPage({
  data,
  months,
}: {
  data: AppData;
  months: number[];
}) {
  return (
    <section className="print-page landscape attendance-print-page original-tab-print-page">
      <StudentsForm
        data={data.students}
        generalInfo={data.generalInfo}
        attendance={data.attendance}
        printMode
        printDateMonths={months}
        onChange={noop}
        onAttendanceChange={noop}
      />
    </section>
  );
}

function ScoreOriginalPrintPage({ data }: { data: AppData }) {
  return (
    <section className="print-page landscape score-print-page original-tab-print-page">
      <ScoresForm
        students={data.students}
        data={data.scores}
        generalInfo={data.generalInfo}
        scoreConfig={data.scoreConfig}
        printMode
        onChange={noop}
        onConfigChange={noop}
        onClearScoresAndConfig={noop}
      />
    </section>
  );
}

function AttributesOriginalPrintPage({
  data,
  range,
}: {
  data: AppData;
  range: "1-4" | "5-8";
}) {
  const Form = range === "1-4" ? AttributesForm : Attributes5_8Form;

  return (
    <section className="print-page landscape attribute-print-page original-tab-print-page">
      <Form
        students={data.students}
        data={data.attributes}
        generalInfo={data.generalInfo}
        printMode
        onChange={noop}
      />
    </section>
  );
}

function AnalyticalOriginalPrintPage({ data }: { data: AppData }) {
  return (
    <section className="print-page landscape analytical-print-page original-tab-print-page">
      <AnalyticalForm
        students={data.students}
        data={data.analytical}
        generalInfo={data.generalInfo}
        printMode
        onChange={noop}
      />
    </section>
  );
}

function IndicatorOriginalPrintPage({ data }: { data: AppData }) {
  return (
    <section className="print-page landscape indicator-print-page original-tab-print-page">
      <IndicatorsForm
        data={data.indicators}
        scoreConfig={data.scoreConfig}
        generalInfo={data.generalInfo}
        printMode
        onChange={noop}
      />
    </section>
  );
}

function ExplanationOriginalPrintPage({ page }: { page: "first" | "next" }) {
  return (
    <section className="print-page portrait explanation-print-page">
      {page === "first" ? <Instructions1Form /> : <Instructions2Form />}
    </section>
  );
}

export function PrintAllPap5Document({
  data,
  approvalStatus = null,
}: PrintAllPap5DocumentProps) {
  const attendanceRanges = getAttendanceMonthRanges(data.generalInfo);

  return (
    <div className="print-document pap5-original-print-document">
      <CoverOriginalPrintPage data={data} approvalStatus={approvalStatus} />

      {attendanceRanges.map((range) => (
        <React.Fragment key={range.label}>
          <AttendanceOriginalPrintPage data={data} months={range.months} />
        </React.Fragment>
      ))}

      <ScoreOriginalPrintPage data={data} />
      <AttributesOriginalPrintPage data={data} range="1-4" />
      <AttributesOriginalPrintPage data={data} range="5-8" />
      <AnalyticalOriginalPrintPage data={data} />
      <IndicatorOriginalPrintPage data={data} />
      <ExplanationOriginalPrintPage page="first" />
      <ExplanationOriginalPrintPage page="next" />
    </div>
  );
}

export function Pap5SingleOriginalPrintPage({
  data,
  approvalStatus = null,
  pageId,
}: {
  data: AppData;
  approvalStatus?: GradebookApprovalStatus | null;
  pageId: string;
}) {
  const attendanceRanges = getAttendanceMonthRanges(data.generalInfo);
  const page =
    pageId === "cover" ? (
      <CoverOriginalPrintPage data={data} approvalStatus={approvalStatus} />
    ) : pageId === "attendance-1" ? (
      <AttendanceOriginalPrintPage data={data} months={attendanceRanges[0].months} />
    ) : pageId === "attendance-2" ? (
      <AttendanceOriginalPrintPage data={data} months={attendanceRanges[1].months} />
    ) : pageId === "scores" ? (
      <ScoreOriginalPrintPage data={data} />
    ) : pageId === "attributes-1-4" ? (
      <AttributesOriginalPrintPage data={data} range="1-4" />
    ) : pageId === "attributes-5-8" ? (
      <AttributesOriginalPrintPage data={data} range="5-8" />
    ) : pageId === "analytical" ? (
      <AnalyticalOriginalPrintPage data={data} />
    ) : pageId === "indicators" ? (
      <IndicatorOriginalPrintPage data={data} />
    ) : pageId === "explanation" ? (
      <ExplanationOriginalPrintPage page="first" />
    ) : pageId === "explanation-next" ? (
      <ExplanationOriginalPrintPage page="next" />
    ) : (
      <CoverOriginalPrintPage data={data} approvalStatus={approvalStatus} />
    );

  return <div className="print-document pap5-original-print-document">{page}</div>;
}

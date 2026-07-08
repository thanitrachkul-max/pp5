import React from "react";
import { AnalyticalForm } from "./AnalyticalForm";
import { Attributes5_8Form } from "./Attributes5_8Form";
import { AttributesForm } from "./AttributesForm";
import { IndicatorsForm } from "./IndicatorsForm";
import { Instructions1Form } from "./Instructions1Form";
import { Instructions2Form } from "./Instructions2Form";
import { Pap5CoverPreview } from "./Pap5CoverPreview";
import {
  Pap5AttendanceSummaryPrintPage,
  Pap5ScoreSummaryPrintPage,
} from "./Pap5PrintSummaryPages";
import { ScoresForm } from "./ScoresForm";
import { StudentsForm } from "./StudentsForm";
import type { AppData, GradebookApprovalStatus } from "../types";
import {
  getAttendancePrintMonthRanges,
  getPap5PrintPageSpecs,
  getScoreSummaryPrintRanges,
  type ScoreSummaryPrintRange,
} from "../utils/pap5PrintLayout";

interface PrintAllPap5DocumentProps {
  data: AppData;
  approvalStatus?: GradebookApprovalStatus | null;
}

const noop = () => {};

function PrintPageNumber({ pageNumber }: { pageNumber?: number }) {
  if (!pageNumber) return null;
  return <span className="pap5-page-number">หน้า {pageNumber}</span>;
}

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
  fillToWeeks,
  pageNumber,
}: {
  data: AppData;
  months: number[];
  fillToWeeks?: number;
  pageNumber?: number;
}) {
  return (
    <section className="print-page landscape attendance-print-page original-tab-print-page">
      <PrintPageNumber pageNumber={pageNumber} />
      <StudentsForm
        data={data.students}
        generalInfo={data.generalInfo}
        attendance={data.attendance}
        printMode
        printDateMonths={months}
        printFillToWeeks={fillToWeeks}
        onChange={noop}
        onAttendanceChange={noop}
      />
    </section>
  );
}

function AttendanceSummaryOriginalPrintPage({ data, pageNumber }: { data: AppData; pageNumber?: number }) {
  return (
    <section className="print-page landscape summary-print-page attendance-summary-print-page">
      <PrintPageNumber pageNumber={pageNumber} />
      <Pap5AttendanceSummaryPrintPage data={data} />
    </section>
  );
}

function ScoreOriginalPrintPage({ data, pageNumber }: { data: AppData; pageNumber?: number }) {
  return (
    <section className="print-page landscape score-print-page original-tab-print-page">
      <PrintPageNumber pageNumber={pageNumber} />
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

function ScoreSummaryOriginalPrintPage({
  data,
  range,
  pageNumber,
}: {
  data: AppData;
  range: ScoreSummaryPrintRange;
  pageNumber?: number;
}) {
  return (
    <section className="print-page landscape summary-print-page score-summary-print-page">
      <PrintPageNumber pageNumber={pageNumber} />
      <Pap5ScoreSummaryPrintPage data={data} range={range} />
    </section>
  );
}

function AttributesOriginalPrintPage({
  data,
  range,
  pageNumber,
}: {
  data: AppData;
  range: "1-4" | "5-8";
  pageNumber?: number;
}) {
  const Form = range === "1-4" ? AttributesForm : Attributes5_8Form;

  return (
    <section className="print-page landscape attribute-print-page original-tab-print-page">
      <PrintPageNumber pageNumber={pageNumber} />
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

function AnalyticalOriginalPrintPage({ data, pageNumber }: { data: AppData; pageNumber?: number }) {
  return (
    <section className="print-page landscape analytical-print-page original-tab-print-page">
      <PrintPageNumber pageNumber={pageNumber} />
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

function IndicatorOriginalPrintPage({ data, pageNumber }: { data: AppData; pageNumber?: number }) {
  return (
    <section className="print-page landscape indicator-print-page original-tab-print-page">
      <PrintPageNumber pageNumber={pageNumber} />
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

function ExplanationOriginalPrintPage({ page, pageNumber }: { page: "first" | "next"; pageNumber?: number }) {
  return (
    <section className="print-page portrait explanation-print-page">
      <PrintPageNumber pageNumber={pageNumber} />
      {page === "first" ? <Instructions1Form /> : <Instructions2Form />}
    </section>
  );
}

export function PrintAllPap5Document({
  data,
  approvalStatus = null,
}: PrintAllPap5DocumentProps) {
  const attendanceRanges = getAttendancePrintMonthRanges(data.generalInfo);
  const scoreSummaryRanges = getScoreSummaryPrintRanges(data);
  let nextPageNumber = 2;

  return (
    <div className="print-document pap5-original-print-document">
      <CoverOriginalPrintPage data={data} approvalStatus={approvalStatus} />

      {attendanceRanges.map((range) => (
        <React.Fragment key={range.label}>
          <AttendanceOriginalPrintPage
            data={data}
            months={range.months}
            fillToWeeks={range.fillToWeeks}
            pageNumber={nextPageNumber++}
          />
        </React.Fragment>
      ))}

      <AttendanceSummaryOriginalPrintPage data={data} pageNumber={nextPageNumber++} />
      <ScoreOriginalPrintPage data={data} pageNumber={nextPageNumber++} />
      {scoreSummaryRanges.map((range) => (
        <React.Fragment key={range.id}>
          <ScoreSummaryOriginalPrintPage data={data} range={range} pageNumber={nextPageNumber++} />
        </React.Fragment>
      ))}
      <AttributesOriginalPrintPage data={data} range="1-4" pageNumber={nextPageNumber++} />
      <AttributesOriginalPrintPage data={data} range="5-8" pageNumber={nextPageNumber++} />
      <AnalyticalOriginalPrintPage data={data} pageNumber={nextPageNumber++} />
      <IndicatorOriginalPrintPage data={data} pageNumber={nextPageNumber++} />
      <ExplanationOriginalPrintPage page="first" pageNumber={nextPageNumber++} />
      <ExplanationOriginalPrintPage page="next" pageNumber={nextPageNumber++} />
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
  const attendanceRanges = getAttendancePrintMonthRanges(data.generalInfo);
  const attendancePage = attendanceRanges.find((range) => range.id === pageId);
  const scoreSummaryRange = getScoreSummaryPrintRanges(data).find((range) => range.id === pageId);
  const pageIndex = getPap5PrintPageSpecs(data).findIndex((spec) => spec.id === pageId);
  const pageNumber = pageIndex > 0 ? pageIndex + 1 : undefined;
  const page =
    pageId === "cover" ? (
      <CoverOriginalPrintPage data={data} approvalStatus={approvalStatus} />
    ) : attendancePage ? (
      <AttendanceOriginalPrintPage
        data={data}
        months={attendancePage.months}
        fillToWeeks={attendancePage.fillToWeeks}
        pageNumber={pageNumber}
      />
    ) : pageId === "attendance-summary" ? (
      <AttendanceSummaryOriginalPrintPage data={data} pageNumber={pageNumber} />
    ) : pageId === "scores" ? (
      <ScoreOriginalPrintPage data={data} pageNumber={pageNumber} />
    ) : scoreSummaryRange ? (
      <ScoreSummaryOriginalPrintPage data={data} range={scoreSummaryRange} pageNumber={pageNumber} />
    ) : pageId === "attributes-1-4" ? (
      <AttributesOriginalPrintPage data={data} range="1-4" pageNumber={pageNumber} />
    ) : pageId === "attributes-5-8" ? (
      <AttributesOriginalPrintPage data={data} range="5-8" pageNumber={pageNumber} />
    ) : pageId === "analytical" ? (
      <AnalyticalOriginalPrintPage data={data} pageNumber={pageNumber} />
    ) : pageId === "indicators" ? (
      <IndicatorOriginalPrintPage data={data} pageNumber={pageNumber} />
    ) : pageId === "explanation" ? (
      <ExplanationOriginalPrintPage page="first" pageNumber={pageNumber} />
    ) : pageId === "explanation-next" ? (
      <ExplanationOriginalPrintPage page="next" pageNumber={pageNumber} />
    ) : (
      <CoverOriginalPrintPage data={data} approvalStatus={approvalStatus} />
    );

  return <div className="print-document pap5-original-print-document">{page}</div>;
}

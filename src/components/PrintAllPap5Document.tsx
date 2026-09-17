import { PrimaryScoresForm } from "./PrimaryScoresForm";
import { PrimaryAssessmentForm } from "./PrimaryAssessmentForm";
import { isPrimaryGrade, primaryCombinedConfig } from "../lib/primaryYear";
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
  getPrimaryScorePrintRanges,
  getAnalyticalPrintRanges,
  getAttendancePrintMonthRanges,
  getAttributePrintRanges,
  getPap5PrintPageSpecs,
  getScoreSummaryPrintRanges,
  type ScoreSummaryPrintRange,
  type StudentEvaluationPrintRange,
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

function ScoreOriginalPrintPage({ data, pageNumber, offset = 0 }: { data: AppData; pageNumber?: number; offset?: number }) {
  return (
    <section className="print-page landscape score-print-page original-tab-print-page">
      <PrintPageNumber pageNumber={pageNumber} />
      {isPrimaryGrade(data.generalInfo.gradeLevel) ? <PrimaryScoresForm data={data} printMode offset={offset} onChange={noop} /> : <ScoresForm
        students={data.students}
        data={data.scores}
        generalInfo={data.generalInfo}
        scoreConfig={data.scoreConfig}
        printMode
        onChange={noop}
        onConfigChange={noop}
        onClearScoresAndConfig={noop}
      />}
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
  studentRange,
  pageNumber,
}: {
  data: AppData;
  range: "1-4" | "5-8";
  studentRange: StudentEvaluationPrintRange;
  pageNumber?: number;
}) {
  const Form = range === "1-4" ? AttributesForm : Attributes5_8Form;
  const students = data.students.slice(
    studentRange.studentStartIndex,
    studentRange.studentEndIndex,
  );
  const printPageNote = studentRange.totalPages > 1
    ? `หน้า ${studentRange.pageNumber}/${studentRange.totalPages}`
    : undefined;

  return (
    <section className="print-page landscape attribute-print-page original-tab-print-page">
      <PrintPageNumber pageNumber={pageNumber} />
      {isPrimaryGrade(data.generalInfo.gradeLevel) ? <PrimaryAssessmentForm data={{ ...data, students }} kind={range} printMode offset={studentRange.studentStartIndex} onChange={noop} /> : <Form
        students={students}
        data={data.attributes}
        generalInfo={data.generalInfo}
        printMode
        printStudentNumberOffset={studentRange.studentStartIndex}
        printPageNote={printPageNote}
        onChange={noop}
      />}
    </section>
  );
}

function AnalyticalOriginalPrintPage({
  data,
  studentRange,
  pageNumber,
}: {
  data: AppData;
  studentRange: StudentEvaluationPrintRange;
  pageNumber?: number;
}) {
  const students = data.students.slice(
    studentRange.studentStartIndex,
    studentRange.studentEndIndex,
  );
  const printPageNote = studentRange.totalPages > 1
    ? `หน้า ${studentRange.pageNumber}/${studentRange.totalPages}`
    : undefined;

  return (
    <section className="print-page landscape analytical-print-page original-tab-print-page">
      <PrintPageNumber pageNumber={pageNumber} />
      {isPrimaryGrade(data.generalInfo.gradeLevel) ? <PrimaryAssessmentForm data={{ ...data, students }} kind="analytical" printMode offset={studentRange.studentStartIndex} onChange={noop} /> : <AnalyticalForm
        students={students}
        data={data.analytical}
        generalInfo={data.generalInfo}
        printMode
        printStudentNumberOffset={studentRange.studentStartIndex}
        printPageNote={printPageNote}
        onChange={noop}
      />}
    </section>
  );
}

function IndicatorOriginalPrintPage({ data, pageNumber }: { data: AppData; pageNumber?: number }) {
  return (
    <section className="print-page landscape indicator-print-page original-tab-print-page">
      <PrintPageNumber pageNumber={pageNumber} />
      <IndicatorsForm
        data={data.indicators}
        scoreConfig={primaryCombinedConfig(data)}
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
  const scoreSummaryRanges = isPrimaryGrade(data.generalInfo.gradeLevel) ? [] : getScoreSummaryPrintRanges(data);
  const attributeOneToFourRanges = getAttributePrintRanges(data, "1-4");
  const attributeFiveToEightRanges = getAttributePrintRanges(data, "5-8");
  const analyticalRanges = getAnalyticalPrintRanges(data);
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
      {isPrimaryGrade(data.generalInfo.gradeLevel) ? getPrimaryScorePrintRanges(data).map(range => (
        <React.Fragment key={range.id}><ScoreOriginalPrintPage data={{ ...data, students: data.students.slice(range.studentStartIndex, range.studentEndIndex) }} offset={range.studentStartIndex} pageNumber={nextPageNumber++} /></React.Fragment>
      )) : <ScoreOriginalPrintPage data={data} pageNumber={nextPageNumber++} />}
      {scoreSummaryRanges.map((range) => (
        <React.Fragment key={range.id}>
          <ScoreSummaryOriginalPrintPage data={data} range={range} pageNumber={nextPageNumber++} />
        </React.Fragment>
      ))}
      {attributeOneToFourRanges.map((range) => (
        <React.Fragment key={range.id}>
          <AttributesOriginalPrintPage
            data={data}
            range="1-4"
            studentRange={range}
            pageNumber={nextPageNumber++}
          />
        </React.Fragment>
      ))}
      {attributeFiveToEightRanges.map((range) => (
        <React.Fragment key={range.id}>
          <AttributesOriginalPrintPage
            data={data}
            range="5-8"
            studentRange={range}
            pageNumber={nextPageNumber++}
          />
        </React.Fragment>
      ))}
      {analyticalRanges.map((range) => (
        <React.Fragment key={range.id}>
          <AnalyticalOriginalPrintPage
            data={data}
            studentRange={range}
            pageNumber={nextPageNumber++}
          />
        </React.Fragment>
      ))}
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
  const primaryScoreRange = getPrimaryScorePrintRanges(data).find(range => range.id === pageId);
  const attendancePage = attendanceRanges.find((range) => range.id === pageId);
  const scoreSummaryRange = getScoreSummaryPrintRanges(data).find((range) => range.id === pageId);
  const attributeOneToFourRange = getAttributePrintRanges(data, "1-4").find((range) => range.id === pageId);
  const attributeFiveToEightRange = getAttributePrintRanges(data, "5-8").find((range) => range.id === pageId);
  const analyticalRange = getAnalyticalPrintRanges(data).find((range) => range.id === pageId);
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
    ) : primaryScoreRange ? (
      <ScoreOriginalPrintPage data={{ ...data, students: data.students.slice(primaryScoreRange.studentStartIndex, primaryScoreRange.studentEndIndex) }} offset={primaryScoreRange.studentStartIndex} pageNumber={pageNumber} />
    ) : pageId === "scores" ? (
      <ScoreOriginalPrintPage data={data} pageNumber={pageNumber} />
    ) : scoreSummaryRange ? (
      <ScoreSummaryOriginalPrintPage data={data} range={scoreSummaryRange} pageNumber={pageNumber} />
    ) : attributeOneToFourRange ? (
      <AttributesOriginalPrintPage data={data} range="1-4" studentRange={attributeOneToFourRange} pageNumber={pageNumber} />
    ) : attributeFiveToEightRange ? (
      <AttributesOriginalPrintPage data={data} range="5-8" studentRange={attributeFiveToEightRange} pageNumber={pageNumber} />
    ) : analyticalRange ? (
      <AnalyticalOriginalPrintPage data={data} studentRange={analyticalRange} pageNumber={pageNumber} />
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

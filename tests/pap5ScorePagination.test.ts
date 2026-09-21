import assert from "node:assert/strict";
import test from "node:test";
import type { AppData, ScoreUnit } from "../src/types";
import {
  getPap5PrintPageSpecs,
  getScoreDetailPrintRanges,
  getScoreSummaryPrintRanges,
} from "../src/utils/pap5PrintLayout";

function makeData(unitCount: number): AppData {
  const units: ScoreUnit[] = Array.from({ length: unitCount }, (_, index) => ({
    name: `หน่วย ${index + 1}`,
    indicators: [{ code: `ว ${index + 1}`, fullScore: 7, passingScore: 3 }],
  }));

  return {
    generalInfo: { gradeLevel: "ม.1/1", semester: "1", academicYear: "2569" },
    students: [{ id: "student-1", studentId: "1", name: "นักเรียน ทดสอบ" }],
    scoreConfig: {
      learningArea: "วิทยาศาสตร์",
      subjectName: "วิทยาศาสตร์",
      standard: "ว 1.1",
      selectedIndicators: [],
      units,
    },
    scores: {},
  } as AppData;
}

test("score detail pages contain at most three learning units", () => {
  assert.deepEqual(
    getScoreDetailPrintRanges(makeData(10)).map((range) => [
      range.id,
      range.startUnitIndex,
      range.endUnitIndex,
    ]),
    [
      ["scores", 0, 3],
      ["scores-2", 3, 6],
      ["scores-3", 6, 9],
      ["scores-4", 9, 10],
    ],
  );
});

test("score summary stays on one page through eight units", () => {
  assert.deepEqual(
    getScoreSummaryPrintRanges(makeData(8)).map((range) => [
      range.startUnitIndex,
      range.endUnitIndex,
    ]),
    [[0, 8]],
  );
});

test("score summary uses five units first and at most three on following pages above eight units", () => {
  assert.deepEqual(
    getScoreSummaryPrintRanges(makeData(10)).map((range) => [
      range.startUnitIndex,
      range.endUnitIndex,
    ]),
    [
      [0, 5],
      [5, 8],
      [8, 10],
    ],
  );
});

test("PDF page specs include every score detail page before score summaries", () => {
  const scorePageIds = getPap5PrintPageSpecs(makeData(10))
    .map((spec) => spec.id)
    .filter((id) => id === "scores" || id.startsWith("scores-") || id.startsWith("score-summary-"));

  assert.deepEqual(scorePageIds, [
    "scores",
    "scores-2",
    "scores-3",
    "scores-4",
    "score-summary-1",
    "score-summary-2",
    "score-summary-3",
  ]);
});

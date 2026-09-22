import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

test("secondary score summary student rows are another 50 percent taller", () => {
  assert.match(css, /score-summary-student-row > td \{[\s\S]*?padding:\s*19\.25px 5px\s*!important/);
  assert.match(css, /\.pap5-score-summary-table tbody \{[\s\S]*?transform:\s*scaleY\(0\.5\)/);
  assert.match(css, /\.score-summary-cell-content \{[\s\S]*?transform:\s*scaleY\(2\)/);
});

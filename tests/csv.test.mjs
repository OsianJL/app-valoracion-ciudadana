import assert from "node:assert/strict";
import test from "node:test";

import { csvCell } from "../worker/csv.ts";

test("neutralizes text cells that start with a formula character", () => {
  assert.equal(csvCell('=HYPERLINK("https://example.com","Abrir")'), "\"'=HYPERLINK(\"\"https://example.com\"\",\"\"Abrir\"\")\"");
  assert.equal(csvCell("+1+1"), "'+1+1");
  assert.equal(csvCell("-1+1"), "'-1+1");
  assert.equal(csvCell("@SUM(A1:A2)"), "'@SUM(A1:A2)");
});

test("neutralizes formula characters after initial spaces or tabs", () => {
  assert.equal(csvCell("  =1+1"), "'  =1+1");
  assert.equal(csvCell("\t@SUM(A1:A2)"), "'\t@SUM(A1:A2)");
  assert.equal(csvCell(" \t-1+1"), "' \t-1+1");
});

test("retains the existing CSV escaping and leaves normal text unchanged", () => {
  assert.equal(csvCell("Texto normal"), "Texto normal");
  assert.equal(csvCell("Texto, con coma"), '"Texto, con coma"');
  assert.equal(csvCell('Texto con "comillas"'), '"Texto con ""comillas"""');
  assert.equal(csvCell("Texto con\nsalto"), '"Texto con\nsalto"');
});

test("does not treat numeric cells as formulas", () => {
  assert.equal(csvCell(-1), "-1");
});

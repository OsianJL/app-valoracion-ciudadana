import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the form handles 410 and renders the closed state instead of the form", () => {
  const source = readFileSync("src/App.tsx", "utf8");
  assert.match(source, /response\.status === 410/);
  assert.match(source, /setOfficeState\("closed"\)/);
  assert.match(source, /officeState === "closed"[\s\S]*El periodo de valoración ha finalizado[\s\S]*officeState === "invalid"/);
});

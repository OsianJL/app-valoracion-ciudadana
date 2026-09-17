import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { CLAIM_IP_HASH_SQL, INSERT_RATING_SQL } from "../worker/ratingQueries.ts";

function bind(sql, values) {
  let index = 0;
  return sql.replaceAll("?", () => {
    const value = values[index++];
    if (value === null) return "NULL";
    if (typeof value === "number") return String(value);
    return `'${String(value).replaceAll("'", "''")}'`;
  });
}

test("the real SQLite transaction uses changes() globally and rolls back a failed rating", () => {
  const database = `/tmp/ratings-transaction-${process.pid}.sqlite`;
  const execute = (sql) => spawnSync("sqlite3", [database], { input: sql, encoding: "utf8" });
  try {
    for (const file of ["migrations/0001_initial.sql", "migrations/0002_unique_ip_hash.sql", "migrations/0003_separate_ip_hashes.sql"]) {
      const result = execute(readFileSync(file, "utf8"));
      assert.equal(result.status, 0, result.stderr);
    }

    const first = execute(`BEGIN; ${bind(CLAIM_IP_HASH_SQL, ["hash-a"])}; ${bind(INSERT_RATING_SQL, ["office-a", 5, "first", 1, 0])}; COMMIT;`);
    assert.equal(first.status, 0, first.stderr);
    const duplicate = execute(`BEGIN; ${bind(CLAIM_IP_HASH_SQL, ["hash-a"])}; ${bind(INSERT_RATING_SQL, ["office-b", 4, "duplicate", 0, 1])}; COMMIT;`);
    assert.equal(duplicate.status, 0, duplicate.stderr);
    assert.equal(execute("SELECT COUNT(*) FROM ratings; SELECT office_id FROM ratings;").stdout.trim(), "1\noffice-a");

    const failed = execute(`.bail on\nBEGIN; ${bind(CLAIM_IP_HASH_SQL, ["hash-failed"])}; ${bind(INSERT_RATING_SQL, ["office-a", 99, "invalid", 1, 0])}; COMMIT;`);
    assert.notEqual(failed.status, 0);
    assert.equal(execute("SELECT COUNT(*) FROM rating_ip_hashes WHERE ip_hash='hash-failed'; SELECT COUNT(*) FROM ratings;").stdout.trim(), "0\n1");
  } finally {
    rmSync(database, { force: true });
  }
});

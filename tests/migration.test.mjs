import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("migration separates hashes without losing or changing ratings", () => {
  const database = `/tmp/ratings-migration-${process.pid}.sqlite`;
  const execute = (sql) => spawnSync("sqlite3", [database], { input: sql, encoding: "utf8" });
  try {
    for (const file of ["migrations/0001_initial.sql", "migrations/0002_unique_ip_hash.sql"]) {
      const result = execute(readFileSync(file, "utf8"));
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(execute("INSERT INTO ratings (id, created_at, office_id, satisfaction_level, digital_agents_fixed, other_public_offices_fixed, comment, ip_hash) VALUES (7, '2026-01-01T00:00:00.000Z', 'office-a', 4, 1, 0, 'first', 'hash-a'), (12, '2026-02-01T00:00:00.000Z', 'office-b', 5, 0, 1, 'second', 'hash-b');").status, 0);
    const migration = execute(readFileSync("migrations/0003_separate_ip_hashes.sql", "utf8"));
    assert.equal(migration.status, 0, migration.stderr);
    const check = execute("SELECT group_concat(name || ':' || type || ':' || \"notnull\" || ':' || pk, '|') FROM pragma_table_info('rating_ip_hashes'); SELECT group_concat(ip_hash, '|') FROM (SELECT ip_hash FROM rating_ip_hashes ORDER BY ip_hash); SELECT group_concat(id || ':' || created_at || ':' || office_id || ':' || satisfaction_level || ':' || digital_agents_fixed || ':' || other_public_offices_fixed || ':' || comment, '|') FROM (SELECT * FROM ratings ORDER BY id); SELECT group_concat(name, '|') FROM pragma_table_info('ratings'); SELECT COUNT(*) FROM pragma_index_list('ratings') WHERE name='ratings_office_created_idx';");
    assert.equal(check.status, 0, check.stderr);
    assert.equal(check.stdout.trim(), "ip_hash:TEXT:1:1\nhash-a|hash-b\n7:2026-01-01T00:00:00.000Z:office-a:4:1:0:first|12:2026-02-01T00:00:00.000Z:office-b:5:0:1:second\nid|created_at|office_id|satisfaction_level|digital_agents_fixed|other_public_offices_fixed|comment\n1");
  } finally {
    rmSync(database, { force: true });
  }
});

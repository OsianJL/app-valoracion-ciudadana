import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.ts";
import { handleRequest } from "../worker/handler.ts";
import { PROGRAM_ENDS_AT } from "../worker/program.ts";

const TOKEN_A = "locpSxskBzbYEU47-Vq_UQ";
const TOKEN_B = "ANM4DORobuODx-mS-9u3eg";
const BEFORE_END = Date.parse(PROGRAM_ENDS_AT) - 1;

test("Worker entry point exposes only the Cloudflare-compatible default export", async () => {
  const entryPoint = await import("../worker/index.ts");
  assert.deepEqual(Object.keys(entryPoint), ["default"]);
});

class MemoryDb {
  hashes = new Set();
  ratings = [];

  prepare(sql) {
    const statement = {
      values: [],
      bind: (...values) => { statement.values = values; return statement; },
      run: async () => {
        if (sql === "DELETE FROM rating_ip_hashes") {
          const changes = this.hashes.size;
          this.hashes.clear();
          return { meta: { changes } };
        }
        throw new Error(`Unexpected run: ${sql}`);
      },
      all: async () => {
        if (!sql.startsWith("SELECT id, created_at")) throw new Error(`Unexpected all: ${sql}`);
        return { results: this.ratings.map(({ ip_hash: _ignored, ...rating }) => rating) };
      },
    };
    return statement;
  }

  async batch([hashStatement, ratingStatement]) {
    const [hash] = hashStatement.values;
    const claimed = !this.hashes.has(hash);
    if (claimed) this.hashes.add(hash);
    if (!claimed) return [{ meta: { changes: 0 } }, { meta: { changes: 0 } }];
    const [office_id, satisfaction_level, comment, digital_agents_fixed, other_public_offices_fixed] = ratingStatement.values;
    const rating = { id: this.ratings.length + 1, created_at: "2026-09-16T12:00:00.000Z", office_id, satisfaction_level, comment, digital_agents_fixed, other_public_offices_fixed };
    this.ratings.push(rating);
    return [{ meta: { changes: 1 } }, { meta: { changes: 1, last_row_id: rating.id } }];
  }
}

function env(db = new MemoryDb()) {
  return { DB: db, IP_HASH_SECRET: "test-secret", ASSETS: { fetch: () => new Response() } };
}

function ratingRequest(ip, office_token = TOKEN_A) {
  return new Request("https://example.test/api/ratings", {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify({ office_token, satisfaction_level: 5, comment: "Bien", digital_agents_fixed: true, other_public_offices_fixed: false }),
  });
}

test("rejects a second submission from the same IP, including at another office", async () => {
  const environment = env();
  assert.equal((await handleRequest(ratingRequest("192.0.2.1"), environment, BEFORE_END)).status, 201);
  assert.equal((await handleRequest(ratingRequest("192.0.2.1", TOKEN_B), environment, BEFORE_END)).status, 409);
  assert.equal(environment.DB.ratings.length, 1);
});

test("allows a different IP and never stores the original IP or hash with ratings", async () => {
  const environment = env();
  assert.equal((await handleRequest(ratingRequest("192.0.2.1"), environment, BEFORE_END)).status, 201);
  assert.equal((await handleRequest(ratingRequest("192.0.2.2", TOKEN_B), environment, BEFORE_END)).status, 201);
  assert.equal(environment.DB.ratings.length, 2);
  assert.equal(JSON.stringify(environment.DB.ratings).includes("192.0.2."), false);
  assert.equal(Object.hasOwn(environment.DB.ratings[0], "ip_hash"), false);
  assert.equal([...environment.DB.hashes].some((value) => value.includes("192.0.2.")), false);
});

test("dashboard JSON and CSV never receive hashes", async () => {
  const environment = env();
  await handleRequest(ratingRequest("192.0.2.1"), environment, BEFORE_END);
  const dashboard = await handleRequest(new Request("https://example.test/api/results"), environment, BEFORE_END);
  const csv = await handleRequest(new Request("https://example.test/api/results.csv"), environment, BEFORE_END);
  assert.equal((await dashboard.text()).includes("ip_hash"), false);
  assert.equal((await csv.text()).includes("ip_hash"), false);
});

test("scheduled cleanup is idempotent and preserves ratings after program end", async () => {
  const environment = env();
  await handleRequest(ratingRequest("192.0.2.1"), environment, BEFORE_END);
  const controller = { scheduledTime: Date.parse(PROGRAM_ENDS_AT) };
  await worker.scheduled(controller, environment, {});
  await worker.scheduled(controller, environment, {});
  assert.equal(environment.DB.hashes.size, 0);
  assert.equal(environment.DB.ratings.length, 1);
});

test("rejects new responses and removes hashes at and after program end", async () => {
  const environment = env();
  await handleRequest(ratingRequest("192.0.2.1"), environment, BEFORE_END);
  const response = await handleRequest(ratingRequest("192.0.2.2"), environment, Date.parse(PROGRAM_ENDS_AT));
  assert.equal(response.status, 410);
  assert.equal(environment.DB.hashes.size, 0);
  assert.equal(environment.DB.ratings.length, 1);
});

test("office validation reports closure before the form is completed", async () => {
  const environment = env();
  const open = await handleRequest(new Request(`https://example.test/api/office?o=${TOKEN_A}`), environment, BEFORE_END);
  const closed = await handleRequest(new Request(`https://example.test/api/office?o=${TOKEN_A}`), environment, Date.parse(PROGRAM_ENDS_AT));
  assert.deepEqual(await open.json(), { valid: true, closed: false });
  assert.deepEqual(await closed.json(), { valid: true, closed: true });
});

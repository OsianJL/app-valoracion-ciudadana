import { isValidOffice } from "../src/offices";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  IP_HASH_SECRET: string;
}

const MAX_BODY_BYTES = 2048;
const DUPLICATE_RATING_ERROR = "Ya se ha registrado una valoración desde esta conexión.";
const RESULT_COLUMNS = "id, created_at, office_id, satisfaction_level, digital_agents_fixed, other_public_offices_fixed, comment";

interface RatingResult {
  id: number;
  created_at: string;
  office_id: string;
  satisfaction_level: number;
  digital_agents_fixed: number;
  other_public_offices_fixed: number;
  comment: string | null;
}

function json(body: object, status: number): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

async function hashIp(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createRating(request: Request, env: Env): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: "La petición es demasiado grande." }, 413);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "El contenido debe ser JSON." }, 400);

  let data: unknown;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return json({ error: "La petición es demasiado grande." }, 413);
    data = JSON.parse(body);
  } catch { return json({ error: "JSON no válido." }, 400); }

  if (typeof data !== "object" || data === null || Array.isArray(data)) return json({ error: "Datos no válidos." }, 400);
  const { office_id, satisfaction_level, comment, digital_agents_fixed, other_public_offices_fixed } = data as Record<string, unknown>;
  if (!isValidOffice(office_id)) return json({ error: "Oficina no válida." }, 400);
  if (!Number.isInteger(satisfaction_level) || (satisfaction_level as number) < 1 || (satisfaction_level as number) > 5) return json({ error: "Valoración no válida." }, 400);
  if (typeof comment !== "string" || comment.length > 500) return json({ error: "Comentario no válido." }, 400);
  if (typeof digital_agents_fixed !== "boolean") return json({ error: "Pregunta sobre agentes no válida." }, 400);
  if (typeof other_public_offices_fixed !== "boolean") return json({ error: "Pregunta sobre otras oficinas no válida." }, 400);
  if (!env.IP_HASH_SECRET) return json({ error: "Error interno." }, 500);

  const ipHash = await hashIp(request.headers.get("CF-Connecting-IP") ?? "unknown", env.IP_HASH_SECRET);
  const existingRating = await env.DB.prepare("SELECT 1 FROM ratings WHERE ip_hash = ? LIMIT 1").bind(ipHash).first();
  if (existingRating) return json({ error: DUPLICATE_RATING_ERROR }, 409);

  let result: D1Result;
  try {
    result = await env.DB.prepare("INSERT INTO ratings (office_id, satisfaction_level, comment, ip_hash, digital_agents_fixed, other_public_offices_fixed) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(office_id, satisfaction_level, comment.trim() || null, ipHash, digital_agents_fixed ? 1 : 0, other_public_offices_fixed ? 1 : 0).run();
  } catch (error) {
    // The unique index is the final safeguard when simultaneous requests pass the check above.
    const conflictingRating = await env.DB.prepare("SELECT 1 FROM ratings WHERE ip_hash = ? LIMIT 1").bind(ipHash).first();
    if (conflictingRating) return json({ error: DUPLICATE_RATING_ERROR }, 409);
    throw error;
  }
  return json({ ok: true, id: result.meta.last_row_id }, 201);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function getResults(request: Request, env: Env, csv: boolean): Promise<Response> {
  const url = new URL(request.url);
  const office = url.searchParams.get("office")?.trim() ?? "";
  const from = url.searchParams.get("from")?.trim() ?? "";
  const to = url.searchParams.get("to")?.trim() ?? "";

  if (office && !isValidOffice(office)) return json({ error: "Oficina no válida." }, 400);
  if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) {
    return json({ error: "Rango de fechas no válido." }, 400);
  }

  const conditions: string[] = [];
  const bindings: string[] = [];
  if (office) { conditions.push("office_id = ?"); bindings.push(office); }
  if (from) { conditions.push("created_at >= ?"); bindings.push(`${from}T00:00:00.000Z`); }
  if (to) { conditions.push("created_at < ?"); bindings.push(`${nextDate(to)}T00:00:00.000Z`); }
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const statement = env.DB.prepare(`SELECT ${RESULT_COLUMNS} FROM ratings${where} ORDER BY created_at DESC, id DESC`);
  const result = await (bindings.length ? statement.bind(...bindings) : statement).all<RatingResult>();
  const rows = result.results;

  if (!csv) return json({ results: rows }, 200);

  const header = RESULT_COLUMNS.split(", ");
  const lines = [header.join(","), ...rows.map((row) => header.map((column) => csvCell(row[column as keyof RatingResult])).join(","))];
  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-disposition": 'attachment; filename="valoraciones-atd.csv"',
      "content-type": "text/csv; charset=utf-8",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if ((url.pathname === "/api/results" || url.pathname === "/api/results.csv") && request.method === "GET") {
        try { return await getResults(request, env, url.pathname.endsWith(".csv")); }
        catch (error) { console.error("Unable to read ratings", error); return json({ error: "Error interno." }, 500); }
      }
      if (url.pathname === "/api/ratings" && request.method === "POST") {
        try { return await createRating(request, env); }
        catch (error) { console.error("Unable to save rating", error); return json({ error: "Error interno." }, 500); }
      }
      return json({ error: "No encontrado." }, 404);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

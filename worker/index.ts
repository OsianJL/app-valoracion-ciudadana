interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  IP_HASH_SECRET: string;
}

const OFFICE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_BODY_BYTES = 2048;

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
  if (typeof office_id !== "string" || office_id.length > 64 || !OFFICE_PATTERN.test(office_id)) return json({ error: "Oficina no válida." }, 400);
  if (!Number.isInteger(satisfaction_level) || (satisfaction_level as number) < 1 || (satisfaction_level as number) > 5) return json({ error: "Valoración no válida." }, 400);
  if (typeof comment !== "string" || comment.length > 500) return json({ error: "Comentario no válido." }, 400);
  if (typeof digital_agents_fixed !== "boolean") return json({ error: "Pregunta sobre agentes no válida." }, 400);
  if (typeof other_public_offices_fixed !== "boolean") return json({ error: "Pregunta sobre otras oficinas no válida." }, 400);
  if (!env.IP_HASH_SECRET) return json({ error: "Error interno." }, 500);

  const ipHash = await hashIp(request.headers.get("CF-Connecting-IP") ?? "unknown", env.IP_HASH_SECRET);
  const result = await env.DB.prepare("INSERT INTO ratings (office_id, satisfaction_level, comment, ip_hash, digital_agents_fixed, other_public_offices_fixed) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(office_id, satisfaction_level, comment.trim() || null, ipHash, digital_agents_fixed ? 1 : 0, other_public_offices_fixed ? 1 : 0).run();
  return json({ ok: true, id: result.meta.last_row_id }, 201);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/ratings" && request.method === "POST") {
        try { return await createRating(request, env); }
        catch (error) { console.error("Unable to save rating", error); return json({ error: "Error interno." }, 500); }
      }
      return json({ error: "No encontrado." }, 404);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

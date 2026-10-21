// output/gain-sync-service/shared/model.mjs
var STATES = [
  ["BW", "Baden-W\xFCrttemberg", 237],
  ["BY", "Bayern", 347],
  ["BE", "Berlin", 86],
  ["BB", "Brandenburg", 63],
  ["HB", "Bremen", 14],
  ["HH", "Hamburg", 63],
  ["HE", "Hessen", 150],
  ["MV", "Mecklenburg-Vorpommern", 38],
  ["NI", "Niedersachsen", 167],
  ["NW", "Nordrhein-Westfalen", 316],
  ["RP", "Rheinland-Pfalz", 83],
  ["SL", "Saarland", 20],
  ["SN", "Sachsen", 76],
  ["ST", "Sachsen-Anhalt", 44],
  ["SH", "Schleswig-Holstein", 90],
  ["TH", "Th\xFCringen", 47]
];
var TOTAL = STATES.reduce((sum, s) => sum + s[2], 0);
var DEFAULTS = Object.freeze({
  hospitals: 400,
  selected: [],
  mode: "total",
  years: 3,
  hours: 8,
  tariff: 0.3,
  units: 1,
  quantHardware: 250,
  rtxHardware: 750,
  quantWatts: 15,
  rtxWatts: 130
});
var LIMITS = {
  hospitals: [0, TOTAL],
  years: [1, 20],
  hours: [0, 24],
  tariff: [0, 5],
  units: [1, 100],
  quantHardware: [0, 1e5],
  rtxHardware: [0, 1e5],
  quantWatts: [0, 1e4],
  rtxWatts: [0, 1e4]
};
function sanitize(raw = {}) {
  if (!raw || typeof raw !== "object") raw = {};
  const result = { ...DEFAULTS };
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    const value = Number(raw[key]);
    if (raw[key] !== null && raw[key] !== "" && Number.isFinite(value)) result[key] = Math.max(min, Math.min(max, value));
  }
  for (const key of ["hospitals", "units", "years"]) result[key] = Math.round(result[key]);
  result.mode = raw.mode === "hardware" ? "hardware" : "total";
  result.selected = [...new Set(Array.isArray(raw.selected) ? raw.selected : [])].filter((id) => STATES.some((s) => s[0] === id));
  return result;
}

// output/gain-sync-service/server/scenario.mjs
var ROOM = /^[A-HJ-NP-Z2-9]{16}$/;
var CLIENT = /^[a-zA-Z0-9-]{16,64}$/;
var FIELDS = Object.keys(DEFAULTS);
var MAX_BYTES = 4096;
var TTL = 6 * 60 * 60 * 1e3;
function corsHeaders(request) {
  const origin = request.headers.get("origin"), own = new URL(request.url).origin;
  const allowed = origin === "https://mdatres.github.io" || origin === own || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin || "");
  return {
    "Cache-Control": "no-store",
    "Vary": "Origin",
    ...allowed ? { "Access-Control-Allow-Origin": origin } : {},
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600"
  };
}
var json = (request, body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders(request), "Content-Type": "application/json" }
});
async function handleSync(request, db, now = Date.now()) {
  if (request.headers.get("origin") && !corsHeaders(request)["Access-Control-Allow-Origin"]) return json(request, { error: "Origin not allowed" }, 403);
  const room = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!ROOM.test(room || "")) return json(request, { error: "A current room link is required" }, 401);
  let body;
  try {
    if (Number(request.headers.get("content-length")) > MAX_BYTES) throw new Error();
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    let size = 0, chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return json(request, { error: "Invalid request" }, 400);
  }
  if (!body || !CLIENT.test(body.client || "") || !["display", "controller"].includes(body.role) || !Number.isSafeInteger(body.sequence) || body.sequence < 0 || !Number.isSafeInteger(body.seenRevision) || body.seenRevision < 0 || body.patch !== void 0 && (!body.patch || typeof body.patch !== "object" || Array.isArray(body.patch))) return json(request, { error: "Invalid scenario message" }, 400);
  const cleaned = sanitize(body.patch || {});
  const patch = Object.fromEntries(FIELDS.filter((key) => Object.hasOwn(body.patch || {}, key)).map((key) => [key, cleaned[key]]));
  const hasPatch = Object.keys(patch).length > 0;
  if (hasPatch && body.sequence === 0) return json(request, { error: "Missing update sequence" }, 400);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(room));
  const id = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const p = (sql, ...values) => db.prepare(sql).bind(...values);
  const existing = await p("SELECT id FROM rooms WHERE id = ? AND updated_at > ?", id, now - TTL).first();
  if (!existing) {
    const count = await p("SELECT COUNT(*) AS total FROM rooms WHERE updated_at > ?", now - TTL).first();
    if (count.total >= 256) return json(request, { error: "Service busy; try again later" }, 429);
  }
  const statements = [
    p("DELETE FROM participants WHERE last_seen < ?", now - TTL),
    p("DELETE FROM rooms WHERE updated_at < ?", now - TTL),
    p("INSERT OR IGNORE INTO rooms (id, state, revision, updated_at) VALUES (?, ?, 0, ?)", id, JSON.stringify(sanitize(body.initial || DEFAULTS)), now),
    p("INSERT OR IGNORE INTO participants (room, client, role, sequence, seen_revision, last_seen) VALUES (?, ?, ?, 0, 0, ?)", id, body.client, body.role, now)
  ];
  if (hasPatch) statements.push(p(`UPDATE rooms SET state = json_patch(state, ?), revision = revision + 1 WHERE id = ? AND EXISTS (SELECT 1 FROM participants WHERE room = ? AND client = ? AND sequence < ?)`, JSON.stringify(patch), id, id, body.client, body.sequence));
  statements.push(
    p("UPDATE rooms SET updated_at = ? WHERE id = ? AND updated_at < ?", now, id, now - 3e3),
    p("UPDATE participants SET role = ?, sequence = MAX(sequence, ?), seen_revision = MAX(seen_revision, ?), last_seen = ? WHERE room = ? AND client = ? AND (role != ? OR sequence < ? OR seen_revision < ? OR last_seen < ?)", body.role, body.sequence, body.seenRevision, now, id, body.client, body.role, body.sequence, body.seenRevision, now - 3e3),
    p("SELECT state, revision FROM rooms WHERE id = ?", id),
    p("SELECT MAX(seen_revision) AS revision, COUNT(*) AS total FROM participants WHERE room = ? AND client != ? AND role != ? AND last_seen > ?", id, body.client, body.role, now - 1e4)
  );
  const result = await db.batch(statements);
  const scenario = result.at(-2).results[0], other = result.at(-1).results[0];
  return json(request, {
    state: JSON.parse(scenario.state),
    revision: scenario.revision,
    otherPresent: other.total > 0,
    otherRevision: other.revision ?? -1
  });
}

// output/gain-sync-service/worker-public/index.mjs
var index_default = {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/api/health") return json(request, { service: "gAIn synchronization", status: "ready" });
    if (path !== "/api/sync") return json(request, { error: "Not found" }, 404);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
    try {
      return await handleSync(request, env.DB);
    } catch {
      return json(request, { error: "Connection service unavailable" }, 503);
    }
  }
};
export {
  index_default as default
};

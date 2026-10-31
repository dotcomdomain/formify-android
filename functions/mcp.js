// Formify MCP server (Streamable HTTP, JSON responses). Lets a person's own AI assistant
// (Claude, ChatGPT, etc.) find a business and check them in before they arrive.
// Add it to Claude Code: claude mcp add --transport http formify https://getformify.pages.dev/mcp
import { searchBusinesses } from "../lib/search.js";
import { loadConfig, position } from "../lib/queue.js";
import { createCheckin } from "../lib/checkin.js";

const PROTOCOL = "2025-06-18";

const TOOLS = [
  {
    name: "search_businesses",
    description: "Search businesses on Formify (clinics, restaurants, ski rentals, barbers, service desks). Results are ranked by how many people use them this month and include each one's Ease Score (1-5, how easy visitors found check-in) and current wait.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "What the person is looking for, e.g. 'ski rental' or 'walk-in clinic Hamilton'" }, type: { type: "string", description: "Optional business type filter, e.g. clinic, restaurant" } }, required: ["query"] },
    annotations: { readOnlyHint: true }
  },
  {
    name: "get_checkin_form",
    description: "Get a business's check-in form: every field (id, label, type, required, options), what the business does with the data, and how long it keeps it. Call this before check_in.",
    inputSchema: { type: "object", properties: { business_id: { type: "string" } }, required: ["business_id"] },
    annotations: { readOnlyHint: true }
  },
  {
    name: "check_in",
    description: "Check the person in remotely. Only call this after you have shown the person the business's consent text and every answer you will send, and they explicitly said yes. Use field ids from get_checkin_form as keys in answers. Never invent values; ask the person. Returns a ticket number, a 4-digit arrival code, and a live status link to give them.",
    inputSchema: {
      type: "object",
      properties: {
        business_id: { type: "string" },
        answers: { type: "object", description: "Field id -> value. Dates as YYYY-MM-DD.", additionalProperties: true },
        user_confirmed: { type: "boolean", description: "True only if the person reviewed the answers and agreed to the consent text in this conversation." }
      },
      required: ["business_id", "answers", "user_confirmed"]
    },
    annotations: { destructiveHint: false, openWorldHint: true }
  },
  {
    name: "get_visit_status",
    description: "Check a visit's live status (pending, waiting with people ahead, being served, payment requested, done) using the status_url returned by check_in.",
    inputSchema: { type: "object", properties: { status_url: { type: "string" } }, required: ["status_url"] },
    annotations: { readOnlyHint: true }
  }
];

const text = (obj, isError = false) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }], ...(isError ? { isError: true } : {}) });

async function callTool(name, args, env, waitUntil, origin) {
  if (name === "search_businesses") {
    const list = await searchBusinesses(env, args.query || "", args.type || "");
    if (!list.length) return text(`No businesses on Formify match "${args.query}".`);
    return text(list.slice(0, 10).map((b) => ({
      business_id: b.id, name: b.name, type: b.business_type, city: b.city,
      ease_score: b.ease.avg, ratings: b.ease.count, waiting_now: b.waiting, checkins_this_month: b.checkins_month,
      page: `${origin}/b.html?id=${b.id}`
    })));
  }
  if (name === "get_checkin_form") {
    const config = await loadConfig(env, String(args.business_id || ""));
    if (!config) return text("Business not found.", true);
    return text({
      business: config.name, consent_text: config.consent_text, retention_days: config.retention_days,
      fields: config.steps.flatMap((s) => s.fields.map((f) => ({ id: f.id, label: f.label, type: f.type, required: f.required, ...(f.options ? { options: f.options } : {}) })))
    });
  }
  if (name === "check_in") {
    if (args.user_confirmed !== true) return text("Not checked in. Show the person the consent text and their answers, and get their explicit yes first.", true);
    const id = String(args.business_id || "");
    const config = await loadConfig(env, id);
    if (!config) return text("Business not found.", true);
    const r = await createCheckin(env, waitUntil, id, config, { answers: args.answers || {}, consent: true, channel: "ai agent", via: ["assistant"] });
    if (r.error) return text(`Not checked in: ${r.error}`, true);
    return text({
      checked_in: true, business: config.name, ticket: r.ticket, arrival_code: r.code,
      status_url: `${origin}/visit.html#${r.token}`,
      next_step: "Tell the person their ticket and arrival code. When they arrive they enter the code at the kiosk or tap \"I'm here\" on the status page."
    });
  }
  if (name === "get_visit_status") {
    const token = String(args.status_url || "").split("#").pop();
    if (!/^[0-9a-f]{32}$/.test(token)) return text("That status link isn't valid.", true);
    const row = await env.DB.prepare("SELECT kiosk_id, ticket, status, arrived_at, amount_cents FROM checkins WHERE token = ?").bind(token).first();
    if (!row) return text("Visit not found.", true);
    const config = await loadConfig(env, row.kiosk_id);
    return text({ business: config.name, ticket: row.ticket, status: row.status, ...(await position(env, row.kiosk_id, row, config)), ...(row.amount_cents ? { amount_due: (row.amount_cents / 100).toFixed(2) } : {}) });
  }
  return null;
}

async function handle(msg, env, waitUntil, origin) {
  const { id, method, params = {} } = msg || {};
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== "2.0" || typeof method !== "string") return fail(-32600, "Invalid request");
  if (id === undefined) return null; // notification (e.g. notifications/initialized): no response

  if (method === "initialize") return reply({
    protocolVersion: params.protocolVersion || PROTOCOL,
    capabilities: { tools: {} },
    serverInfo: { name: "formify", title: "Formify", version: "1.0.0" },
    instructions: "Formify lets you find businesses and check a person in before they arrive. Search, read the form, collect answers from the person, show them the consent text and answers, and only call check_in after they say yes."
  });
  if (method === "ping") return reply({});
  if (method === "tools/list") return reply({ tools: TOOLS });
  if (method === "tools/call") {
    try {
      const out = await callTool(params.name, params.arguments || {}, env, waitUntil, origin);
      return out ? reply(out) : fail(-32602, `Unknown tool: ${params.name}`);
    } catch (e) {
      return reply(text(`Tool failed: ${String(e.message || e).slice(0, 200)}`, true));
    }
  }
  return fail(-32601, `Method not found: ${method}`);
}

export async function onRequestPost({ request, env, waitUntil }) {
  const origin = new URL(request.url).origin;
  let body;
  try { body = await request.json(); } catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 }); }
  const batch = Array.isArray(body);
  const results = (await Promise.all((batch ? body : [body]).map((m) => handle(m, env, waitUntil, origin)))).filter(Boolean);
  if (!results.length) return new Response(null, { status: 202 });
  return Response.json(batch ? results : results[0], { headers: { "cache-control": "no-store" } });
}

// No server-initiated stream; clients fall back to plain POST.
export const onRequestGet = () => new Response("Formify MCP endpoint. POST JSON-RPC here.", { status: 405, headers: { allow: "POST" } });

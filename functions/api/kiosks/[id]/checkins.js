import { handoffNote } from "../../../../lib/ai.js";
import { loadConfig, position } from "../../../../lib/queue.js";

const DAY = 86400000;

const randomCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 9000 + 1000);
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");

// Visitor checks in, on the kiosk (joins the queue now) or on their phone (joins when they arrive).
export async function onRequestPost({ params, request, env, waitUntil }) {
  const config = await loadConfig(env, params.id);
  if (!config) return Response.json({ error: "Kiosk not found" }, { status: 404 });
  const { answers, consent, channel, language, via } = await request.json().catch(() => ({}));
  if (!consent) return Response.json({ error: "Consent is required." }, { status: 400 });

  // Keep only fields the config defines, so the kiosk can't be used to store anything else.
  const clean = {};
  for (const step of config.steps) for (const f of step.fields) {
    const v = answers?.[f.id];
    if (f.required && (v === undefined || v === "" || v === false)) return Response.json({ error: `${f.label} is required.` }, { status: 400 });
    if (v !== undefined && v !== "") clean[f.id] = f.type === "checkbox" ? !!v : String(v).slice(0, 500);
  }

  const phone = channel === "phone";
  const how = [phone ? "phone" : "kiosk", ...(Array.isArray(via) ? via.filter((v) => v === "voice" || v === "scan") : [])].join(", ");
  const lang = /^[a-z]{2}$/.test(language) ? language : "en";

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM checkins WHERE kiosk_id = ? AND created_at >= ?").bind(params.id, start.getTime()).first();
  const ticket = `${config.ticket_prefix}${String(n + 1).padStart(3, "0")}`;
  const now = Date.now();
  const token = randomToken(), code = randomCode();
  const status = phone ? "pending" : "waiting";
  const { meta } = await env.DB.prepare(
    "INSERT INTO checkins (kiosk_id, ticket, answers, status, created_at, arrived_at, token, code, channel, language) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(params.id, ticket, JSON.stringify(clean), status, now, phone ? null : now, token, code, how, lang).run();

  // The note is written in the background so the visitor never waits on it.
  waitUntil((async () => {
    try {
      const note = await handoffNote(env, config, clean, { channel: how, language: lang });
      await env.DB.prepare("UPDATE checkins SET summary = ?, flags = ? WHERE id = ?").bind(note.summary, JSON.stringify(note.flags), meta.last_row_id).run();
    } catch {}
  })());

  const pos = await position(env, params.id, { status, arrived_at: now }, config);
  return Response.json({ ticket, token, code: phone ? code : undefined, ...pos });
}

// Dashboard: queue, today's numbers, audit log. Sensitive answers are masked unless revealed.
export async function onRequestGet({ params, request, env }) {
  const config = await loadConfig(env, params.id);
  if (!config) return Response.json({ error: "Kiosk not found" }, { status: 404 });

  // Retention is enforced on read, so old data never shows up even if no job ran.
  await env.DB.prepare("DELETE FROM checkins WHERE kiosk_id = ? AND created_at < ?").bind(params.id, Date.now() - config.retention_days * DAY).run();

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const { results } = await env.DB.prepare(
    "SELECT id, ticket, answers, status, created_at, arrived_at, served_at, channel, language, summary, flags FROM checkins WHERE kiosk_id = ? AND created_at >= ? ORDER BY COALESCE(arrived_at, created_at)"
  ).bind(params.id, start.getTime() - DAY).all();
  const audit = (await env.DB.prepare("SELECT action, detail, at FROM audit WHERE kiosk_id = ? ORDER BY at DESC LIMIT 30").bind(params.id).all()).results;

  const reveal = new URL(request.url).searchParams.get("reveal");
  const sensitive = new Set(config.steps.flatMap((s) => s.fields.filter((f) => f.sensitive).map((f) => f.id)));
  const checkins = results.map((r) => {
    const a = JSON.parse(r.answers);
    if (String(r.id) !== reveal) for (const k of Object.keys(a)) if (sensitive.has(k)) a[k] = "•••";
    return { ...r, answers: a, flags: r.flags ? JSON.parse(r.flags) : [] };
  });
  if (reveal) {
    const t = results.find((r) => String(r.id) === reveal);
    if (t) await env.DB.prepare("INSERT INTO audit (kiosk_id, action, detail, at) VALUES (?, ?, ?, ?)").bind(params.id, "viewed sensitive data", `Ticket ${t.ticket}`, Date.now()).run();
  }
  return Response.json({ config, checkins, audit });
}

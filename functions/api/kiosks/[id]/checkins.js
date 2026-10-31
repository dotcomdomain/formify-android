import { createCheckin } from "../../../../lib/checkin.js";
import { loadConfig, position } from "../../../../lib/queue.js";
import { easeFor } from "../../../../lib/ease.js";
import { ownsKiosk, sessionFor, json } from "../../../../lib/auth.js";

const DAY = 86400000;

// Visitor checks in, on the kiosk (joins the queue now) or on their phone (joins when they arrive).
export async function onRequestPost({ params, request, env, waitUntil }) {
  const config = await loadConfig(env, params.id);
  if (!config) return Response.json({ error: "Kiosk not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  // Signed-in customers get the visit in their account; everyone else stays anonymous.
  const userId = body.channel === "phone" ? await sessionFor(env, request, "user") : null;
  const result = await createCheckin(env, waitUntil, params.id, config, { ...body, channel: body.channel === "phone" ? "phone" : "kiosk", userId });
  if (result.error) return Response.json(result, { status: 400 });
  return Response.json(result);
}

// Dashboard: queue, today's numbers, audit log. Sensitive answers are masked unless revealed.
export async function onRequestGet({ params, request, env }) {
  if (!(await ownsKiosk(env, request, params.id))) return json({ error: "Sign in to see this location's queue." }, 403);
  const config = await loadConfig(env, params.id);
  if (!config) return Response.json({ error: "Kiosk not found" }, { status: 404 });

  // Retention is enforced on read, so old data never shows up even if no job ran.
  await env.DB.prepare("DELETE FROM checkins WHERE kiosk_id = ? AND created_at < ?").bind(params.id, Date.now() - config.retention_days * DAY).run();

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const { results } = await env.DB.prepare(
    "SELECT id, ticket, answers, status, created_at, arrived_at, served_at, channel, language, summary, flags, amount_cents, paid_at, pay_method FROM checkins WHERE kiosk_id = ? AND created_at >= ? ORDER BY COALESCE(arrived_at, created_at)"
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
  const ease = await easeFor(env, params.id);
  const feedback = (await env.DB.prepare("SELECT r.score, r.comment, r.at, c.ticket FROM ratings r JOIN checkins c ON c.id = r.checkin_id WHERE r.kiosk_id = ? ORDER BY r.at DESC LIMIT 8")
    .bind(params.id).all()).results;
  const alerts = (await env.DB.prepare("SELECT id, kind, message, ticket, at FROM alerts WHERE kiosk_id = ? AND ack_at IS NULL AND at > ? ORDER BY at DESC")
    .bind(params.id, Date.now() - 3 * 3600000).all()).results;
  const month = Date.now() - 30 * DAY;
  const counts = Object.fromEntries((await env.DB.prepare("SELECT type, COUNT(*) AS n FROM events WHERE kiosk_id = ? AND at > ? GROUP BY type").bind(params.id, month).all()).results.map((r) => [r.type, r.n]));
  return Response.json({ config, checkins, audit, ease, feedback, alerts, funnel: { views: counts.view || 0, starts: counts.start || 0, checkins: counts.checkin || 0 } });
}

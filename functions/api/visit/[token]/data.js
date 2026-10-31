import { addMessage } from "../../../../lib/thread.js";

// "My data": the customer sees exactly what this business holds about them and when it's deleted,
// can download it, and can ask the business to delete it. Some records (e.g. health records) must
// legally be kept, so deletion is a request the business approves or answers with a reason.
const DAY = 86400000;

async function load(env, token) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  return env.DB.prepare("SELECT c.id, c.kiosk_id, c.ticket, c.answers, c.created_at, c.channel, c.delete_status, c.delete_note, c.delete_at, k.config FROM checkins c JOIN kiosks k ON k.id = c.kiosk_id WHERE c.token = ?").bind(token).first();
}

export async function onRequestGet({ params, env }) {
  const r = await load(env, params.token);
  if (!r) return Response.json({ error: "Visit not found" }, { status: 404 });
  const c = JSON.parse(r.config);
  const a = JSON.parse(r.answers || "{}");
  const fields = c.steps.flatMap((s) => s.fields).filter((f) => a[f.id] !== undefined).map((f) => ({ label: f.label, value: a[f.id], sensitive: f.sensitive }));
  return Response.json({
    business: c.name, form: c.form_label || c.welcome_title, ticket: r.ticket, collected_at: r.created_at, channel: r.channel,
    purpose: c.consent_text, delete_by: r.created_at + c.retention_days * DAY, retention_days: c.retention_days,
    fields, request: r.delete_status ? { status: r.delete_status, note: r.delete_note, at: r.delete_at } : null
  });
}

export async function onRequestPost({ params, request, env, waitUntil }) {
  const r = await load(env, params.token);
  if (!r) return Response.json({ error: "Visit not found" }, { status: 404 });
  if (r.delete_status === "deleted") return Response.json({ ok: true, status: "deleted" });
  const { note } = await request.json().catch(() => ({}));
  await env.DB.prepare("UPDATE checkins SET delete_status = 'requested', delete_note = ?, delete_at = ? WHERE id = ?").bind(String(note || "").slice(0, 300) || null, Date.now(), r.id).run();
  await env.DB.prepare("INSERT INTO audit (kiosk_id, action, detail, at) VALUES (?, 'deletion requested', ?, ?)").bind(r.kiosk_id, `Customer asked to delete their info for ticket ${r.ticket}`, Date.now()).run();
  await addMessage(env, waitUntil, { checkinId: r.id, kioskId: r.kiosk_id, sender: "system", kind: "status", body: "You asked us to delete your info for this visit. The business has 30 days to respond; you'll see the answer here." });
  return Response.json({ ok: true, status: "requested" });
}

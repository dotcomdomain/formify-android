import { loadConfig, position } from "../../../lib/queue.js";
import { stripeMode } from "../../../lib/stripe.js";
import { addMessage } from "../../../lib/thread.js";
import { playbookOf } from "../../../lib/playbooks.js";

async function load(env, token) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  return env.DB.prepare("SELECT id, kiosk_id, ticket, status, code, arrived_at, amount_cents, paid_at, pay_method, deposit_cents, deposit_paid_at FROM checkins WHERE token = ?").bind(token).first();
}

// Visitor's phone polls this for their place in line.
export async function onRequestGet({ params, env }) {
  const row = await load(env, params.token);
  if (!row) return Response.json({ error: "Visit not found" }, { status: 404 });
  const config = await loadConfig(env, row.kiosk_id);
  const rated = await env.DB.prepare("SELECT score FROM ratings WHERE checkin_id = ?").bind(row.id).first();
  return Response.json({
    kiosk_id: row.kiosk_id, name: config.name, flow: config.flow || "walk_in", form: config.form_label || "", brand_color: config.brand_color, ticket: row.ticket, status: row.status, code: row.code,
    rated: rated?.score || null,
    payments: stripeMode(env), amount_cents: row.amount_cents || null, deposit_cents: row.deposit_cents || null, deposit_paid: !!row.deposit_paid_at, playbook: playbookOf(config).id, paid_at: row.paid_at || null, pay_method: row.pay_method || null,
    links: { google_reviews: config.google_reviews || "", instagram: config.instagram || "", website: config.website || "" },
    ...(await position(env, row.kiosk_id, row, config))
  });
}

// "I'm here" button on the phone.
export async function onRequestPost({ params, env, waitUntil }) {
  const row = await load(env, params.token);
  if (!row) return Response.json({ error: "Visit not found" }, { status: 404 });
  if (row.status === "pending") {
    await env.DB.prepare("UPDATE checkins SET status = 'waiting', arrived_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
    await addMessage(env, waitUntil, { checkinId: row.id, kioskId: row.kiosk_id, sender: "system", kind: "status", body: "You're here. You're in line; we'll message you when it's your turn." });
  }
  return Response.json({ ok: true });
}

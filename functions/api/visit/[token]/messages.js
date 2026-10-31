import { addMessage, messagesFor } from "../../../../lib/thread.js";
import { approvalsFor } from "../../../../lib/approvals.js";

// Customer side of the visit thread. The visit token is the key; no account needed.
async function load(env, token) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  return env.DB.prepare("SELECT id, kiosk_id, status FROM checkins WHERE token = ?").bind(token).first();
}

export async function onRequestGet({ params, env }) {
  const row = await load(env, params.token);
  if (!row) return Response.json({ error: "Visit not found" }, { status: 404 });
  const messages = await messagesFor(env, row.id);
  if (messages.length) await env.DB.prepare("UPDATE checkins SET seen_customer = ? WHERE id = ?").bind(messages.at(-1).id, row.id).run();
  return Response.json({ messages, approvals: await approvalsFor(env, row.id) });
}

export async function onRequestPost({ params, request, env, waitUntil }) {
  const row = await load(env, params.token);
  if (!row) return Response.json({ error: "Visit not found" }, { status: 404 });
  const { body } = await request.json().catch(() => ({}));
  const text = String(body || "").trim();
  if (!text) return Response.json({ error: "Write a message first." }, { status: 400 });
  // Keep a visit thread from being used as a spam channel.
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE checkin_id = ? AND sender = 'customer'").bind(row.id).first();
  if (n >= 30) return Response.json({ error: "Message limit reached for this visit. Please talk to the front desk." }, { status: 429 });
  const id = await addMessage(env, waitUntil, { checkinId: row.id, kioskId: row.kiosk_id, sender: "customer", body: text });
  await env.DB.prepare("UPDATE checkins SET seen_customer = ? WHERE id = ?").bind(id, row.id).run();
  return Response.json({ ok: true });
}

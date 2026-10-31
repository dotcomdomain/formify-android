import { ownsKiosk, json } from "../../../../lib/auth.js";
import { addMessage, messagesFor } from "../../../../lib/thread.js";

// Business side of the visit thread. Any staff role can read and reply.
async function guard(env, request, cid) {
  const row = await env.DB.prepare("SELECT id, kiosk_id FROM checkins WHERE id = ?").bind(cid).first();
  const member = row && (await ownsKiosk(env, request, row.kiosk_id));
  return member ? { row, member } : null;
}

export async function onRequestGet({ params, request, env }) {
  const g = await guard(env, request, params.cid);
  if (!g) return json({ error: "Not your location." }, 403);
  const messages = await messagesFor(env, g.row.id);
  if (messages.length) await env.DB.prepare("UPDATE checkins SET seen_business = ? WHERE id = ?").bind(messages.at(-1).id, g.row.id).run();
  return json({ messages });
}

export async function onRequestPost({ params, request, env, waitUntil }) {
  const g = await guard(env, request, params.cid);
  if (!g) return json({ error: "Not your location." }, 403);
  const { body } = await request.json().catch(() => ({}));
  if (!String(body || "").trim()) return json({ error: "Write a message first." }, 400);
  const id = await addMessage(env, waitUntil, { checkinId: g.row.id, kioskId: g.row.kiosk_id, sender: "business", author: g.member.name, body });
  await env.DB.prepare("UPDATE checkins SET seen_business = ? WHERE id = ?").bind(id, g.row.id).run();
  return json({ ok: true });
}

import { addMessage, statusMessage } from "../../../../lib/thread.js";
import { loadConfig } from "../../../../lib/queue.js";
// Visitor pays from their phone once the cashier sends the total.
// Demo only: no card is charged. A real version hands off to Stripe Checkout here.
export async function onRequestPost({ params, env, waitUntil }) {
  if (env.STRIPE_SECRET_KEY) return Response.json({ error: "This business takes card payments through Stripe." }, { status: 400 });
  if (!/^[0-9a-f]{32}$/.test(params.token)) return Response.json({ error: "Visit not found" }, { status: 404 });
  const row = await env.DB.prepare("SELECT id, status, amount_cents FROM checkins WHERE token = ?").bind(params.token).first();
  if (!row) return Response.json({ error: "Visit not found" }, { status: 404 });
  if (row.status !== "payment" || !row.amount_cents) return Response.json({ error: "Nothing to pay yet." }, { status: 400 });
  await env.DB.prepare("UPDATE checkins SET status = 'done', paid_at = ?, pay_method = 'phone' WHERE id = ?").bind(Date.now(), row.id).run();
  const paidRow = await env.DB.prepare("SELECT id, kiosk_id, ticket, status, amount_cents, paid_at, pay_method FROM checkins WHERE token = ?").bind(params.token).first();
  const rm = statusMessage("done", paidRow, await loadConfig(env, paidRow.kiosk_id));
  await addMessage(env, waitUntil, { checkinId: paidRow.id, kioskId: paidRow.kiosk_id, sender: "system", kind: rm.kind, body: rm.body });
  return Response.json({ ok: true });
}

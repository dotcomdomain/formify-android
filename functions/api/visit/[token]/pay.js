import { addMessage, statusMessage } from "../../../../lib/thread.js";
import { loadConfig } from "../../../../lib/queue.js";
import { afterDone } from "../../../../lib/levers.js";

// Demo payment from the phone (no card charged), used when Stripe isn't connected.
// kind "deposit" pays the deposit that holds a booking; otherwise it pays the cashier's total.
export async function onRequestPost({ params, request, env, waitUntil }) {
  if (env.STRIPE_SECRET_KEY) return Response.json({ error: "This business takes card payments through Stripe." }, { status: 400 });
  if (!/^[0-9a-f]{32}$/.test(params.token)) return Response.json({ error: "Visit not found" }, { status: 404 });
  const { kind } = await request.json().catch(() => ({}));
  const row = await env.DB.prepare("SELECT id, kiosk_id, ticket, status, amount_cents, deposit_cents, deposit_paid_at FROM checkins WHERE token = ?").bind(params.token).first();
  if (!row) return Response.json({ error: "Visit not found" }, { status: 404 });
  const config = await loadConfig(env, row.kiosk_id);

  if (kind === "deposit") {
    if (!row.deposit_cents || row.deposit_paid_at) return Response.json({ error: "No deposit due." }, { status: 400 });
    await env.DB.prepare("UPDATE checkins SET deposit_paid_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
    await addMessage(env, waitUntil, { checkinId: row.id, kioskId: row.kiosk_id, sender: "system", kind: "receipt", body: `Deposit $${(row.deposit_cents / 100).toFixed(2)} paid · ${config.name} · ticket ${row.ticket}. Your spot is held.` });
    return Response.json({ ok: true });
  }
  if (row.status !== "payment" || !row.amount_cents) return Response.json({ error: "Nothing to pay yet." }, { status: 400 });
  await env.DB.prepare("UPDATE checkins SET status = 'done', paid_at = ?, pay_method = 'phone' WHERE id = ?").bind(Date.now(), row.id).run();
  const paid = await env.DB.prepare("SELECT id, kiosk_id, ticket, status, amount_cents, paid_at, pay_method FROM checkins WHERE id = ?").bind(row.id).first();
  const rm = statusMessage("done", paid, config);
  await addMessage(env, waitUntil, { checkinId: paid.id, kioskId: paid.kiosk_id, sender: "system", kind: rm.kind, body: rm.body });
  await afterDone(env, waitUntil, paid, config);
  return Response.json({ ok: true });
}

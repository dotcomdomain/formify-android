import { addMessage, statusMessage } from "../../../../lib/thread.js";
import { loadConfig } from "../../../../lib/queue.js";
import { stripe } from "../../../../lib/stripe.js";
import { afterDone } from "../../../../lib/levers.js";

// Back from Stripe Checkout: ask Stripe directly whether it was paid. The redirect alone proves nothing.
export async function onRequestPost({ params, request, env, waitUntil }) {
  if (!/^[0-9a-f]{32}$/.test(params.token) || !env.STRIPE_SECRET_KEY) return Response.json({ error: "Visit not found" }, { status: 404 });
  const { session_id } = await request.json().catch(() => ({}));
  const row = await env.DB.prepare("SELECT id, kiosk_id, ticket, status, amount_cents, deposit_cents, deposit_paid_at, stripe_session FROM checkins WHERE token = ?").bind(params.token).first();
  if (!row || !row.stripe_session || row.stripe_session !== session_id) return Response.json({ error: "Payment not found." }, { status: 404 });

  const s = await stripe(env, "GET", `checkout/sessions/${encodeURIComponent(session_id)}`);
  if (s.metadata?.kind === "deposit") {
    if (row.deposit_paid_at) return Response.json({ ok: true, paid: true });
    const okDep = s.payment_status === "paid" && s.amount_total === row.deposit_cents && s.metadata?.checkin_token === params.token;
    if (!okDep) return Response.json({ ok: false, paid: false, status: s.payment_status });
    await env.DB.prepare("UPDATE checkins SET deposit_paid_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
    const cfg = await loadConfig(env, row.kiosk_id);
    await addMessage(env, waitUntil, { checkinId: row.id, kioskId: row.kiosk_id, sender: "system", kind: "receipt", body: `Deposit $${(row.deposit_cents / 100).toFixed(2)} paid by card · ${cfg.name} · ticket ${row.ticket}. Your spot is held.` });
    return Response.json({ ok: true, paid: true });
  }
  if (row.status === "done") return Response.json({ ok: true, paid: true });
  const ok = s.payment_status === "paid" && s.amount_total === row.amount_cents && s.metadata?.checkin_token === params.token;
  if (!ok) return Response.json({ ok: false, paid: false, status: s.payment_status });
  await env.DB.prepare("UPDATE checkins SET status = 'done', paid_at = ?, pay_method = 'card' WHERE id = ? AND status = 'payment'").bind(Date.now(), row.id).run();
  const paidRow = await env.DB.prepare("SELECT id, kiosk_id, ticket, status, amount_cents, paid_at, pay_method FROM checkins WHERE token = ?").bind(params.token).first();
  const rm = statusMessage("done", paidRow, await loadConfig(env, paidRow.kiosk_id));
  await addMessage(env, waitUntil, { checkinId: paidRow.id, kioskId: paidRow.kiosk_id, sender: "system", kind: rm.kind, body: rm.body });
  await afterDone(env, waitUntil, paidRow, await loadConfig(env, paidRow.kiosk_id));
  return Response.json({ ok: true, paid: true });
}

import { stripe } from "../../../../lib/stripe.js";

// Back from Stripe Checkout: ask Stripe directly whether it was paid. The redirect alone proves nothing.
export async function onRequestPost({ params, request, env }) {
  if (!/^[0-9a-f]{32}$/.test(params.token) || !env.STRIPE_SECRET_KEY) return Response.json({ error: "Visit not found" }, { status: 404 });
  const { session_id } = await request.json().catch(() => ({}));
  const row = await env.DB.prepare("SELECT id, status, amount_cents, stripe_session FROM checkins WHERE token = ?").bind(params.token).first();
  if (!row || !row.stripe_session || row.stripe_session !== session_id) return Response.json({ error: "Payment not found." }, { status: 404 });
  if (row.status === "done") return Response.json({ ok: true, paid: true });

  const s = await stripe(env, "GET", `checkout/sessions/${encodeURIComponent(session_id)}`);
  const ok = s.payment_status === "paid" && s.amount_total === row.amount_cents && s.metadata?.checkin_token === params.token;
  if (!ok) return Response.json({ ok: false, paid: false, status: s.payment_status });
  await env.DB.prepare("UPDATE checkins SET status = 'done', paid_at = ?, pay_method = 'card' WHERE id = ? AND status = 'payment'").bind(Date.now(), row.id).run();
  return Response.json({ ok: true, paid: true });
}

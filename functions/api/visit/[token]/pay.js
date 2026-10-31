// Visitor pays from their phone once the cashier sends the total.
// Demo only: no card is charged. A real version hands off to Stripe Checkout here.
export async function onRequestPost({ params, env }) {
  if (env.STRIPE_SECRET_KEY) return Response.json({ error: "This business takes card payments through Stripe." }, { status: 400 });
  if (!/^[0-9a-f]{32}$/.test(params.token)) return Response.json({ error: "Visit not found" }, { status: 404 });
  const row = await env.DB.prepare("SELECT id, status, amount_cents FROM checkins WHERE token = ?").bind(params.token).first();
  if (!row) return Response.json({ error: "Visit not found" }, { status: 404 });
  if (row.status !== "payment" || !row.amount_cents) return Response.json({ error: "Nothing to pay yet." }, { status: 400 });
  await env.DB.prepare("UPDATE checkins SET status = 'done', paid_at = ?, pay_method = 'phone' WHERE id = ?").bind(Date.now(), row.id).run();
  return Response.json({ ok: true });
}

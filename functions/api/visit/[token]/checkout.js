import { stripe, stripeMode } from "../../../../lib/stripe.js";

// Visitor taps Pay: create a Stripe Checkout session for exactly the amount the cashier sent.
export async function onRequestPost({ params, request, env }) {
  if (!/^[0-9a-f]{32}$/.test(params.token)) return Response.json({ error: "Visit not found" }, { status: 404 });
  const mode = stripeMode(env);
  if (mode === "off") return Response.json({ mode });
  // Safety for the hackathon build: refuse live keys outright.
  if (mode === "live") return Response.json({ error: "Live payments are disabled in this build." }, { status: 400 });

  const { kind } = await request.json().catch(() => ({}));
  const row = await env.DB.prepare("SELECT c.id, c.ticket, c.status, c.amount_cents, c.deposit_cents, c.deposit_paid_at, k.config FROM checkins c JOIN kiosks k ON k.id = c.kiosk_id WHERE c.token = ?").bind(params.token).first();
  if (!row) return Response.json({ error: "Visit not found" }, { status: 404 });
  const deposit = kind === "deposit";
  if (deposit && (!row.deposit_cents || row.deposit_paid_at)) return Response.json({ error: "No deposit due." }, { status: 400 });
  if (!deposit && (row.status !== "payment" || !row.amount_cents)) return Response.json({ error: "Nothing to pay yet." }, { status: 400 });
  const amount = deposit ? row.deposit_cents : row.amount_cents;

  const origin = new URL(request.url).origin;
  const name = JSON.parse(row.config).name;
  try {
    const session = await stripe(env, "POST", "checkout/sessions", {
      mode: "payment",
      line_items: { 0: { quantity: 1, price_data: { currency: "cad", unit_amount: amount, product_data: { name: `${name} · ${deposit ? "deposit for " : ""}ticket ${row.ticket}` } } } },
      success_url: `${origin}/visit.html?session_id={CHECKOUT_SESSION_ID}#${params.token}`,
      cancel_url: `${origin}/visit.html#${params.token}`,
      client_reference_id: String(row.id),
      metadata: { checkin_token: params.token, ticket: row.ticket, kind: deposit ? "deposit" : "total" }
    });
    await env.DB.prepare("UPDATE checkins SET stripe_session = ? WHERE id = ?").bind(session.id, row.id).run();
    return Response.json({ mode, url: session.url });
  } catch (e) {
    return Response.json({ error: `Couldn't start payment: ${e.message}` }, { status: 502 });
  }
}

import { ownsKiosk, json } from "../../../lib/auth.js";

const STATUSES = ["waiting", "serving", "payment", "done", "no-show"];

// Front desk moves a ticket along: waiting -> serving -> payment (cashier) -> done.
export async function onRequestPatch({ params, request, env }) {
  const row = await env.DB.prepare("SELECT kiosk_id FROM checkins WHERE id = ?").bind(params.cid).first();
  if (!row || !(await ownsKiosk(env, request, row.kiosk_id))) return json({ error: "Not your location." }, 403);
  const { status, amount, paid } = await request.json().catch(() => ({}));
  if (!STATUSES.includes(status)) return Response.json({ error: "Bad status" }, { status: 400 });

  if (status === "payment") {
    const cents = Math.round(Number(amount) * 100);
    if (!(cents > 0 && cents < 10_000_000)) return Response.json({ error: "Enter an amount." }, { status: 400 });
    await env.DB.prepare("UPDATE checkins SET status = 'payment', amount_cents = ?, served_at = COALESCE(served_at, ?) WHERE id = ?").bind(cents, Date.now(), params.cid).run();
    return Response.json({ ok: true });
  }
  if (status === "done" && paid === "counter") {
    await env.DB.prepare("UPDATE checkins SET status = 'done', paid_at = ?, pay_method = 'counter' WHERE id = ? AND amount_cents IS NOT NULL").bind(Date.now(), params.cid).run();
    return Response.json({ ok: true });
  }
  const servedAt = status === "serving" ? Date.now() : null;
  await env.DB.prepare("UPDATE checkins SET status = ?, served_at = COALESCE(?, served_at) WHERE id = ?").bind(status, servedAt, params.cid).run();
  return Response.json({ ok: true });
}

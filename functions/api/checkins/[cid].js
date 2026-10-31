import { ownsKiosk, json } from "../../../lib/auth.js";
import { loadConfig } from "../../../lib/queue.js";
import { addMessage, statusMessage } from "../../../lib/thread.js";
import { emit } from "../../../lib/webhook.js";

const STATUSES = ["waiting", "serving", "ready", "payment", "done", "no-show"];

// Front desk moves a ticket along: waiting -> serving (-> ready, for drop-off) -> payment (cashier) -> done.
// Every change also posts an update in the customer's visit thread and goes to the business's webhook.
export async function onRequestPatch({ params, request, env, waitUntil }) {
  const row = await env.DB.prepare("SELECT kiosk_id FROM checkins WHERE id = ?").bind(params.cid).first();
  const member = row && (await ownsKiosk(env, request, row.kiosk_id));
  if (!member) return json({ error: "Not your location." }, 403);
  const { status, amount, paid } = await request.json().catch(() => ({}));
  // Money actions are logged with who did them.
  const log = (action, detail) => env.DB.prepare("INSERT INTO audit (kiosk_id, action, detail, at) VALUES (?, ?, ?, ?)").bind(row.kiosk_id, action, `${detail} · by ${member.name} (${member.role})`, Date.now()).run();
  if (!STATUSES.includes(status)) return Response.json({ error: "Bad status" }, { status: 400 });

  if (status === "payment") {
    const cents = Math.round(Number(amount) * 100);
    if (!(cents > 0 && cents < 10_000_000)) return Response.json({ error: "Enter an amount." }, { status: 400 });
    await env.DB.prepare("UPDATE checkins SET status = 'payment', amount_cents = ?, served_at = COALESCE(served_at, ?) WHERE id = ?").bind(cents, Date.now(), params.cid).run();
    await log("payment requested", `$${(cents / 100).toFixed(2)} for check-in ${params.cid}`);
  } else if (status === "done" && paid === "counter") {
    await env.DB.prepare("UPDATE checkins SET status = 'done', paid_at = ?, pay_method = 'counter' WHERE id = ? AND amount_cents IS NOT NULL").bind(Date.now(), params.cid).run();
    await log("paid at counter", `Check-in ${params.cid}`);
  } else {
    const servedAt = status === "serving" ? Date.now() : null;
    await env.DB.prepare("UPDATE checkins SET status = ?, served_at = COALESCE(?, served_at) WHERE id = ?").bind(status, servedAt, params.cid).run();
  }

  const now = await env.DB.prepare("SELECT id, ticket, status, amount_cents, paid_at, pay_method FROM checkins WHERE id = ?").bind(params.cid).first();
  const config = await loadConfig(env, row.kiosk_id);
  const m = statusMessage(now.status, now, config);
  if (m) await addMessage(env, waitUntil, { checkinId: now.id, kioskId: row.kiosk_id, sender: "system", kind: m.kind, body: m.body });
  waitUntil(emit(env, row.kiosk_id, "checkin.updated", { checkin_id: now.id, ticket: now.ticket, status: now.status, amount: now.amount_cents ? now.amount_cents / 100 : null, paid: !!now.paid_at, by: member.name }));
  return Response.json({ ok: true });
}

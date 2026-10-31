import { addMessage } from "../../../../lib/thread.js";
import { loadConfig } from "../../../../lib/queue.js";
import { offerFreedSpot } from "../../../../lib/levers.js";
import { emit } from "../../../../lib/webhook.js";

// Customer can't make it: free the spot, and (if the playbook says so) offer it to people on their way.
export async function onRequestPost({ params, env, waitUntil }) {
  if (!/^[0-9a-f]{32}$/.test(params.token)) return Response.json({ error: "Visit not found" }, { status: 404 });
  const row = await env.DB.prepare("SELECT id, kiosk_id, ticket, status, deposit_paid_at FROM checkins WHERE token = ?").bind(params.token).first();
  if (!row) return Response.json({ error: "Visit not found" }, { status: 404 });
  if (!["pending", "waiting"].includes(row.status)) return Response.json({ error: "This visit can't be cancelled now. Message the business instead." }, { status: 400 });
  await env.DB.prepare("UPDATE checkins SET status = 'cancelled' WHERE id = ?").bind(row.id).run();
  const config = await loadConfig(env, row.kiosk_id);
  await addMessage(env, waitUntil, { checkinId: row.id, kioskId: row.kiosk_id, sender: "system", kind: "status", body: `You cancelled this visit. Thanks for letting ${config.name} know.${row.deposit_paid_at ? " Message them about your deposit." : ""}` });
  const offered = await offerFreedSpot(env, waitUntil, row.kiosk_id, config, row.id);
  waitUntil(emit(env, row.kiosk_id, "checkin.updated", { checkin_id: row.id, ticket: row.ticket, status: "cancelled", by: "customer" }));
  return Response.json({ ok: true, offered });
}

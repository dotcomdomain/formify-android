import { arrivalMessage, loadConfig, markArrived, position } from "../../../../lib/queue.js";
import { addMessage } from "../../../../lib/thread.js";

// Visitor who checked in on their phone types their 4-digit code at the kiosk.
export async function onRequestPost({ params, request, env, waitUntil }) {
  const config = await loadConfig(env, params.id);
  if (!config) return Response.json({ error: "Kiosk not found" }, { status: 404 });
  const { code } = await request.json().catch(() => ({}));
  const row = await env.DB.prepare("SELECT id, ticket, status, line_at FROM checkins WHERE kiosk_id = ? AND code = ? AND status = 'pending' AND created_at > ? ORDER BY created_at DESC")
    .bind(params.id, String(code || ""), Date.now() - 86400000).first();
  if (!row) return Response.json({ error: "That code didn't match. Check your phone, or see the front desk." }, { status: 404 });
  const { kept, line_at } = await markArrived(env, params.id, row, config);
  await addMessage(env, waitUntil, { checkinId: row.id, kioskId: params.id, sender: "system", kind: "status", body: arrivalMessage("Checked in at the kiosk.", config, kept) });
  return Response.json({ ticket: row.ticket, ...(await position(env, params.id, { status: "waiting", line_at }, config)) });
}

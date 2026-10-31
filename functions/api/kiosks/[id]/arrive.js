import { loadConfig, position } from "../../../../lib/queue.js";

// Visitor who checked in on their phone types their 4-digit code at the kiosk.
export async function onRequestPost({ params, request, env }) {
  const config = await loadConfig(env, params.id);
  if (!config) return Response.json({ error: "Kiosk not found" }, { status: 404 });
  const { code } = await request.json().catch(() => ({}));
  const row = await env.DB.prepare("SELECT id, ticket, status, arrived_at FROM checkins WHERE kiosk_id = ? AND code = ? AND status = 'pending' AND created_at > ? ORDER BY created_at DESC")
    .bind(params.id, String(code || ""), Date.now() - 86400000).first();
  if (!row) return Response.json({ error: "That code didn't match. Check your phone, or see the front desk." }, { status: 404 });
  const now = Date.now();
  await env.DB.prepare("UPDATE checkins SET status = 'waiting', arrived_at = ? WHERE id = ?").bind(now, row.id).run();
  return Response.json({ ticket: row.ticket, ...(await position(env, params.id, { status: "waiting", arrived_at: now }, config)) });
}

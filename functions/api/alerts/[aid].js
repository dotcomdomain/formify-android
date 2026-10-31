// Staff acknowledges an alert from the dashboard.
import { ownsKiosk, json } from "../../../lib/auth.js";

export async function onRequestPost({ params, request, env }) {
  const row = await env.DB.prepare("SELECT kiosk_id FROM alerts WHERE id = ?").bind(params.aid).first();
  if (!row || !(await ownsKiosk(env, request, row.kiosk_id))) return json({ error: "Not your location." }, 403);
  await env.DB.prepare("UPDATE alerts SET ack_at = ? WHERE id = ? AND ack_at IS NULL").bind(Date.now(), params.aid).run();
  return Response.json({ ok: true });
}

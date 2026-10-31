import { easeFor, publicBusiness } from "../../../lib/ease.js";

export async function onRequestGet({ params, env }) {
  const row = await env.DB.prepare("SELECT config FROM kiosks WHERE id = ?").bind(params.id).first();
  if (!row) return Response.json({ error: "Kiosk not found" }, { status: 404 });
  const config = JSON.parse(row.config);
  const ease = await easeFor(env, params.id);
  const { waiting } = await env.DB.prepare("SELECT COUNT(*) AS waiting FROM checkins WHERE kiosk_id = ? AND status = 'waiting'").bind(params.id).first();
  return Response.json({ id: params.id, config, business: { ...publicBusiness(params.id, config, ease), waiting } });
}

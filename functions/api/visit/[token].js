import { loadConfig, position } from "../../../lib/queue.js";

async function load(env, token) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  return env.DB.prepare("SELECT id, kiosk_id, ticket, status, code, arrived_at FROM checkins WHERE token = ?").bind(token).first();
}

// Visitor's phone polls this for their place in line.
export async function onRequestGet({ params, env }) {
  const row = await load(env, params.token);
  if (!row) return Response.json({ error: "Visit not found" }, { status: 404 });
  const config = await loadConfig(env, row.kiosk_id);
  return Response.json({
    name: config.name, brand_color: config.brand_color, ticket: row.ticket, status: row.status, code: row.code,
    ...(await position(env, row.kiosk_id, row, config))
  });
}

// "I'm here" button on the phone.
export async function onRequestPost({ params, env }) {
  const row = await load(env, params.token);
  if (!row) return Response.json({ error: "Visit not found" }, { status: 404 });
  if (row.status === "pending") await env.DB.prepare("UPDATE checkins SET status = 'waiting', arrived_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
  return Response.json({ ok: true });
}

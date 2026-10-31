// Staff acknowledges an alert from the dashboard.
export async function onRequestPost({ params, env }) {
  await env.DB.prepare("UPDATE alerts SET ack_at = ? WHERE id = ? AND ack_at IS NULL").bind(Date.now(), params.aid).run();
  return Response.json({ ok: true });
}

export async function onRequestGet({ params, env }) {
  const row = await env.DB.prepare("SELECT config FROM kiosks WHERE id = ?").bind(params.id).first();
  if (!row) return Response.json({ error: "Kiosk not found" }, { status: 404 });
  return Response.json({ id: params.id, config: JSON.parse(row.config) });
}

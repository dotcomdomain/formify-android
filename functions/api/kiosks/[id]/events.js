// Anonymous usage counts (page view, form started). No visitor identifiers are stored.
const TYPES = ["view", "start", "rebook"];

export async function onRequestPost({ params, request, env }) {
  const { type } = await request.json().catch(() => ({}));
  if (!TYPES.includes(type)) return Response.json({ error: "Bad event" }, { status: 400 });
  const kiosk = await env.DB.prepare("SELECT id FROM kiosks WHERE id = ?").bind(params.id).first();
  if (!kiosk) return Response.json({ error: "Kiosk not found" }, { status: 404 });
  await env.DB.prepare("INSERT INTO events (kiosk_id, type, at) VALUES (?, ?, ?)").bind(params.id, type, Date.now()).run();
  return Response.json({ ok: true });
}

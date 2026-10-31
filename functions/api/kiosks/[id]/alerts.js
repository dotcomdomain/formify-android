// Staff alert: "Need help" on the kiosk, or an emergency the assistant picked up.
export async function onRequestPost({ params, request, env }) {
  const kiosk = await env.DB.prepare("SELECT id FROM kiosks WHERE id = ?").bind(params.id).first();
  if (!kiosk) return Response.json({ error: "Kiosk not found" }, { status: 404 });
  const { kind, message, token } = await request.json().catch(() => ({}));
  const k = kind === "emergency" ? "emergency" : "help";

  // Don't stack duplicates if someone taps the button repeatedly.
  const recent = await env.DB.prepare("SELECT id FROM alerts WHERE kiosk_id = ? AND kind = ? AND ack_at IS NULL AND at > ?").bind(params.id, k, Date.now() - 20000).first();
  if (recent) return Response.json({ ok: true, id: recent.id });

  let ticket = null;
  if (typeof token === "string" && /^[0-9a-f]{32}$/.test(token)) {
    ticket = (await env.DB.prepare("SELECT ticket FROM checkins WHERE token = ? AND kiosk_id = ?").bind(token, params.id).first())?.ticket || null;
  }
  const { meta } = await env.DB.prepare("INSERT INTO alerts (kiosk_id, kind, message, ticket, at) VALUES (?, ?, ?, ?, ?)")
    .bind(params.id, k, String(message || "").slice(0, 300) || null, ticket, Date.now()).run();
  return Response.json({ ok: true, id: meta.last_row_id });
}

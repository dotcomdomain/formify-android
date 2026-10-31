// "How easy was this?" One rating per visit, only after the visitor has been served.
export async function onRequestPost({ params, request, env }) {
  if (!/^[0-9a-f]{32}$/.test(params.token)) return Response.json({ error: "Visit not found" }, { status: 404 });
  const row = await env.DB.prepare("SELECT id, kiosk_id, status FROM checkins WHERE token = ?").bind(params.token).first();
  if (!row) return Response.json({ error: "Visit not found" }, { status: 404 });
  if (row.status !== "serving" && row.status !== "done") return Response.json({ error: "You can rate once you've been served." }, { status: 400 });

  const { score, comment } = await request.json().catch(() => ({}));
  const s = Math.round(Number(score));
  if (!(s >= 1 && s <= 5)) return Response.json({ error: "Pick a score from 1 to 5." }, { status: 400 });

  // Comments go privately to the business; the public page only shows the average.
  await env.DB.prepare("INSERT OR IGNORE INTO ratings (kiosk_id, checkin_id, score, comment, at) VALUES (?, ?, ?, ?, ?)")
    .bind(row.kiosk_id, row.id, s, String(comment || "").trim().slice(0, 500) || null, Date.now()).run();
  return Response.json({ ok: true });
}

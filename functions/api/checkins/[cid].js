const STATUSES = ["waiting", "serving", "done", "no-show"];

// Front desk moves a ticket along the queue.
export async function onRequestPatch({ params, request, env }) {
  const { status } = await request.json().catch(() => ({}));
  if (!STATUSES.includes(status)) return Response.json({ error: "Bad status" }, { status: 400 });
  const servedAt = status === "serving" ? Date.now() : null;
  await env.DB.prepare("UPDATE checkins SET status = ?, served_at = COALESCE(?, served_at) WHERE id = ?").bind(status, servedAt, params.cid).run();
  return Response.json({ ok: true });
}

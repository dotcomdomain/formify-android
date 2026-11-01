import { decideApproval } from "../../../../lib/approvals.js";

// Customer approves or declines. The visit token is the key; no account needed.
export async function onRequestPost({ params, request, env, waitUntil }) {
  if (!/^[0-9a-f]{32}$/.test(params.token)) return Response.json({ error: "Visit not found" }, { status: 404 });
  const visit = await env.DB.prepare("SELECT id, kiosk_id, ticket, status FROM checkins WHERE token = ?").bind(params.token).first();
  if (!visit) return Response.json({ error: "Visit not found" }, { status: 404 });
  const { id, decision } = await request.json().catch(() => ({}));
  const r = await decideApproval(env, waitUntil, visit, id, decision);
  return Response.json(r, { status: r.error ? 400 : 200 });
}

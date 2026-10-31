import { ownsKiosk, json } from "../../../../lib/auth.js";
import { requestApproval } from "../../../../lib/approvals.js";

// Staff ask the customer to approve something on this visit.
export async function onRequestPost({ params, request, env, waitUntil }) {
  const visit = await env.DB.prepare("SELECT id, kiosk_id, ticket, status FROM checkins WHERE id = ?").bind(params.cid).first();
  const member = visit && (await ownsKiosk(env, request, visit.kiosk_id));
  if (!member) return json({ error: "Not your location." }, 403);
  const body = await request.json().catch(() => ({}));
  const r = await requestApproval(env, waitUntil, visit, body, member);
  return json(r, r.error ? 400 : 200);
}

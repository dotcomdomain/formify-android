import { memberFor, can, json } from "../../../../lib/auth.js";

// Owner removes someone's login. Their sessions end immediately.
export async function onRequestDelete({ params, request, env }) {
  const m = await memberFor(env, request);
  if (!can(m, "staff")) return json({ error: "Only the owner can remove people." }, 403);
  const target = await env.DB.prepare("SELECT id, role FROM members WHERE id = ? AND business_id = ?").bind(params.mid, m.business_id).first();
  if (!target) return json({ error: "Not found" }, 404);
  if (target.role === "owner") return json({ error: "The owner can't be removed." }, 400);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE kind = 'biz' AND subject_id = ?").bind(target.id),
    env.DB.prepare("DELETE FROM members WHERE id = ?").bind(target.id)
  ]);
  return json({ ok: true });
}

import { ownsKiosk, json } from "../../../../lib/auth.js";
import { loadInsights } from "../../../../lib/insights.js";

export async function onRequestGet({ params, request, env }) {
  const member = await ownsKiosk(env, request, params.id, "insights");
  if (!member) return json({ error: "Only this business's owner or a manager can view insights." }, 403);
  const days = Number(new URL(request.url).searchParams.get("days") || 30);
  if (![7, 30, 90].includes(days)) return json({ error: "Choose 7, 30 or 90 days." }, 400);
  const kiosk = await env.DB.prepare("SELECT id, config, created_at FROM kiosks WHERE id = ? AND owner_id = ?").bind(params.id, member.business_id).first();
  if (!kiosk) return json({ error: "Location not found." }, 404);
  try { return json(await loadInsights(env, kiosk, days)); }
  catch { return json({ error: "Could not load insights. Refresh to try again." }, 503); }
}

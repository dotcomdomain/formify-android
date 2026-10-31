import { easeFor, publicBusiness } from "../../../lib/ease.js";
import { ownsKiosk, json } from "../../../lib/auth.js";
import { sanitize } from "../../../lib/config.js";

export async function onRequestGet({ params, env }) {
  const row = await env.DB.prepare("SELECT config FROM kiosks WHERE id = ?").bind(params.id).first();
  if (!row) return Response.json({ error: "Kiosk not found" }, { status: 404 });
  const config = JSON.parse(row.config);
  const ease = await easeFor(env, params.id);
  const { waiting } = await env.DB.prepare("SELECT COUNT(*) AS waiting FROM checkins WHERE kiosk_id = ? AND status = 'waiting'").bind(params.id).first();
  return Response.json({ id: params.id, config, business: { ...publicBusiness(params.id, config, ease), waiting } });
}

// Owner edits a published form. The change is logged.
export async function onRequestPut({ params, request, env }) {
  const member = await ownsKiosk(env, request, params.id, "forms");
  if (!member) return json({ error: "Only the owner or a manager can edit forms." }, 403);
  const { config } = await request.json().catch(() => ({}));
  const clean = sanitize(config);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE kiosks SET config = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(clean), now, params.id),
    env.DB.prepare("INSERT INTO audit (kiosk_id, action, detail, at) VALUES (?, ?, ?, ?)").bind(params.id, "edited", `${member.name} (${member.role}) updated the form: ${clean.steps.reduce((n, s) => n + s.fields.length, 0)} fields, retention ${clean.retention_days} days.`, now)
  ]);
  return json({ ok: true });
}

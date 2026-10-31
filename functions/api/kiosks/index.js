import { sanitize } from "../../../lib/config.js";

const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8);

// Publish a kiosk. The config the owner approved is the one stored.
export async function onRequestPost({ request, env }) {
  const { config, source } = await request.json().catch(() => ({}));
  const clean = sanitize(config);
  const id = newId();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO kiosks (id, config, created_at, updated_at) VALUES (?, ?, ?, ?)").bind(id, JSON.stringify(clean), now, now),
    env.DB.prepare("INSERT INTO audit (kiosk_id, action, detail, at) VALUES (?, ?, ?, ?)")
      .bind(id, "published", `Owner approved and published (${source === "ai" ? "AI-generated" : "template"}). ${clean.steps.reduce((n, s) => n + s.fields.length, 0)} fields, retention ${clean.retention_days} days.`, now)
  ]);
  return Response.json({ id });
}

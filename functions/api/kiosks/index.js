import { sanitize } from "../../../lib/config.js";
import { sessionFor, json } from "../../../lib/auth.js";

const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8);

// Publish a location's form. Only a signed-in business can publish; it becomes the owner.
export async function onRequestPost({ request, env }) {
  const owner = await sessionFor(env, request, "biz");
  if (!owner) return json({ error: "Sign in to your business account to publish." }, 401);
  const { config, source } = await request.json().catch(() => ({}));
  const clean = sanitize(config);
  const id = newId();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO kiosks (id, config, created_at, updated_at, owner_id) VALUES (?, ?, ?, ?, ?)").bind(id, JSON.stringify(clean), now, now, owner),
    env.DB.prepare("INSERT INTO audit (kiosk_id, action, detail, at) VALUES (?, ?, ?, ?)")
      .bind(id, "published", `Owner approved and published (${source === "ai" ? "AI-generated" : "template"}). ${clean.steps.reduce((n, s) => n + s.fields.length, 0)} fields, retention ${clean.retention_days} days.`, now)
  ]);
  return json({ id });
}

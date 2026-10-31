import { newId, hashPassword, verifyPassword, startSession, sessionFor, endSession, validCredentials, json } from "../../../lib/auth.js";
import { easeFor } from "../../../lib/ease.js";

// Business accounts: /api/biz/signup, /api/biz/login, /api/biz/logout, /api/biz/me
export async function onRequestPost({ params, request, env }) {
  const body = await request.json().catch(() => ({}));

  if (params.action === "signup") {
    const c = validCredentials(body.email, body.password);
    if (c.error) return json(c, 400);
    const name = String(body.name || "").trim().slice(0, 80);
    if (!name) return json({ error: "Enter your business name." }, 400);
    if (await env.DB.prepare("SELECT id FROM businesses WHERE email = ?").bind(c.email).first()) return json({ error: "That email already has an account. Sign in instead." }, 409);
    const id = newId();
    const { hash, salt } = await hashPassword(c.password);
    await env.DB.prepare("INSERT INTO businesses (id, email, name, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, c.email, name, hash, salt, Date.now()).run();
    return json({ ok: true, business: { id, name, email: c.email } }, 200, await startSession(env, "biz", id));
  }

  if (params.action === "login") {
    const row = await env.DB.prepare("SELECT * FROM businesses WHERE email = ?").bind(String(body.email || "").trim().toLowerCase()).first();
    if (!row || !(await verifyPassword(String(body.password || ""), row))) return json({ error: "Email or password is wrong." }, 401);
    return json({ ok: true, business: { id: row.id, name: row.name, email: row.email } }, 200, await startSession(env, "biz", row.id));
  }

  if (params.action === "logout") return json({ ok: true }, 200, await endSession(env, request, "biz"));
  return json({ error: "Not found" }, 404);
}

// The signed-in business and its locations.
export async function onRequestGet({ params, request, env }) {
  if (params.action !== "me") return json({ error: "Not found" }, 404);
  const id = await sessionFor(env, request, "biz");
  if (!id) return json({ signedIn: false }, 401);
  const biz = await env.DB.prepare("SELECT id, name, email FROM businesses WHERE id = ?").bind(id).first();
  const { results } = await env.DB.prepare("SELECT id, config, created_at FROM kiosks WHERE owner_id = ? ORDER BY created_at").bind(id).all();
  const locations = await Promise.all(results.map(async (k) => {
    const c = JSON.parse(k.config);
    const { waiting } = await env.DB.prepare("SELECT COUNT(*) AS waiting FROM checkins WHERE kiosk_id = ? AND status = 'waiting'").bind(k.id).first();
    const { alerts } = await env.DB.prepare("SELECT COUNT(*) AS alerts FROM alerts WHERE kiosk_id = ? AND ack_at IS NULL AND at > ?").bind(k.id, Date.now() - 3 * 3600000).first();
    return { id: k.id, name: c.name, business_type: c.business_type, brand_color: c.brand_color, city: c.city, waiting, alerts, ease: await easeFor(env, k.id) };
  }));
  return json({ signedIn: true, business: biz, locations });
}

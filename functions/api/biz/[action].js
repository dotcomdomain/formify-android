import { newId, hashPassword, verifyPassword, startSession, endSession, validCredentials, memberFor, can, json } from "../../../lib/auth.js";
import { easeFor } from "../../../lib/ease.js";

// Business accounts: /api/biz/signup, login, logout, password (POST); me, staff (GET); staff (POST adds a login)
const ROLES = ["manager", "staff"];
const tempPassword = () => {
  const words = ["maple", "cedar", "harbor", "summit", "lantern", "meadow", "river", "copper", "willow", "granite"];
  const n = crypto.getRandomValues(new Uint32Array(3));
  return `${words[n[0] % words.length]}-${words[n[1] % words.length]}-${(n[2] % 9000) + 1000}`;
};

export async function onRequestPost({ params, request, env }) {
  const body = await request.json().catch(() => ({}));

  if (params.action === "signup") {
    const c = validCredentials(body.email, body.password);
    if (c.error) return json(c, 400);
    const name = String(body.name || "").trim().slice(0, 80);
    if (!name) return json({ error: "Enter your business name." }, 400);
    if (await env.DB.prepare("SELECT id FROM members WHERE email = ?").bind(c.email).first()) return json({ error: "That email already has an account. Sign in instead." }, 409);
    const id = newId(), now = Date.now();
    const { hash, salt } = await hashPassword(c.password);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO businesses (id, email, name, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, c.email, name, hash, salt, now),
      env.DB.prepare("INSERT INTO members (id, business_id, email, name, role, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, 'owner', ?, ?, ?)").bind(id, id, c.email, name, hash, salt, now)
    ]);
    return json({ ok: true }, 200, await startSession(env, "biz", id));
  }

  if (params.action === "login") {
    const row = await env.DB.prepare("SELECT * FROM members WHERE email = ?").bind(String(body.email || "").trim().toLowerCase()).first();
    if (!row || !(await verifyPassword(String(body.password || ""), row))) return json({ error: "Email or password is wrong." }, 401);
    return json({ ok: true, role: row.role }, 200, await startSession(env, "biz", row.id));
  }

  if (params.action === "logout") return json({ ok: true }, 200, await endSession(env, request, "biz"));

  const m = await memberFor(env, request);
  if (!m) return json({ error: "Sign in first." }, 401);

  if (params.action === "password") {
    const row = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(m.id).first();
    if (!(await verifyPassword(String(body.current || ""), row))) return json({ error: "Current password is wrong." }, 401);
    if (String(body.next || "").length < 8) return json({ error: "New password needs at least 8 characters." }, 400);
    const { hash, salt } = await hashPassword(String(body.next));
    await env.DB.batch([
      env.DB.prepare("UPDATE members SET pass_hash = ?, salt = ? WHERE id = ?").bind(hash, salt, m.id),
      // Sign out every other device with the old password.
      env.DB.prepare("DELETE FROM sessions WHERE kind = 'biz' AND subject_id = ?").bind(m.id)
    ]);
    return json({ ok: true }, 200, await startSession(env, "biz", m.id));
  }

  if (params.action === "staff") {
    if (!can(m, "staff")) return json({ error: "Only the owner can add people." }, 403);
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim().slice(0, 60);
    const role = ROLES.includes(body.role) ? body.role : "staff";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email." }, 400);
    if (!name) return json({ error: "Enter their name." }, 400);
    if (await env.DB.prepare("SELECT id FROM members WHERE email = ?").bind(email).first()) return json({ error: "That email already has a Formify login." }, 409);
    // No email service yet: the owner hands over a one-time password and the person changes it in Settings.
    const password = tempPassword();
    const { hash, salt } = await hashPassword(password);
    await env.DB.prepare("INSERT INTO members (id, business_id, email, name, role, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(newId(), m.business_id, email, name, role, hash, salt, Date.now()).run();
    return json({ ok: true, email, temp_password: password });
  }
  return json({ error: "Not found" }, 404);
}

export async function onRequestGet({ params, request, env }) {
  const m = await memberFor(env, request);
  if (!m) return json({ signedIn: false }, 401);

  if (params.action === "staff") {
    if (!can(m, "staff")) return json({ error: "Only the owner can manage people." }, 403);
    const { results } = await env.DB.prepare("SELECT id, email, name, role, created_at FROM members WHERE business_id = ? ORDER BY role = 'owner' DESC, created_at").bind(m.business_id).all();
    return json({ members: results });
  }
  if (params.action !== "me") return json({ error: "Not found" }, 404);

  const biz = await env.DB.prepare("SELECT id, name FROM businesses WHERE id = ?").bind(m.business_id).first();
  const { results } = await env.DB.prepare("SELECT id, config FROM kiosks WHERE owner_id = ? ORDER BY created_at").bind(m.business_id).all();
  const locations = await Promise.all(results.map(async (k) => {
    const c = JSON.parse(k.config);
    const { waiting } = await env.DB.prepare("SELECT COUNT(*) AS waiting FROM checkins WHERE kiosk_id = ? AND status = 'waiting'").bind(k.id).first();
    const { alerts } = await env.DB.prepare("SELECT COUNT(*) AS alerts FROM alerts WHERE kiosk_id = ? AND ack_at IS NULL AND at > ?").bind(k.id, Date.now() - 3 * 3600000).first();
    return { id: k.id, name: c.name, business_type: c.business_type, brand_color: c.brand_color, city: c.city, waiting, alerts, ease: await easeFor(env, k.id) };
  }));
  return json({
    signedIn: true, business: { id: biz.id, name: biz.name },
    member: { id: m.id, name: m.name, email: m.email, role: m.role },
    perms: { forms: can(m, "forms"), insights: can(m, "insights"), staff: can(m, "staff") },
    payments: !!env.STRIPE_SECRET_KEY, locations
  });
}

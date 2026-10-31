import { newId, hashPassword, verifyPassword, startSession, endSession, validCredentials, memberFor, can, json } from "../../../lib/auth.js";
import { easeFor } from "../../../lib/ease.js";
import { cleanProfile, slugify, validSlug } from "../../../lib/page.js";

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

  if (params.action === "page") {
    if (!can(m, "forms")) return json({ error: "Only the owner or a manager can edit the page." }, 403);
    const name = String(body.name || "").trim().slice(0, 80);
    const slug = slugify(body.slug || name);
    if (!name) return json({ error: "Enter your business name." }, 400);
    if (!validSlug(slug)) return json({ error: "Page link needs 3-40 letters, numbers or dashes." }, 400);
    const taken = await env.DB.prepare("SELECT id FROM businesses WHERE slug = ? AND id != ?").bind(slug, m.business_id).first();
    if (taken) return json({ error: `The page link /p/${slug} is taken. Try another.` }, 409);
    const forms = Array.isArray(body.forms) ? body.forms.slice(0, 30) : [];
    const profile = cleanProfile({ ...body.profile, form_order: forms.map((f) => f.id) });
    const stmts = [env.DB.prepare("UPDATE businesses SET name = ?, slug = ?, profile = ? WHERE id = ?").bind(name, slug, JSON.stringify(profile), m.business_id)];
    // Form labels and visibility live on each form, so the kiosk and search use them too.
    for (const f of forms) {
      const row = await env.DB.prepare("SELECT config FROM kiosks WHERE id = ? AND owner_id = ?").bind(String(f.id), m.business_id).first();
      if (!row) continue;
      const c = JSON.parse(row.config);
      c.form_label = String(f.label || "").trim().slice(0, 60);
      c.listed = f.listed !== false;
      stmts.push(env.DB.prepare("UPDATE kiosks SET config = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(c), Date.now(), String(f.id)));
    }
    await env.DB.batch(stmts);
    return json({ ok: true, slug });
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
  if (params.action === "page") {
    const biz = await env.DB.prepare("SELECT name, slug, profile FROM businesses WHERE id = ?").bind(m.business_id).first();
    const profile = cleanProfile(biz.profile ? JSON.parse(biz.profile) : {});
    const { results } = await env.DB.prepare("SELECT id, config FROM kiosks WHERE owner_id = ? ORDER BY created_at").bind(m.business_id).all();
    const forms = results.map((k) => { const c = JSON.parse(k.config); return { id: k.id, label: c.form_label || "", fallback: c.welcome_title || c.name, subtitle: c.welcome_subtitle, listed: c.listed !== false }; });
    forms.sort((a, b) => (profile.form_order.indexOf(a.id) + 1 || 999) - (profile.form_order.indexOf(b.id) + 1 || 999));
    return json({ name: biz.name, slug: biz.slug || slugify(biz.name), published: !!biz.slug, profile, forms });
  }
  if (params.action !== "me") return json({ error: "Not found" }, 404);

  const biz = await env.DB.prepare("SELECT id, name, slug FROM businesses WHERE id = ?").bind(m.business_id).first();
  const { results } = await env.DB.prepare("SELECT id, config FROM kiosks WHERE owner_id = ? ORDER BY created_at").bind(m.business_id).all();
  const locations = await Promise.all(results.map(async (k) => {
    const c = JSON.parse(k.config);
    const { waiting } = await env.DB.prepare("SELECT COUNT(*) AS waiting FROM checkins WHERE kiosk_id = ? AND status = 'waiting'").bind(k.id).first();
    const { alerts } = await env.DB.prepare("SELECT COUNT(*) AS alerts FROM alerts WHERE kiosk_id = ? AND ack_at IS NULL AND at > ?").bind(k.id, Date.now() - 3 * 3600000).first();
    return { id: k.id, name: c.name, business_type: c.business_type, brand_color: c.brand_color, city: c.city, waiting, alerts, ease: await easeFor(env, k.id) };
  }));
  return json({
    signedIn: true, business: { id: biz.id, name: biz.name, slug: biz.slug || null },
    member: { id: m.id, name: m.name, email: m.email, role: m.role },
    perms: { forms: can(m, "forms"), insights: can(m, "insights"), staff: can(m, "staff") },
    payments: !!env.STRIPE_SECRET_KEY, locations
  });
}

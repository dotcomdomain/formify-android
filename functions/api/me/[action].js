import { newId, hashPassword, verifyPassword, startSession, sessionFor, endSession, validCredentials, json } from "../../../lib/auth.js";
import { seal, open } from "../../../lib/vault.js";

// Optional customer accounts: /api/me/signup, login, logout, profile (GET/PUT), account (DELETE)
const PROFILE_KEYS = ["name", "dob", "health_card", "phone", "email"];
const cleanProfile = (p) => Object.fromEntries(PROFILE_KEYS.filter((k) => typeof p?.[k] === "string" && p[k].trim()).map((k) => [k, p[k].trim().slice(0, 120)]));

export async function onRequestPost({ params, request, env }) {
  const body = await request.json().catch(() => ({}));

  if (params.action === "signup") {
    const c = validCredentials(body.email, body.password);
    if (c.error) return json(c, 400);
    if (await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(c.email).first()) return json({ error: "That email already has an account. Sign in instead." }, 409);
    const id = newId();
    const { hash, salt } = await hashPassword(c.password);
    // Whatever was saved on this phone moves into the account (encrypted).
    await env.DB.prepare("INSERT INTO users (id, email, pass_hash, salt, profile, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, c.email, hash, salt, await seal(env, cleanProfile(body.profile)), Date.now()).run();
    return json({ ok: true, email: c.email }, 200, await startSession(env, "user", id));
  }

  if (params.action === "login") {
    const row = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(String(body.email || "").trim().toLowerCase()).first();
    if (!row || !(await verifyPassword(String(body.password || ""), row))) return json({ error: "Email or password is wrong." }, 401);
    return json({ ok: true, email: row.email }, 200, await startSession(env, "user", row.id));
  }

  if (params.action === "logout") return json({ ok: true }, 200, await endSession(env, request, "user"));
  return json({ error: "Not found" }, 404);
}

export async function onRequestGet({ params, request, env }) {
  if (params.action !== "profile") return json({ error: "Not found" }, 404);
  const id = await sessionFor(env, request, "user");
  if (!id) return json({ signedIn: false }, 401);
  const row = await env.DB.prepare("SELECT email, profile FROM users WHERE id = ?").bind(id).first();
  const { results } = await env.DB.prepare(
    "SELECT c.ticket, c.token, c.status, c.created_at, k.config FROM checkins c JOIN kiosks k ON k.id = c.kiosk_id WHERE c.user_id = ? ORDER BY c.created_at DESC LIMIT 20"
  ).bind(id).all();
  const visits = results.map((v) => ({ ticket: v.ticket, token: v.token, status: v.status, at: v.created_at, name: JSON.parse(v.config).name }));
  return json({ signedIn: true, email: row.email, profile: await open(env, row.profile), visits });
}

export async function onRequestPut({ params, request, env }) {
  if (params.action !== "profile") return json({ error: "Not found" }, 404);
  const id = await sessionFor(env, request, "user");
  if (!id) return json({ error: "Sign in first." }, 401);
  const body = await request.json().catch(() => ({}));
  await env.DB.prepare("UPDATE users SET profile = ? WHERE id = ?").bind(await seal(env, cleanProfile(body.profile)), id).run();
  return json({ ok: true });
}

// Delete the account and everything tied to it. Past check-ins stay with the business
// (they're the business's records) but are unlinked from the person.
export async function onRequestDelete({ params, request, env }) {
  if (params.action !== "account") return json({ error: "Not found" }, 404);
  const id = await sessionFor(env, request, "user");
  if (!id) return json({ error: "Sign in first." }, 401);
  await env.DB.batch([
    env.DB.prepare("UPDATE checkins SET user_id = NULL WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM sessions WHERE kind = 'user' AND subject_id = ?").bind(id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id)
  ]);
  return json({ ok: true }, 200, "fz_user=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
}

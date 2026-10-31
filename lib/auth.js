// Accounts and sessions for businesses ("biz") and customers ("user").
// Passwords: PBKDF2-SHA256 (100k iterations, per-account salt). Sessions: random token in an
// HttpOnly cookie; only its SHA-256 hash is stored.

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const COOKIE = { biz: "fz_biz", user: "fz_user" };
const SESSION_DAYS = 30;

export const newId = () => hex(crypto.getRandomValues(new Uint8Array(8)));

export async function hashPassword(password, saltHex) {
  const salt = saltHex || hex(crypto.getRandomValues(new Uint8Array(16)));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return { hash: hex(bits), salt };
}

// Constant-time compare so response timing doesn't leak how much of a hash matched.
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function verifyPassword(password, row) {
  const { hash } = await hashPassword(password, row.salt);
  return same(hash, row.pass_hash);
}

const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

export async function startSession(env, kind, subjectId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare("INSERT INTO sessions (token_hash, kind, subject_id, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha(token), kind, subjectId, Date.now() + SESSION_DAYS * 86400000).run();
  return `${COOKIE[kind]}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

function readCookie(request, name) {
  const m = (request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([0-9a-f]{64})`));
  return m ? m[1] : null;
}

// Returns the signed-in subject id for this kind, or null.
export async function sessionFor(env, request, kind) {
  const token = readCookie(request, COOKIE[kind]);
  if (!token) return null;
  const row = await env.DB.prepare("SELECT subject_id, expires_at FROM sessions WHERE token_hash = ? AND kind = ?").bind(await sha(token), kind).first();
  if (!row || row.expires_at < Date.now()) return null;
  return row.subject_id;
}

export async function endSession(env, request, kind) {
  const token = readCookie(request, COOKIE[kind]);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha(token)).run();
  return `${COOKIE[kind]}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function validCredentials(email, password) {
  const e = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 120) return { error: "Enter a valid email." };
  if (String(password || "").length < 8) return { error: "Password needs at least 8 characters." };
  return { email: e, password: String(password) };
}

// Roles: owner (everything + staff), manager (forms + insights), staff (live front desk).
const PERMS = {
  live: ["owner", "manager", "staff"],
  forms: ["owner", "manager"],
  insights: ["owner", "manager"],
  staff: ["owner"]
};
export const can = (member, perm) => !!member && PERMS[perm].includes(member.role);

// The signed-in business member (any role), or null.
export async function memberFor(env, request) {
  const id = await sessionFor(env, request, "biz");
  if (!id) return null;
  return env.DB.prepare("SELECT id, business_id, email, name, role FROM members WHERE id = ?").bind(id).first();
}

// Member of the business that owns this kiosk, with the needed permission? Returns the member or null.
export async function ownsKiosk(env, request, kioskId, perm = "live") {
  const m = await memberFor(env, request);
  if (!can(m, perm)) return null;
  const row = await env.DB.prepare("SELECT id FROM kiosks WHERE id = ? AND owner_id = ?").bind(kioskId, m.business_id).first();
  return row ? m : null;
}

export const json = (data, status = 200, cookie) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store", ...(cookie ? { "set-cookie": cookie } : {}) }
});

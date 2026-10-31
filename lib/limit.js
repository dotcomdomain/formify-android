// Fixed-window rate limits stored in D1. The key is a hash that changes every window, so no IP is kept.
async function hash(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function overLimit(env, request, scope, max, windowSeconds) {
  try {
    const now = Date.now();
    const ms = windowSeconds * 1000;
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const key = await hash(`${scope}:${ip}:${Math.floor(now / ms)}`);
    const row = await env.DB.prepare("INSERT INTO rate_limits (key, n, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET n = n + 1 RETURNING n")
      .bind(key, now + ms).first();
    if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(now).run();
    return row.n > max;
  } catch {
    return false; // A broken limiter must never break a check-in.
  }
}

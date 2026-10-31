// Minimal Stripe REST client (no SDK). Test mode is decided by the key: sk_test_... never moves real money.

function form(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v !== null && typeof v === "object") form(v, key, out);
    else if (v !== undefined) out.append(key, String(v));
  }
  return out;
}

export async function stripe(env, method, path, body) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body: body ? form(body) : undefined
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || `Stripe error ${r.status}`);
  return data;
}

export const stripeMode = (env) => (!env.STRIPE_SECRET_KEY ? "off" : env.STRIPE_SECRET_KEY.startsWith("sk_test_") ? "test" : "live");

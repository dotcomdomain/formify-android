// Formify feeds the business's own systems: every event is POSTed to their webhook (Zapier, Make, their POS
// or booking tool, a Google Sheet). Signed with HMAC-SHA256 so they can verify it came from Formify.

async function sign(secret, body) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function emit(env, kioskId, event, data) {
  try {
    const biz = await env.DB.prepare("SELECT b.webhook_url, b.webhook_secret, k.config FROM kiosks k JOIN businesses b ON b.id = k.owner_id WHERE k.id = ?").bind(kioskId).first();
    if (!biz?.webhook_url) return;
    const config = JSON.parse(biz.config);
    const body = JSON.stringify({ event, at: new Date().toISOString(), location: { id: kioskId, name: config.name, form: config.form_label || config.welcome_title }, data });
    await fetch(biz.webhook_url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-formify-event": event, "x-formify-signature": await sign(biz.webhook_secret || "", body) },
      body
    });
  } catch {} // A broken webhook must never break a check-in.
}

// Labelled answers for exports and webhooks (field ids are internal).
export function labelled(config, answers) {
  const out = {};
  for (const s of config.steps) for (const f of s.fields) if (answers[f.id] !== undefined) out[f.label] = answers[f.id];
  return out;
}

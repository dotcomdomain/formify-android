// Sends through Cloudflare Email Service when it is configured. Returns false otherwise, so callers can fall back.
// Needs secrets CF_ACCOUNT_ID, CF_EMAIL_TOKEN and EMAIL_FROM (an address on a domain onboarded to Email Sending).
export async function sendEmail(env, { to, subject, text, html, fromName, replyTo }) {
  if (!env.CF_ACCOUNT_ID || !env.CF_EMAIL_TOKEN || !env.EMAIL_FROM) return false;
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/email/sending/send`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.CF_EMAIL_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ to, from: { address: env.EMAIL_FROM, name: fromName }, subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) })
    });
    return r.ok;
  } catch {
    return false; // A mail outage must never lose the invite; the owner can still send it themselves.
  }
}

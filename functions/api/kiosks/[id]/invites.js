import { ownsKiosk, json } from "../../../../lib/auth.js";
import { loadConfig } from "../../../../lib/queue.js";
import { randomToken } from "../../../../lib/checkin.js";
import { sendEmail } from "../../../../lib/email.js";

const DAY = 86400000;
const KEEP_DAYS = 30;
const MAX_PER_DAY = 100;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Recent invites for one form. Old ones are removed on read, so customer emails aren't kept longer than needed.
export async function onRequestGet({ params, request, env }) {
  const member = await ownsKiosk(env, request, params.id);
  if (!member) return json({ error: "Not your location." }, 403);
  await env.DB.prepare("DELETE FROM invites WHERE kiosk_id = ? AND created_at < ?").bind(params.id, Date.now() - KEEP_DAYS * DAY).run();
  const { results } = await env.DB.prepare("SELECT email, name, status, created_at, opened_at FROM invites WHERE kiosk_id = ? ORDER BY created_at DESC LIMIT 8").bind(params.id).all();
  return json({ invites: results });
}

// Staff invite a customer. Sends automatically when email is set up; otherwise hands back a ready-made draft.
export async function onRequestPost({ params, request, env }) {
  const member = await ownsKiosk(env, request, params.id);
  if (!member) return json({ error: "Not your location." }, 403);
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase().slice(0, 120);
  const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email." }, 400);
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM invites WHERE kiosk_id = ? AND created_at > ?").bind(params.id, Date.now() - DAY).first();
  if (n >= MAX_PER_DAY) return json({ error: "That's the invite limit for today." }, 429);

  const config = await loadConfig(env, params.id);
  const token = randomToken();
  const link = `${new URL(request.url).origin}/i/${token}`;
  const form = config.form_label || config.welcome_title || "form";
  const subject = `${config.name}: please fill in your ${form.toLowerCase()}`;
  // Internal forms, like staff onboarding, aren't tied to a customer visit.
  const when = config.listed === false ? "" : " before your visit";
  const text = `Hi${name ? ` ${name}` : ""},\n\n${config.name} asked you to fill in your ${form.toLowerCase()}${when}. It takes a couple of minutes, with no app or account needed:\n\n${link}\n\nThanks,\n${config.name}`;
  const html = `<p>Hi${name ? ` ${esc(name)}` : ""},</p><p>${esc(config.name)} asked you to fill in your ${esc(form.toLowerCase())}${when}. It takes a couple of minutes, with no app or account needed.</p><p><a href="${link}">Open the form</a></p><p>Thanks,<br>${esc(config.name)}</p>`;

  const sent = await sendEmail(env, { to: email, subject, text, html, fromName: config.name, replyTo: member.email });
  await env.DB.batch([
    env.DB.prepare("INSERT INTO invites (token, kiosk_id, email, name, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(token, params.id, email, name || null, sent ? "sent" : "created", member.name, Date.now()),
    env.DB.prepare("INSERT INTO audit (kiosk_id, action, detail, at) VALUES (?, ?, ?, ?)").bind(params.id, "invite created", `${form} · by ${member.name} (${member.role})`, Date.now())
  ]);
  return json({ ok: true, sent, link, ...(sent ? {} : { mailto: `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}` }) });
}

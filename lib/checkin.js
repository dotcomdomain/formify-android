// Creating a check-in. Shared by the kiosk/phone endpoint and the MCP server for AI agents.
import { handoffNote } from "./ai.js";
import { holdsPlace, position } from "./queue.js";
import { addMessage } from "./thread.js";
import { emit, labelled } from "./webhook.js";
import { playbookOf } from "./playbooks.js";

const randomCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 9000 + 1000);
export const randomToken = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");

const CHANNELS = ["kiosk", "phone", "ai agent"];
const VIA = ["voice", "scan", "assistant"];
const MAX_HELD = 40; // Places a walk-in line will hold for people not there yet, so a flood can't fill it.

// Returns { error } or the visitor's ticket. Remote channels (phone, AI agent) wait for arrival.
export async function createCheckin(env, waitUntil, kioskId, config, { answers, consent, channel, language, via, userId }) {
  if (!consent) return { error: "Consent is required." };

  // Keep only fields the config defines, so nothing else can be stored.
  const clean = {};
  for (const step of config.steps) for (const f of step.fields) {
    const v = answers?.[f.id];
    if (f.required && (v === undefined || v === "" || v === false)) return { error: `${f.label} is required.` };
    if (v !== undefined && v !== "") clean[f.id] = f.type === "checkbox" ? !!v : String(v).slice(0, 500);
  }

  const ch = CHANNELS.includes(channel) ? channel : "kiosk";
  const remote = ch !== "kiosk";
  const how = [ch, ...(Array.isArray(via) ? via.filter((v) => VIA.includes(v)) : [])].join(", ");
  const lang = /^[a-z]{2}$/.test(language) ? language : "en";

  const start = new Date(); start.setHours(0, 0, 0, 0);
  if (remote && holdsPlace(config)) {
    const held = await env.DB.prepare("SELECT COUNT(*) AS n FROM checkins WHERE kiosk_id = ? AND status = 'pending' AND created_at >= ?").bind(kioskId, start.getTime()).first();
    if (held.n >= MAX_HELD) return { error: "This line is full right now. Please try again soon." };
  }
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM checkins WHERE kiosk_id = ? AND created_at >= ?").bind(kioskId, start.getTime()).first();
  const ticket = `${config.ticket_prefix}${String(n + 1).padStart(3, "0")}`;
  const now = Date.now();
  const token = randomToken(), code = randomCode();
  // Forms-only (waivers, sign-ups) are done on submit; everything else joins the line.
  const formsOnly = config.flow === "forms_only";
  const status = formsOnly ? "done" : remote ? "pending" : "waiting";
  const pb = playbookOf(config);
  // A deposit holds a remote spot (No empty slots); walk-ups at the kiosk never pay one.
  const deposit = remote && !formsOnly && pb.levers.deposit_cents ? pb.levers.deposit_cents : null;
  const { meta } = await env.DB.prepare(
    "INSERT INTO checkins (kiosk_id, ticket, answers, status, created_at, arrived_at, line_at, token, code, channel, language, user_id, deposit_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(kioskId, ticket, JSON.stringify(clean), status, now, remote ? null : now, now, token, code, how, lang, userId || null, deposit).run();
  await env.DB.prepare("INSERT INTO events (kiosk_id, type, at) VALUES (?, 'checkin', ?)").bind(kioskId, now).run();

  // The note is written in the background so the visitor never waits on it.
  waitUntil((async () => {
    try {
      const note = await handoffNote(env, config, clean, { channel: how, language: lang });
      await env.DB.prepare("UPDATE checkins SET summary = ?, flags = ? WHERE id = ?").bind(note.summary, JSON.stringify(note.flags), meta.last_row_id).run();
    } catch {}
  })());

  const first = formsOnly ? `${config.form_label || "Form"} received by ${config.name}. Ticket ${ticket}. ${config.done_message}`
    : remote ? `Checked in at ${config.name}${config.form_label ? ` (${config.form_label})` : ""}. Ticket ${ticket}. ${pb.id === "faster_mornings" ? "Everything's done, so go straight to the express counter when you arrive. " : ""}${holdsPlace(config) ? "Your place in line is saved. " : ""}When you arrive, tap "I'm here" or enter code ${code} at the kiosk.${deposit ? ` A $${(deposit / 100).toFixed(2)} deposit holds your spot; pay it below. It's kept if you don't show up.` : ""}`
    : `Checked in at ${config.name}. Ticket ${ticket}. You're in line; we'll message you here when it's your turn.`;
  await addMessage(env, null, { checkinId: meta.last_row_id, kioskId, sender: "system", kind: "status", body: first });
  waitUntil(emit(env, kioskId, "checkin.created", { checkin_id: meta.last_row_id, ticket, status, channel: how, language: lang, answers: labelled(config, clean) }));

  const pos = await position(env, kioskId, { status, line_at: now }, config);
  return { ticket, token, code: remote && !formsOnly ? code : undefined, status, ...pos };
}

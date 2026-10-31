// Creating a check-in. Shared by the kiosk/phone endpoint and the MCP server for AI agents.
import { handoffNote } from "./ai.js";
import { position } from "./queue.js";

const randomCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 9000 + 1000);
export const randomToken = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");

const CHANNELS = ["kiosk", "phone", "ai agent"];
const VIA = ["voice", "scan", "assistant"];

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
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM checkins WHERE kiosk_id = ? AND created_at >= ?").bind(kioskId, start.getTime()).first();
  const ticket = `${config.ticket_prefix}${String(n + 1).padStart(3, "0")}`;
  const now = Date.now();
  const token = randomToken(), code = randomCode();
  const status = remote ? "pending" : "waiting";
  const { meta } = await env.DB.prepare(
    "INSERT INTO checkins (kiosk_id, ticket, answers, status, created_at, arrived_at, token, code, channel, language, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(kioskId, ticket, JSON.stringify(clean), status, now, remote ? null : now, token, code, how, lang, userId || null).run();
  await env.DB.prepare("INSERT INTO events (kiosk_id, type, at) VALUES (?, 'checkin', ?)").bind(kioskId, now).run();

  // The note is written in the background so the visitor never waits on it.
  waitUntil((async () => {
    try {
      const note = await handoffNote(env, config, clean, { channel: how, language: lang });
      await env.DB.prepare("UPDATE checkins SET summary = ?, flags = ? WHERE id = ?").bind(note.summary, JSON.stringify(note.flags), meta.last_row_id).run();
    } catch {}
  })());

  const pos = await position(env, kioskId, { status, arrived_at: now }, config);
  return { ticket, token, code: remote ? code : undefined, status, ...pos };
}

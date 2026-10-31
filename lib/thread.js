// The visit thread: one conversation per visit holding every update, message, receipt and follow-up.
import { emit } from "./webhook.js";

export async function addMessage(env, waitUntil, { checkinId, kioskId, sender, author = null, kind = "text", body }) {
  const text = String(body || "").trim().slice(0, 1000);
  if (!text) return null;
  const { meta } = await env.DB.prepare("INSERT INTO messages (checkin_id, kiosk_id, sender, author, kind, body, at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(checkinId, kioskId, sender, author, kind, text, Date.now()).run();
  if (waitUntil) waitUntil(emit(env, kioskId, "message.created", { checkin_id: checkinId, sender, kind, body: text }));
  return meta.last_row_id;
}

export async function messagesFor(env, checkinId) {
  return (await env.DB.prepare("SELECT id, sender, author, kind, body, at FROM messages WHERE checkin_id = ? ORDER BY id").bind(checkinId).all()).results;
}

const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;

// What the customer sees when the business moves their ticket along, per flow.
export function statusMessage(status, row, config) {
  const dropoff = config.flow === "dropoff";
  if (status === "serving") return { kind: "status", body: dropoff ? "We've started on it. We'll message you when it's ready." : "It's your turn. Please head to the front desk." };
  if (status === "ready") return { kind: "status", body: "It's ready for pickup." };
  if (status === "payment") return { kind: "status", body: `Your total is ${money(row.amount_cents)}. Pay here on your phone, or at the counter.` };
  if (status === "done") return row.paid_at ? { kind: "receipt", body: `Paid ${money(row.amount_cents)} ${row.pay_method === "card" ? "by card" : row.pay_method === "phone" ? "on your phone" : "at the counter"} · ${config.name} · ticket ${row.ticket}` }
    : { kind: "status", body: `All done. Thanks for visiting ${config.name}! How did it go? You can rate your visit below.` };
  if (status === "no-show") return { kind: "status", body: "We marked this visit as a no-show. Message us if that's a mistake." };
  if (status === "waiting") return { kind: "status", body: "You're in line. We'll message you here when it's your turn." };
  return null;
}

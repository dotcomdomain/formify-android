// Approvals: a business asks the customer to OK something (extra work, a price change) inside the visit thread.
import { addMessage } from "./thread.js";
import { emit } from "./webhook.js";

const OPEN_STATUSES = ["pending", "waiting", "serving", "ready"];
const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
export const approvalText = (a) => (a.amount_cents ? `${a.title} (${money(a.amount_cents)})` : a.title);

const audit = (env, kioskId, action, detail) => env.DB.prepare("INSERT INTO audit (kiosk_id, action, detail, at) VALUES (?, ?, ?, ?)").bind(kioskId, action, detail, Date.now()).run();

export async function approvalsFor(env, checkinId) {
  return (await env.DB.prepare("SELECT id, message_id, title, amount_cents, status, requested_by, requested_at, decided_at FROM approvals WHERE checkin_id = ? ORDER BY id").bind(checkinId).all()).results;
}

export async function pendingApproval(env, checkinId) {
  return env.DB.prepare("SELECT id, title, amount_cents, requested_by FROM approvals WHERE checkin_id = ? AND status = 'pending' ORDER BY id LIMIT 1").bind(checkinId).first();
}

export const canApprove = (status) => OPEN_STATUSES.includes(status);

// Returns { error } or the new approval. One open question at a time, so the customer is never unsure what they're answering.
export async function requestApproval(env, waitUntil, visit, { title, amount }, member) {
  const clean = String(title || "").trim().slice(0, 140);
  if (clean.length < 3) return { error: "Say what needs approval." };
  const dollars = amount === undefined || amount === null || amount === "" ? 0 : Number(amount);
  const cents = Math.round(dollars * 100);
  if (!(cents >= 0 && cents < 10_000_000)) return { error: "Enter a valid amount." };
  if (!canApprove(visit.status)) return { error: "This visit is closed." };
  if (await pendingApproval(env, visit.id)) return { error: "They haven't answered the last request yet." };

  const a = { title: clean, amount_cents: cents };
  const messageId = await addMessage(env, waitUntil, { checkinId: visit.id, kioskId: visit.kiosk_id, sender: "business", author: member.name, kind: "approval", body: `Approval needed: ${approvalText(a)}` });
  const { meta } = await env.DB.prepare("INSERT INTO approvals (checkin_id, kiosk_id, message_id, title, amount_cents, requested_by, requested_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(visit.id, visit.kiosk_id, messageId, clean, cents, member.name, Date.now()).run();
  await audit(env, visit.kiosk_id, "approval requested", `${approvalText(a)} · ticket ${visit.ticket} · by ${member.name} (${member.role})`);
  waitUntil(emit(env, visit.kiosk_id, "approval.requested", { checkin_id: visit.id, ticket: visit.ticket, approval_id: meta.last_row_id, title: clean, amount: cents / 100, by: member.name }));
  return { id: meta.last_row_id };
}

// The customer's answer. Only a pending approval can change, so a double tap can't flip or repeat it.
export async function decideApproval(env, waitUntil, visit, approvalId, decision) {
  if (!["approved", "declined"].includes(decision)) return { error: "Bad decision." };
  if (!canApprove(visit.status)) return { error: "This visit has moved on. Please talk to the front desk." };
  const a = await env.DB.prepare("SELECT id, title, amount_cents FROM approvals WHERE id = ? AND checkin_id = ?").bind(approvalId, visit.id).first();
  if (!a) return { error: "Request not found." };
  const { meta } = await env.DB.prepare("UPDATE approvals SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending'").bind(decision, Date.now(), a.id).run();
  if (!meta.changes) return { error: "You've already answered this." };

  const word = decision === "approved" ? "Approved" : "Declined";
  await addMessage(env, waitUntil, { checkinId: visit.id, kioskId: visit.kiosk_id, sender: "customer", kind: "decision", body: `${word}: ${approvalText(a)}` });
  await audit(env, visit.kiosk_id, `approval ${decision}`, `${approvalText(a)} · ticket ${visit.ticket} · by the customer`);
  waitUntil(emit(env, visit.kiosk_id, "approval.decided", { checkin_id: visit.id, ticket: visit.ticket, approval_id: a.id, title: a.title, amount: a.amount_cents / 100, decision }));
  return { ok: true, status: decision };
}

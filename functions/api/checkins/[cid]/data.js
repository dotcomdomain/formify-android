import { ownsKiosk, json } from "../../../../lib/auth.js";
import { addMessage } from "../../../../lib/thread.js";

// Business answers a customer's deletion request: delete now, or keep with a reason (e.g. legal retention).
export async function onRequestPost({ params, request, env, waitUntil }) {
  const row = await env.DB.prepare("SELECT id, kiosk_id, ticket FROM checkins WHERE id = ?").bind(params.cid).first();
  const member = row && (await ownsKiosk(env, request, row.kiosk_id));
  if (!member) return json({ error: "Not your location." }, 403);
  const { action, note } = await request.json().catch(() => ({}));
  const now = Date.now();
  if (action === "delete") {
    await env.DB.batch([
      env.DB.prepare("UPDATE checkins SET answers = '{}', summary = NULL, flags = NULL, delete_status = 'deleted', delete_at = ? WHERE id = ?").bind(now, row.id),
      env.DB.prepare("DELETE FROM messages WHERE checkin_id = ? AND sender = 'customer'").bind(row.id),
      env.DB.prepare("INSERT INTO audit (kiosk_id, action, detail, at) VALUES (?, 'customer data deleted', ?, ?)").bind(row.kiosk_id, `Ticket ${row.ticket} · by ${member.name} (${member.role})`, now)
    ]);
    await addMessage(env, waitUntil, { checkinId: row.id, kioskId: row.kiosk_id, sender: "system", kind: "status", body: "Your info for this visit has been deleted." });
    return json({ ok: true });
  }
  if (action === "keep") {
    const reason = String(note || "").trim().slice(0, 300);
    if (!reason) return json({ error: "Explain why it has to be kept (for example, a legal record-keeping rule)." }, 400);
    await env.DB.batch([
      env.DB.prepare("UPDATE checkins SET delete_status = 'kept', delete_note = ?, delete_at = ? WHERE id = ?").bind(reason, now, row.id),
      env.DB.prepare("INSERT INTO audit (kiosk_id, action, detail, at) VALUES (?, 'deletion declined', ?, ?)").bind(row.kiosk_id, `Ticket ${row.ticket}: ${reason} · by ${member.name} (${member.role})`, now)
    ]);
    await addMessage(env, waitUntil, { checkinId: row.id, kioskId: row.kiosk_id, sender: "system", kind: "status", body: `${member.name} needs to keep this info: ${reason}` });
    return json({ ok: true });
  }
  return json({ error: "Choose delete or keep." }, 400);
}

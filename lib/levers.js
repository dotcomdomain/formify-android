// The playbook switches that act on a visit: freed-spot offers and rebook prompts.
import { addMessage } from "./thread.js";
import { playbookOf } from "./playbooks.js";

const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;

// Someone cancelled or didn't show: tell the people still on their way that a spot opened up.
export async function offerFreedSpot(env, waitUntil, kioskId, config, freedId) {
  if (!playbookOf(config).levers.waitlist_offer) return 0;
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const { results } = await env.DB.prepare("SELECT id FROM checkins WHERE kiosk_id = ? AND status = 'pending' AND id != ? AND created_at >= ? ORDER BY created_at LIMIT 5")
    .bind(kioskId, freedId, since.getTime()).all();
  for (const r of results) await addMessage(env, waitUntil, { checkinId: r.id, kioskId, sender: "system", kind: "offer", body: `A spot just opened up at ${config.name}. Come in now and tap "I'm here" to be seen sooner.` });
  return results.length;
}

// After a finished visit, invite the customer back on the playbook's schedule.
export async function afterDone(env, waitUntil, row, config) {
  const weeks = playbookOf(config).levers.rebook_weeks;
  if (!weeks) return;
  await addMessage(env, waitUntil, { checkinId: row.id, kioskId: row.kiosk_id, sender: "system", kind: "rebook", body: `Thanks for coming in! Most people come back in about ${weeks} week${weeks > 1 ? "s" : ""}. Tap Rebook when you're ready.` });
}

// What a no-show means for a deposit, said plainly to the customer.
export function noShowNote(row) {
  return row.deposit_paid_at ? ` Your ${money(row.deposit_cents)} deposit is kept, as the booking policy says.` : "";
}

// The one number each playbook is judged by, over the last 30 days. Shown on Live and Insights.
import { playbookOf } from "./playbooks.js";

const MONTH = 30 * 86400000;
const money = (c) => `$${((c || 0) / 100).toFixed(0)}`;

export async function goalFor(env, kioskId, config) {
  const pb = playbookOf(config);
  const since = Date.now() - MONTH;
  const r = await env.DB.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN channel NOT LIKE 'kiosk%' THEN 1 ELSE 0 END) AS remote,
      SUM(CASE WHEN channel NOT LIKE 'kiosk%' AND status IN ('serving','ready','payment','done') THEN 1 ELSE 0 END) AS remote_served,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN status = 'no-show' THEN 1 ELSE 0 END) AS noshow,
      SUM(CASE WHEN deposit_paid_at IS NOT NULL THEN deposit_cents ELSE 0 END) AS deposits,
      AVG(CASE WHEN served_at IS NOT NULL THEN served_at - COALESCE(arrived_at, created_at) END) AS wait_ms,
      AVG(CASE WHEN ready_at IS NOT NULL THEN ready_at - created_at END) AS ready_ms
    FROM checkins WHERE kiosk_id = ? AND created_at > ?`).bind(kioskId, since).first();
  const { rebooks } = await env.DB.prepare("SELECT COUNT(*) AS rebooks FROM events WHERE kiosk_id = ? AND type = 'rebook' AND at > ?").bind(kioskId, since).first();
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "–");
  const mins = (ms) => (ms ? `${Math.round(ms / 60000)} min` : "–");

  const out = { playbook: pb.id, name: pb.name, goal: pb.goal, metric: pb.metric };
  if (pb.id === "fill_chair") Object.assign(out, { value: String(r.remote_served || 0), detail: `customers who joined from their phone and were served instead of seeing a line. Average wait ${mins(r.wait_ms)}.` });
  if (pb.id === "no_empty_slots") Object.assign(out, { value: pct(r.noshow || 0, (r.done || 0) + (r.noshow || 0)), detail: `of finished bookings were no-shows. ${money(r.deposits)} in deposits held spots.` });
  if (pb.id === "faster_mornings") Object.assign(out, { value: pct(r.remote || 0, r.total), detail: `of check-ins were done before arriving (express line). Average wait ${mins(r.wait_ms)}.` });
  if (pb.id === "ready_on_time") Object.assign(out, { value: mins(r.ready_ms), detail: "from drop-off to ready for pickup, on average." });
  if (pb.id === "regulars") Object.assign(out, { value: pct(rebooks || 0, r.done), detail: `of finished visits tapped Rebook (${rebooks || 0} rebooks).` });
  if (pb.id === "signed_ahead") Object.assign(out, { value: pct(r.remote || 0, r.total), detail: `of forms were filled in before arrival (${r.remote || 0} of ${r.total || 0}).` });
  return out;
}

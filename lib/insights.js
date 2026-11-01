// Aggregate only retained visits for this location. No form answers or customer
// account identifiers are selected. Private feedback and audit details remain
// owner/manager-only. Timeseries buckets are explicitly UTC.
import { DAY, insightWindow, shapeInsights } from "../public/js/insight-data.js";
export { DAY, insightWindow, shapeInsights };
export const INSIGHT_SQL = {
  summary: `SELECT COUNT(*) AS visits,
    SUM(status = 'done') AS completed,
    SUM(status = 'no-show') AS no_shows,
    SUM(status = 'cancelled') AS cancelled,
    SUM(status IN ('pending','waiting','serving','ready','payment')) AS active,
    SUM(NULLIF(user_id, '') IS NULL) AS anonymous_visits,
    SUM(CASE WHEN paid_at IS NOT NULL THEN COALESCE(amount_cents, 0) ELSE 0 END) AS paid_cents,
    SUM(paid_at IS NOT NULL) AS paid_visits,
    SUM(CASE WHEN deposit_paid_at IS NOT NULL THEN COALESCE(deposit_cents, 0) ELSE 0 END) AS deposit_cents,
    SUM(CASE WHEN status = 'payment' AND paid_at IS NULL THEN COALESCE(amount_cents, 0) ELSE 0 END) AS outstanding_cents,
    AVG(CASE WHEN arrived_at IS NOT NULL AND served_at >= arrived_at THEN served_at - arrived_at END) AS wait_ms,
    SUM(arrived_at IS NOT NULL AND served_at >= arrived_at) AS wait_samples
    FROM checkins WHERE kiosk_id = ?1 AND created_at >= ?2 AND created_at < ?3`,
  customers: `SELECT COUNT(*) AS identified_customers,
    COALESCE(SUM(total_visits > 1), 0) AS repeat_customers,
    COALESCE(SUM(total_visits = 1), 0) AS single_visit_customers
    FROM (SELECT user_id, COUNT(*) AS total_visits,
      SUM(created_at >= ?2) AS period_visits
      FROM checkins WHERE kiosk_id = ?1 AND created_at >= ?4 AND created_at < ?3
      AND NULLIF(user_id, '') IS NOT NULL GROUP BY user_id HAVING period_visits > 0)`,
  daily: `SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS visits,
    SUM(status = 'done') AS completed FROM checkins
    WHERE kiosk_id = ?1 AND created_at >= ?2 AND created_at < ?3 GROUP BY day ORDER BY day`,
  hours: `SELECT CAST(strftime('%H', created_at / 1000, 'unixepoch') AS INTEGER) AS hour,
    COUNT(*) AS visits FROM checkins WHERE kiosk_id = ?1 AND created_at >= ?2 AND created_at < ?3
    GROUP BY hour ORDER BY hour`,
  channels: `SELECT CASE WHEN channel LIKE 'phone%' THEN 'phone'
      WHEN channel LIKE 'kiosk%' THEN 'kiosk' WHEN channel LIKE 'ai agent%' THEN 'ai agent'
      ELSE 'other' END AS channel, COUNT(*) AS visits
    FROM checkins WHERE kiosk_id = ?1 AND created_at >= ?2 AND created_at < ?3 GROUP BY 1 ORDER BY visits DESC, channel`,
  funnel: `SELECT type, COUNT(*) AS count FROM events WHERE kiosk_id = ?1
    AND at >= ?2 AND at < ?3 AND type IN ('view','start','checkin','rebook') GROUP BY type`,
  ratings: `SELECT COUNT(*) AS count, AVG(r.score) AS average,
    SUM(r.score <= 2) AS low_scores FROM ratings r JOIN checkins c ON c.id = r.checkin_id AND c.kiosk_id = r.kiosk_id
    WHERE c.kiosk_id = ?1 AND c.created_at >= ?2 AND c.created_at < ?3 AND r.at < ?3`,
  feedback: `SELECT c.ticket, r.score, r.comment, r.at FROM ratings r
    JOIN checkins c ON c.id = r.checkin_id AND c.kiosk_id = r.kiosk_id
    WHERE c.kiosk_id = ?1 AND c.created_at >= ?2 AND c.created_at < ?3 AND r.at < ?3
    ORDER BY r.at DESC, r.id DESC LIMIT 8`,
  attention: `SELECT c.id, c.ticket, c.status, c.created_at, c.amount_cents, c.paid_at, c.delete_status, r.score,
      (SELECT COUNT(*) FROM messages m WHERE m.checkin_id = c.id AND m.kiosk_id = c.kiosk_id
       AND m.sender = 'customer' AND m.id > COALESCE(c.seen_business, 0) AND m.at < ?3) AS unread
    FROM checkins c LEFT JOIN ratings r ON r.checkin_id = c.id AND r.kiosk_id = c.kiosk_id
    WHERE c.kiosk_id = ?1 AND c.created_at >= ?2 AND c.created_at < ?3
      AND (c.delete_status = 'requested' OR r.score <= 2 OR c.status = 'ready'
        OR (c.status = 'payment' AND c.paid_at IS NULL)
        OR EXISTS (SELECT 1 FROM messages m WHERE m.checkin_id = c.id AND m.kiosk_id = c.kiosk_id
         AND m.sender = 'customer' AND m.id > COALESCE(c.seen_business, 0) AND m.at < ?3))
    ORDER BY (c.delete_status = 'requested') DESC, unread DESC, c.created_at ASC LIMIT 20`,
  attention_counts: `SELECT
    SUM(delete_status = 'requested') AS deletion_requests,
    SUM(status = 'payment' AND paid_at IS NULL) AS unpaid_visits,
    SUM(status = 'ready') AS ready_visits,
    SUM(EXISTS (SELECT 1 FROM messages m WHERE m.checkin_id = c.id AND m.kiosk_id = c.kiosk_id
      AND m.sender = 'customer' AND m.id > COALESCE(c.seen_business, 0) AND m.at < ?3)) AS unanswered_visits
    FROM checkins c WHERE c.kiosk_id = ?1 AND c.created_at >= ?2 AND c.created_at < ?3`,
  audit: `SELECT action, detail, at FROM audit WHERE kiosk_id = ?1 AND at >= ?2 AND at < ?3 ORDER BY at DESC, id DESC LIMIT 15`
};

export async function loadInsights(env, kiosk, days, now = Date.now()) {
  const config = JSON.parse(kiosk.config);
  const window = insightWindow(days, config.retention_days, kiosk.created_at, now);
  const names = Object.keys(INSIGHT_SQL);
  const statements = names.map((name) => {
    const values = [kiosk.id, window.from, window.to];
    if (name === "customers") values.push(window.retained_from);
    return env.DB.prepare(INSIGHT_SQL[name]).bind(...values);
  });
  if (window.comparison_available) { names.push("previous"); statements.push(env.DB.prepare(INSIGHT_SQL.summary).bind(kiosk.id, window.previous_from, window.previous_to)); }
  const result = await env.DB.batch(statements);
  const rows = Object.fromEntries(names.map((name, i) => [name, result[i].results || []]));
  return { ...shapeInsights(rows, window, now), location: { id: kiosk.id, name: config.name, form_label: config.form_label || "" } };
}

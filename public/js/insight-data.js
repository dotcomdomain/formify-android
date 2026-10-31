// Pure analytics calculations shared by live and browser-only demo data.
export const DAY = 86400000;

export function insightWindow(days, retentionDays, createdAt, now) {
  if (![7, 30, 90].includes(days)) throw new Error("Choose 7, 30 or 90 days.");
  const retention = Math.max(1, Math.min(365, Number(retentionDays) || 30));
  const retainedFrom = Math.max(now - retention * DAY, Number(createdAt) || 0);
  const requestedFrom = now - days * DAY;
  const from = Math.min(now, Math.max(requestedFrom, retainedFrom));
  return { requested_days: days, retention_days: retention, from, to: now,
    retained_from: retainedFrom, clipped: from > requestedFrom,
    previous_from: now - 2 * days * DAY, previous_to: requestedFrom,
    comparison_available: retainedFrom <= now - 2 * days * DAY, timezone: "UTC" };
}

const numeric = (row, nullable = []) => Object.fromEntries(Object.entries(row || {}).map(([k, v]) => [k, v === null && nullable.includes(k) ? null : Number(v) || 0]));
export function shapeInsights(rows, window, now) {
  const summary = numeric(rows.summary?.[0], ["wait_ms"]);
  const customers = numeric(rows.customers?.[0]);
  const ratings = numeric(rows.ratings?.[0], ["average"]);
  const attentionCounts = numeric(rows.attention_counts?.[0]);
  const dailyMap = new Map((rows.daily || []).map((d) => [d.day, d]));
  const daily = [];
  for (let at = Math.floor(window.from / DAY) * DAY; at < window.to; at += DAY) {
    const day = new Date(at).toISOString().slice(0, 10);
    daily.push(dailyMap.get(day) || { day, visits: 0, completed: 0 });
  }
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, visits: rows.hours?.find((h) => h.hour === hour)?.visits || 0 }));
  const previous = window.comparison_available ? numeric(rows.previous?.[0], ["wait_ms"]) : null;
  const reasons = [];
  if (attentionCounts.deletion_requests) reasons.push({ title: "Review data requests", detail: `${attentionCounts.deletion_requests} visit(s) have a pending deletion request.`, action: "Open Live" });
  if (attentionCounts.unanswered_visits) reasons.push({ title: "Reply to customers", detail: `${attentionCounts.unanswered_visits} visit(s) have unread customer messages.`, action: "Open Live" });
  if (attentionCounts.unpaid_visits) reasons.push({ title: "Follow up on open payments", detail: `${attentionCounts.unpaid_visits} visit(s) are awaiting payment. Check their threads before following up.`, action: "Open Live" });
  if (ratings.low_scores) reasons.push({ title: "Review difficult visits", detail: `${ratings.low_scores} visitor(s) rated their experience 1 or 2 out of 5. Read their private feedback below.`, action: "See feedback" });
  if (attentionCounts.ready_visits) reasons.push({ title: "Complete pickups", detail: `${attentionCounts.ready_visits} visit(s) are ready for pickup.`, action: "Open Live" });
  const peak = hours.reduce((best, h) => h.visits > best.visits ? h : best, { hour: 0, visits: 0 });
  if (summary.wait_samples >= 3 && summary.wait_ms > 15 * 60000) reasons.push({ title: "Review front desk coverage", detail: `Average recorded wait is ${Math.round(summary.wait_ms / 60000)} minutes across ${summary.wait_samples} visits. The busiest arrival hour was ${String(peak.hour).padStart(2, "0")}:00 UTC (${peak.visits} visits).`, action: "" });
  return { generated_at: now, window, summary, previous, customers, ratings,
    attention_counts: attentionCounts, attention: rows.attention || [],
    daily, hours, channels: rows.channels || [],
    funnel: Object.fromEntries((rows.funnel || []).map((r) => [r.type, r.count])),
    feedback: rows.feedback || [], audit: rows.audit || [], recommendations: reasons };
}


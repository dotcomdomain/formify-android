import { ownsKiosk } from "../../../../lib/auth.js";
import { loadConfig } from "../../../../lib/queue.js";

// CSV export for spreadsheets, accountants and import into other systems. Sensitive fields are included
// only for owners and managers, and every export is logged.
const cell = (v) => {
  const s = v === true ? "Yes" : v === false ? "No" : String(v ?? "");
  // Neutralise spreadsheet formulas (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function onRequestGet({ params, request, env }) {
  const member = await ownsKiosk(env, request, params.id, "insights");
  if (!member) return new Response("Only the owner or a manager can export.", { status: 403 });
  const config = await loadConfig(env, params.id);
  if (!config) return new Response("Location not found.", { status: 404 });
  const requested = new URL(request.url).searchParams.get("days");
  const days = requested === null ? null : Number(requested);
  if (days !== null && ![7,30,90].includes(days)) return new Response("Choose 7, 30 or 90 days.", { status: 400 });
  const now = Date.now();
  const from = now - Math.min(days ?? 365, Math.max(1, Math.min(365, Number(config.retention_days) || 30))) * 86400000;
  const fields = config.steps.flatMap((s) => s.fields);
  const { results } = await env.DB.prepare("SELECT ticket, status, channel, created_at, arrived_at, served_at, amount_cents, paid_at, pay_method, summary, answers FROM checkins WHERE kiosk_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at").bind(params.id, from, now).all();
  const head = ["Ticket", "Status", "Channel", "Checked in", "Arrived", "Served", "Amount", "Paid", "Paid by", "Handoff note", ...fields.map((f) => f.label)];
  const iso = (t) => (t ? new Date(t).toISOString() : "");
  const lines = [head.map(cell).join(",")].concat(results.map((r) => {
    const a = JSON.parse(r.answers || "{}");
    return [r.ticket, r.status, r.channel, iso(r.created_at), iso(r.arrived_at), iso(r.served_at), r.amount_cents ? (r.amount_cents / 100).toFixed(2) : "", iso(r.paid_at), r.pay_method || "", r.summary || "",
      ...fields.map((f) => a[f.id])].map(cell).join(",");
  }));
  await env.DB.prepare("INSERT INTO audit (kiosk_id, action, detail, at) VALUES (?, 'exported CSV', ?, ?)").bind(params.id, `${results.length} rows · by ${member.name} (${member.role})`, Date.now()).run();
  const name = `${config.name}-${config.form_label || "checkins"}`.replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 60);
  return new Response(lines.join("\r\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"`, "cache-control": "no-store" } });
}

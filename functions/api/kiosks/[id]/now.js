import { loadConfig } from "../../../../lib/queue.js";
import { playbookOf } from "../../../../lib/playbooks.js";

// Public "Now serving" board for a waiting-room screen. Ticket numbers only: no names or answers.
export async function onRequestGet({ params, env }) {
  const config = await loadConfig(env, params.id);
  if (!config) return Response.json({ error: "Not found" }, { status: 404 });
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const rows = (await env.DB.prepare("SELECT ticket, status, channel FROM checkins WHERE kiosk_id = ? AND created_at >= ? AND status IN ('serving','ready','waiting') ORDER BY COALESCE(arrived_at, created_at)")
    .bind(params.id, since.getTime() - 86400000).all()).results;
  return Response.json({
    name: config.name, form: config.form_label || "", brand_color: config.brand_color, enabled: playbookOf(config).levers.now_serving,
    serving: rows.filter((r) => r.status === "serving").map((r) => r.ticket),
    ready: rows.filter((r) => r.status === "ready").map((r) => r.ticket),
    next: rows.filter((r) => r.status === "waiting").slice(0, 6).map((r) => ({ ticket: r.ticket, express: !String(r.channel || "").startsWith("kiosk") })),
    wait_minutes: rows.filter((r) => r.status === "waiting").length * config.avg_service_minutes
  }, { headers: { "cache-control": "no-store" } });
}

// Queue helpers shared by the check-in, arrival and visit endpoints.

export async function loadConfig(env, id) {
  const row = await env.DB.prepare("SELECT config FROM kiosks WHERE id = ?").bind(id).first();
  return row ? JSON.parse(row.config) : null;
}

// How many people are in front of this ticket, and the rough wait.
export async function position(env, kioskId, row, config) {
  if (row.status !== "waiting") return { ahead: 0, wait_minutes: 0 };
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM checkins WHERE kiosk_id = ? AND status IN ('waiting','serving') AND COALESCE(arrived_at, created_at) < ?").bind(kioskId, row.arrived_at).first();
  return { ahead: n, wait_minutes: n * config.avg_service_minutes };
}

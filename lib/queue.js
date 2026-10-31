// Queue helpers shared by the check-in, arrival and visit endpoints.

export const GRACE_MINUTES = 10;
const DAY = 86400000;

export async function loadConfig(env, id) {
  const row = await env.DB.prepare("SELECT config FROM kiosks WHERE id = ?").bind(id).first();
  return row ? JSON.parse(row.config) : null;
}

// Walk-in lines hold a remote customer's place. Appointment and drop-off visits line up on arrival.
export const holdsPlace = (config) => (config.flow || "walk_in") === "walk_in";

// A place is lost once someone behind it was called more than the grace period ago.
const graceCutoff = () => Date.now() - GRACE_MINUTES * 60000;

async function missedTurn(env, kioskId, lineAt) {
  return !!(await env.DB.prepare("SELECT 1 FROM checkins WHERE kiosk_id = ? AND line_at > ? AND served_at IS NOT NULL AND served_at < ? LIMIT 1").bind(kioskId, lineAt, graceCutoff()).first());
}

// Remote customers still on their way who hold a place ahead of lineAt.
async function heldAhead(env, kioskId, lineAt) {
  const { n } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM checkins c WHERE c.kiosk_id = ? AND c.status = 'pending' AND c.line_at < ? AND c.line_at > ?
    AND NOT EXISTS (SELECT 1 FROM checkins s WHERE s.kiosk_id = c.kiosk_id AND s.line_at > c.line_at AND s.served_at IS NOT NULL AND s.served_at < ?)`)
    .bind(kioskId, lineAt, Date.now() - DAY, graceCutoff()).first();
  return n;
}

// How many people are in front of this ticket, and the rough wait.
export async function position(env, kioskId, row, config) {
  const holds = holdsPlace(config);
  const out = { holds_place: holds, grace_minutes: GRACE_MINUTES };
  if (row.status !== "waiting" && !(row.status === "pending" && holds)) return { ...out, ahead: 0, wait_minutes: 0 };
  const missed = row.status === "pending" && (await missedTurn(env, kioskId, row.line_at));
  const lineAt = missed ? Date.now() : row.line_at;
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM checkins WHERE kiosk_id = ? AND status IN ('waiting','serving') AND line_at < ?").bind(kioskId, lineAt).first();
  const ahead = n + (holds ? await heldAhead(env, kioskId, lineAt) : 0);
  return { ...out, missed, ahead, wait_minutes: ahead * config.avg_service_minutes };
}

// Everyone the line still has to serve, for the public wait estimate.
export async function lineLength(env, kioskId, config) {
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM checkins WHERE kiosk_id = ? AND status = 'waiting'").bind(kioskId).first();
  return n + (holdsPlace(config) ? await heldAhead(env, kioskId, Date.now()) : 0);
}

// A remote customer arrived. Returns whether they kept their place, and where they now stand.
export async function markArrived(env, kioskId, row, config) {
  const now = Date.now();
  const kept = holdsPlace(config) && !(await missedTurn(env, kioskId, row.line_at));
  const lineAt = kept ? row.line_at : now;
  await env.DB.prepare("UPDATE checkins SET status = 'waiting', arrived_at = ?, line_at = ? WHERE id = ?").bind(now, lineAt, row.id).run();
  return { kept, line_at: lineAt };
}

// What the customer is told on arrival.
export function arrivalMessage(where, config, kept) {
  if (holdsPlace(config) && !kept) return `${where} Your turn passed while you were away, so you've joined the end of the line. We'll message you when it's your turn.`;
  return `${where} ${holdsPlace(config) ? "Your place in line is saved." : "You're in line."} We'll message you when it's your turn.`;
}

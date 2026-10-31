// Customer inbox: summaries for the visits this person holds tokens for (saved on their device or in their account).
export async function onRequestPost({ request, env }) {
  const { tokens } = await request.json().catch(() => ({}));
  const list = (Array.isArray(tokens) ? tokens : []).filter((t) => /^[0-9a-f]{32}$/.test(t)).slice(0, 40);
  const visits = [];
  for (const token of list) {
    const r = await env.DB.prepare(`
      SELECT c.id, c.ticket, c.status, c.created_at, c.seen_customer, c.amount_cents, c.paid_at, k.config, b.slug,
        (SELECT body FROM messages m WHERE m.checkin_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
        (SELECT at FROM messages m WHERE m.checkin_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at,
        (SELECT sender FROM messages m WHERE m.checkin_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_sender,
        (SELECT COUNT(*) FROM messages m WHERE m.checkin_id = c.id AND m.sender != 'customer' AND m.id > COALESCE(c.seen_customer, 0)) AS unread
      FROM checkins c JOIN kiosks k ON k.id = c.kiosk_id LEFT JOIN businesses b ON b.id = k.owner_id WHERE c.token = ?`).bind(token).first();
    if (!r) continue;
    const c = JSON.parse(r.config);
    visits.push({ token, ticket: r.ticket, status: r.status, at: r.created_at, name: c.name, form: c.form_label || "", brand_color: c.brand_color, page_slug: r.slug || null,
      last: r.last_body ? { body: r.last_body, at: r.last_at, sender: r.last_sender } : null, unread: r.unread, amount_cents: r.amount_cents, paid: !!r.paid_at });
  }
  visits.sort((a, b) => (b.last?.at || b.at) - (a.last?.at || a.at));
  return Response.json({ visits });
}

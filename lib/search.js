import { publicBusiness } from "./ease.js";

const MONTH = 30 * 86400000;

// Search every listed business. Results rank by how much people actually use them this month
// (page views + check-ins), so the easiest, most-used forms rise to the top.
export async function searchBusinesses(env, q = "", type = "") {
  const query = String(q).trim().toLowerCase().slice(0, 60);
  const t = String(type).trim().toLowerCase().slice(0, 40);
  const since = Date.now() - MONTH;
  const { results } = await env.DB.prepare(`
    SELECT k.id, k.config,
      (SELECT AVG(score) FROM ratings r WHERE r.kiosk_id = k.id) AS avg,
      (SELECT COUNT(*) FROM ratings r WHERE r.kiosk_id = k.id) AS n,
      (SELECT COUNT(*) FROM checkins c WHERE c.kiosk_id = k.id AND c.status = 'waiting') AS waiting,
      (SELECT COUNT(*) FROM events e WHERE e.kiosk_id = k.id AND e.type = 'view' AND e.at > ?3) AS views,
      (SELECT COUNT(*) FROM events e WHERE e.kiosk_id = k.id AND e.type = 'checkin' AND e.at > ?3) AS checkins
    FROM kiosks k
    WHERE COALESCE(json_extract(k.config, '$.listed'), 1) = 1
      AND (?1 = '' OR lower(json_extract(k.config, '$.name') || ' ' || json_extract(k.config, '$.business_type') || ' ' ||
           COALESCE(json_extract(k.config, '$.city'), '') || ' ' || COALESCE(json_extract(k.config, '$.welcome_title'), '') || ' ' ||
           COALESCE(json_extract(k.config, '$.welcome_subtitle'), '') || ' ' || COALESCE(json_extract(k.config, '$.steps'), '')) LIKE '%' || ?1 || '%')
      AND (?2 = '' OR lower(json_extract(k.config, '$.business_type')) LIKE '%' || ?2 || '%')
    ORDER BY (views + 3 * checkins) DESC, n DESC, k.updated_at DESC
    LIMIT 50`).bind(query, t, since).all();

  return results.map((r) => ({
    ...publicBusiness(r.id, JSON.parse(r.config), { avg: r.n ? Math.round(r.avg * 10) / 10 : null, count: r.n }),
    waiting: r.waiting, views_month: r.views, checkins_month: r.checkins
  }));
}

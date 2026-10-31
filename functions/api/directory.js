import { publicBusiness } from "../../lib/ease.js";

// Form finder: search every listed business on the platform.
export async function onRequestGet({ request, env }) {
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") || "").trim().toLowerCase().slice(0, 60);
  const type = (params.get("type") || "").trim().toLowerCase().slice(0, 40);

  const { results } = await env.DB.prepare(`
    SELECT k.id, k.config, AVG(r.score) AS avg, COUNT(r.id) AS n,
      (SELECT COUNT(*) FROM checkins c WHERE c.kiosk_id = k.id AND c.status = 'waiting') AS waiting
    FROM kiosks k LEFT JOIN ratings r ON r.kiosk_id = k.id
    WHERE COALESCE(json_extract(k.config, '$.listed'), 1) = 1
      AND (?1 = '' OR lower(json_extract(k.config, '$.name')) LIKE '%' || ?1 || '%'
           OR lower(json_extract(k.config, '$.business_type')) LIKE '%' || ?1 || '%'
           OR lower(COALESCE(json_extract(k.config, '$.city'), '')) LIKE '%' || ?1 || '%')
      AND (?2 = '' OR lower(json_extract(k.config, '$.business_type')) LIKE '%' || ?2 || '%')
    GROUP BY k.id
    ORDER BY n DESC, k.updated_at DESC
    LIMIT 50`).bind(q, type).all();

  const businesses = results.map((r) => {
    const b = publicBusiness(r.id, JSON.parse(r.config), { avg: r.n ? Math.round(r.avg * 10) / 10 : null, count: r.n });
    b.waiting = r.waiting;
    return b;
  });
  return Response.json({ businesses });
}

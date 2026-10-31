// Ease Score: how easy visitors say this business was to deal with (1-5).

export async function easeFor(env, kioskId) {
  const r = await env.DB.prepare("SELECT AVG(score) AS avg, COUNT(*) AS n FROM ratings WHERE kiosk_id = ?").bind(kioskId).first();
  return { avg: r.n ? Math.round(r.avg * 10) / 10 : null, count: r.n };
}

// Public view of a business: what the finder and business page may show. Never visitor data.
export function publicBusiness(id, config, ease) {
  return {
    id, name: config.name, form_label: config.form_label || "", business_type: config.business_type, brand_color: config.brand_color, city: config.city || "",
    welcome_subtitle: config.welcome_subtitle, website: config.website || "", google_reviews: config.google_reviews || "",
    instagram: config.instagram || "", ease, wait_minutes_per_visitor: config.avg_service_minutes
  };
}

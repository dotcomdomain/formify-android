// Public business page: profile, social links, and every listed form, in the owner's order.
import { easeFor } from "./ease.js";

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function url(v, host) {
  const s = str(v, 300);
  if (!s) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    if (host && !host.test(u.hostname)) return "";
    return u.href;
  } catch { return ""; }
}
// "@handle", "handle" or a full link, for networks that use handles.
function handle(v, base, hostRe) {
  const s = str(v, 200);
  if (!s) return "";
  if (/^https?:\/\//i.test(s) || s.includes(".")) return url(s, hostRe);
  const m = s.match(/^@?([A-Za-z0-9._]{1,30})$/);
  return m ? `${base}${m[1]}` : "";
}

export function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}
export const validSlug = (s) => /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(s);

export function cleanProfile(p = {}) {
  return {
    tagline: str(p.tagline, 120),
    about: str(p.about, 600),
    address: str(p.address, 160),
    city: str(p.city, 60),
    phone: str(p.phone, 30).replace(/[^0-9+()\-\s.]/g, ""),
    hours: str(p.hours, 300),
    brand_color: /^#[0-9a-f]{6}$/i.test(p.brand_color) ? p.brand_color : "",
    links: {
      instagram: handle(p.links?.instagram, "https://www.instagram.com/", /(^|\.)instagram\.com$/i),
      tiktok: handle(p.links?.tiktok, "https://www.tiktok.com/@", /(^|\.)tiktok\.com$/i),
      facebook: url(p.links?.facebook, /(^|\.)(facebook|fb)\.com$/i),
      google_reviews: url(p.links?.google_reviews, /(^|\.)(google\.[a-z.]+|g\.page|goo\.gl|maps\.app\.goo\.gl)$/i),
      website: url(p.links?.website)
    },
    form_order: Array.isArray(p.form_order) ? p.form_order.map(String).filter((x) => /^[0-9a-f]{8}$/.test(x)).slice(0, 30) : []
  };
}

// Everything a visitor sees on /p/<slug>. Never includes visitor data.
export async function loadPage(env, slug) {
  const biz = await env.DB.prepare("SELECT id, name, slug, profile FROM businesses WHERE slug = ?").bind(slug).first();
  if (!biz) return null;
  const profile = cleanProfile(biz.profile ? JSON.parse(biz.profile) : {});
  const { results } = await env.DB.prepare("SELECT id, config FROM kiosks WHERE owner_id = ? ORDER BY created_at").bind(biz.id).all();
  let forms = await Promise.all(results.map(async (k) => {
    const c = JSON.parse(k.config);
    if (c.listed === false) return null;
    const { waiting } = await env.DB.prepare("SELECT COUNT(*) AS waiting FROM checkins WHERE kiosk_id = ? AND status = 'waiting'").bind(k.id).first();
    return { id: k.id, label: c.form_label || c.welcome_title || c.name, subtitle: c.welcome_subtitle, business_type: c.business_type,
      brand_color: c.brand_color, waiting, wait_minutes: waiting * c.avg_service_minutes, ease: await easeFor(env, k.id),
      links: { instagram: c.instagram, google_reviews: c.google_reviews, website: c.website }, city: c.city };
  }));
  forms = forms.filter(Boolean);
  const order = profile.form_order;
  forms.sort((a, b) => (order.indexOf(a.id) + 1 || 999) - (order.indexOf(b.id) + 1 || 999));

  // Older forms carried their own links; fall back to them so a page is never empty.
  const first = forms[0] || {};
  for (const k of ["instagram", "google_reviews", "website"]) if (!profile.links[k] && first.links?.[k]) profile.links[k] = first.links[k];
  if (!profile.city && first.city) profile.city = first.city;
  if (!profile.brand_color) profile.brand_color = first.brand_color || "#1f4d3a";

  const rated = forms.filter((f) => f.ease.count);
  const count = rated.reduce((n, f) => n + f.ease.count, 0);
  const avg = count ? Math.round((rated.reduce((s, f) => s + f.ease.avg * f.ease.count, 0) / count) * 10) / 10 : null;
  return { slug: biz.slug, name: biz.name, business_type: first.business_type || "", profile, ease: { avg, count }, forms };
}

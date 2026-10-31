import { loadPage } from "../../../lib/page.js";

// Public business page data for /p/<slug>.
export async function onRequestGet({ params, env }) {
  const page = await loadPage(env, String(params.slug).toLowerCase());
  if (!page) return Response.json({ error: "Page not found" }, { status: 404 });
  return Response.json(page, { headers: { "cache-control": "no-store" } });
}

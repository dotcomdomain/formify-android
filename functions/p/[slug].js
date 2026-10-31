// Short shareable link for bios, email signatures and QR codes: serves the standalone link page at /p/<slug>.
export async function onRequestGet({ request, env }) {
  const page = await env.ASSETS.fetch(new URL("/page", request.url));
  return new Response(page.body, { status: page.status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

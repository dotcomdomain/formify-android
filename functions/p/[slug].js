// Short shareable link for Instagram bios and QR codes: /p/cornerchair -> the business page in the app.
export function onRequestGet({ params, request }) {
  const slug = String(params.slug).toLowerCase().replace(/[^a-z0-9-]/g, "");
  return Response.redirect(new URL(`/#biz/${slug}`, request.url).href, 302);
}

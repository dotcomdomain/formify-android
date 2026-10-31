// Personal invite link: marks the invite opened, then goes to the form.
export async function onRequestGet({ params, request, env }) {
  const token = /^[0-9a-f]{32}$/.test(params.token) ? params.token : "";
  const invite = token && (await env.DB.prepare("SELECT kiosk_id FROM invites WHERE token = ?").bind(token).first());
  if (!invite) return Response.redirect(new URL("/", request.url).href, 302);
  await env.DB.prepare("UPDATE invites SET status = 'opened', opened_at = COALESCE(opened_at, ?) WHERE token = ?").bind(Date.now(), token).run();
  return Response.redirect(new URL(`/go.html?id=${encodeURIComponent(invite.kiosk_id)}`, request.url).href, 302);
}

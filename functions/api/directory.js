import { searchBusinesses } from "../../lib/search.js";

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  return Response.json({ businesses: await searchBusinesses(env, p.get("q") || "", p.get("type") || "") });
}

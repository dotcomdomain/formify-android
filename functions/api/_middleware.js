import { overLimit } from "../../lib/limit.js";

const TEN_MINUTES = 600;

// POST routes that anyone can reach without signing in.
const RULES = [
  { path: /^\/api\/kiosks\/[^/]+\/checkins$/, max: 30 },
  { path: /^\/api\/kiosks\/[^/]+\/arrive$/, max: 20 },
  { path: /^\/api\/(agent|concierge|generate|scan|stt|tts|voice)$/, max: 120, scope: "ai" }
];

export async function onRequest({ request, env, next }) {
  if (request.method !== "POST") return next();
  const { pathname } = new URL(request.url);
  const rule = RULES.find((r) => r.path.test(pathname));
  if (rule && (await overLimit(env, request, rule.scope || pathname, rule.max, TEN_MINUTES))) {
    return Response.json({ error: "Too many tries. Please wait a few minutes and try again." }, { status: 429, headers: { "retry-after": String(TEN_MINUTES) } });
  }
  return next();
}

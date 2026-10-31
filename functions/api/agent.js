import { agentTurn } from "../../lib/agent.js";
import { sanitize } from "../../lib/config.js";
import { loadConfig } from "../../lib/queue.js";

// One turn of the check-in assistant. Live kiosks send their id; the builder preview sends its draft config.
export async function onRequestPost({ request, env }) {
  const { id, config: draft, messages, answers, language } = await request.json().catch(() => ({}));
  if (!Array.isArray(messages) || !messages.length) return Response.json({ error: "No message." }, { status: 400 });

  let config, waiting = null;
  if (id) {
    config = await loadConfig(env, id);
    if (!config) return Response.json({ error: "Kiosk not found" }, { status: 404 });
    ({ waiting } = await env.DB.prepare("SELECT COUNT(*) AS waiting FROM checkins WHERE kiosk_id = ? AND status = 'waiting'").bind(id).first());
  } else {
    config = sanitize(draft);
  }

  try {
    const turn = await agentTurn(env, config, { waiting }, messages, answers && typeof answers === "object" ? answers : {}, /^[a-z]{2}$/.test(language) ? language : "en");
    return Response.json(turn);
  } catch (e) {
    return Response.json({ reply: "Sorry, I had trouble with that. You can keep going, or fill the form directly.", answers: {}, missing: [], ready: false, error: String(e.message || e).slice(0, 200) });
  }
}

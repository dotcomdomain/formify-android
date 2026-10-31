import { TTS_MODEL } from "../../lib/ai.js";

// Kiosk reads its follow-up question out loud.
export async function onRequestPost({ request, env }) {
  const { text } = await request.json().catch(() => ({}));
  const say = String(text || "").trim().slice(0, 300);
  if (!say) return new Response("No text", { status: 400 });
  try {
    const audio = await env.AI.run(TTS_MODEL, { text: say, speaker: "luna", encoding: "mp3" });
    return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch (e) {
    return new Response("TTS failed", { status: 502 });
  }
}

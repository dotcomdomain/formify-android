import { STT_MODEL, langName } from "../../lib/ai.js";

// Speech to text for the assistant chat. Audio is transcribed and dropped.
export async function onRequestPost({ request, env }) {
  const { audio } = await request.json().catch(() => ({}));
  if (typeof audio !== "string" || audio.length < 100) return Response.json({ error: "No audio received." }, { status: 400 });
  if (audio.length > 4_000_000) return Response.json({ error: "Recording too long. Keep it under 30 seconds." }, { status: 413 });
  try {
    const stt = await env.AI.run(STT_MODEL, { audio, vad_filter: true });
    const language = stt.transcription_info?.language || "en";
    return Response.json({ text: String(stt.text || "").trim(), language, language_name: langName(language) });
  } catch {
    return Response.json({ error: "Couldn't hear that. Try again a little closer." }, { status: 502 });
  }
}

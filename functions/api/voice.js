import { STT_MODEL, cleanFields, extractFromSpeech, langName } from "../../lib/ai.js";

// Visitor speaks; Whisper transcribes (any language), the LLM fills the form.
export async function onRequestPost({ request, env }) {
  const { audio, fields, answers } = await request.json().catch(() => ({}));
  if (typeof audio !== "string" || audio.length < 100) return Response.json({ error: "No audio received." }, { status: 400 });
  if (audio.length > 4_000_000) return Response.json({ error: "Recording too long. Keep it under 30 seconds." }, { status: 413 });
  const list = cleanFields(fields);

  let stt;
  try {
    stt = await env.AI.run(STT_MODEL, { audio, vad_filter: true });
  } catch (e) {
    return Response.json({ error: "Couldn't hear that. Try again a little closer to the tablet." }, { status: 502 });
  }
  const transcript = String(stt.text || "").trim();
  const language = stt.transcription_info?.language || "en";
  if (!transcript) return Response.json({ transcript: "", language, answers: {}, reply: "Sorry, I didn't catch that. Tap the mic and try again." });

  try {
    const { answers: found, reply } = await extractFromSpeech(env, list, transcript, answers, language);
    const merged = { ...(answers || {}), ...found };
    const missing = list.filter((f) => f.required && (merged[f.id] === undefined || merged[f.id] === "")).map((f) => f.label);
    return Response.json({ transcript, language, language_name: langName(language), answers: found, missing, reply });
  } catch (e) {
    return Response.json({ transcript, language, answers: {}, missing: [], reply: "I heard you, but please check the form and fill in anything missing." });
  }
}

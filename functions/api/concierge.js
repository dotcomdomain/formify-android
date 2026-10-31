import { TEXT_MODEL } from "../../lib/ai.js";
import { searchBusinesses } from "../../lib/search.js";

// Global assistant, step 1: understand what the person needs and find the business.
// Once they pick one, the app hands over to /api/agent (the in-form assistant) for that business.
export async function onRequestPost({ request, env }) {
  const { messages, shown } = await request.json().catch(() => ({}));
  if (!Array.isArray(messages) || !messages.length) return Response.json({ error: "No message." }, { status: 400 });
  const options = Array.isArray(shown) ? shown.slice(0, 6).map((b, i) => `${i + 1}. ${String(b.name).slice(0, 80)} (${String(b.business_type || "").slice(0, 30)})`).join("\n") : "";

  const schema = {
    type: "object",
    properties: { reply: { type: "string" }, search_query: { type: "string" }, pick: { type: "number" } },
    required: ["reply", "search_query", "pick"]
  };
  const system = `You are Formify's assistant. People tell you what they need (a haircut, a ski rental, a walk-in clinic, a table) and you find a business on Formify, then help them check in.
${options ? `Businesses you last showed them:\n${options}\n` : ""}Return JSON:
- search_query: 1-3 keywords to search businesses (e.g. "haircut", "ski rental", "clinic"), or "" if no search is needed.
- pick: the number of the business they chose from the list above, or 0 if they haven't chosen.
- reply: one short friendly sentence. If searching, say you're looking. If they picked, say you'll start their check-in.
Never invent businesses. No medical advice; for emergencies tell them to call 911.`;

  try {
    const out = await env.AI.run(TEXT_MODEL, {
      messages: [{ role: "system", content: system }, ...messages.slice(-10).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 800) }))],
      response_format: { type: "json_schema", json_schema: schema }, max_tokens: 250, temperature: 0.2
    });
    const raw = typeof out.response === "string" ? JSON.parse(out.response) : out.response;
    const pick = Math.round(Number(raw?.pick) || 0);
    if (pick > 0 && Array.isArray(shown) && shown[pick - 1]) return Response.json({ reply: raw.reply, picked: shown[pick - 1].id });

    const q = String(raw?.search_query || "").trim();
    if (q) {
      let results = await searchBusinesses(env, q);
      // Fall back to single keywords so "ski rental tomorrow" still finds "Northline Ski Rentals".
      if (!results.length) for (const word of q.split(/\s+/)) { results = await searchBusinesses(env, word); if (results.length) break; }
      const top = results.slice(0, 4);
      return Response.json({
        reply: top.length ? `${raw.reply} Here's what I found, most used first. Tap one, or tell me which.`.replace(/\s+/g, " ").trim() : `I couldn't find anything for "${q}" on Formify yet. Try another word, like "clinic" or "barber".`,
        results: top
      });
    }
    return Response.json({ reply: String(raw?.reply || "What can I help you check in for?") });
  } catch (e) {
    return Response.json({ reply: "Sorry, I had trouble with that. Try saying what you need in a few words, like \"haircut\" or \"ski rental\"." });
  }
}

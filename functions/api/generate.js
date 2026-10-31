import { SCHEMA, sanitize, pickTemplate } from "../../lib/config.js";
import { guessPlaybook } from "../../lib/playbooks.js";
import { polishForm, tradeFor, tradeGuide } from "../../lib/formgen.js";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const SYSTEM = `You write the form a real business in this trade hands to its customers.
From the owner's description, produce one form config.
Rules:
- Write it the way an experienced owner in this trade would: the questions they actually need, in plain words.
- Use a select field with realistic options whenever the answers are predictable.
- Never ask for things the business already knows or that the form itself does, like a confirm box, a notify field or appointment details staff set.
- Never invent a business name. Use the name only if the owner gave one; otherwise use "Your business". No placeholders in brackets.
- business_type is a short plain phrase, like "auto repair".
- 1 to 3 steps, at most 5 fields per step. Ask only what the business needs to serve the customer.
- Mark a field sensitive if it is health, financial, contact or date of birth data.
- consent_text says plainly what is collected, who sees it, and when it is deleted (use retention_days).
- Pick retention_days as short as the use allows (clinic 30, restaurant 7, airport 2 by default).
- brand_color is a hex color that suits the business. ticket_prefix is one capital letter.
- notify names who gets alerted (e.g. "Front desk").
- Keep wording short and friendly; visitors read it on a tablet.`;

export async function onRequestPost({ request, env }) {
  const { prompt } = await request.json().catch(() => ({}));
  const text = String(prompt || "").slice(0, 800);
  if (!text.trim()) return Response.json({ error: "Describe your business first." }, { status: 400 });

  const trade = tradeFor(text);
  try {
    const out = await env.AI.run(MODEL, {
      messages: [{ role: "system", content: SYSTEM + tradeGuide(trade) }, { role: "user", content: text }],
      response_format: { type: "json_schema", json_schema: SCHEMA },
      max_tokens: 1500
    });
    const raw = typeof out.response === "string" ? JSON.parse(out.response) : out.response;
    return Response.json({ config: sanitize(polishForm({ ...raw, playbook: guessPlaybook(text) }, text, trade)), source: "ai" });
  } catch (err) {
    // Demo must never dead-end: fall back to the closest template and say so.
    return Response.json({ config: sanitize({ ...pickTemplate(text), playbook: guessPlaybook(text) }), source: "template", note: String(err.message || err).slice(0, 200) });
  }
}

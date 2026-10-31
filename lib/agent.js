// Check-in assistant: a conversation that fills the form. It never submits on its own.
import { TEXT_MODEL, answersSchema, keepKnown, langName } from "./ai.js";

const fieldList = (fields) => fields.map((f) => `- ${f.id}: "${f.label}" (${f.type}${f.required ? ", required" : ""}${f.options ? `, one of: ${f.options.join(" | ")}` : ""})`).join("\n");

export async function agentTurn(env, config, ctx, messages, answers, language) {
  const fields = config.steps.flatMap((s) => s.fields);
  const missing = fields.filter((f) => f.required && (answers[f.id] === undefined || answers[f.id] === "")).map((f) => f.label);

  const system = `You are the check-in assistant for ${config.name}, a ${config.business_type}${config.city ? ` in ${config.city}` : ""}.
You chat with a visitor to fill in their check-in form. The visitor reviews it and taps Check in themselves; you cannot submit it.

Form fields:
${fieldList(fields)}

Already filled: ${JSON.stringify(answers)}
Still required: ${missing.length ? missing.join(", ") : "nothing"}

Facts about the business you may share:
- People waiting right now: ${ctx.waiting ?? "unknown"}; about ${config.avg_service_minutes} minutes per visitor.
- How their information is used: ${config.consent_text}
- After check-in: ${config.done_message}

Rules:
- Be warm and brief: at most 2 short sentences. Ask for one or two things at a time.
- Reply in the visitor's language (${langName(language)} unless they switch).
- Put everything the visitor tells you into "answers" using the field ids. Values in English. Dates as YYYY-MM-DD. Choice fields must use one of the listed options exactly.
- Never invent or guess a value. If something is unclear, ask.
- No medical, legal or financial advice. If the visitor describes an emergency (chest pain, trouble breathing, severe bleeding, thoughts of self-harm), tell them to alert staff right now or call 911.
- Only answer questions about the business from the facts above; otherwise say the front desk can help.
- Until nothing required is missing, every reply ends with a question for the next missing field.
- When nothing required is missing, briefly confirm what you have and tell them to tap "Review and check in".
- Set "urgent" to true only for an emergency like the ones above.`;

  const schema = { type: "object", properties: { reply: { type: "string" }, answers: answersSchema(fields), ready: { type: "boolean" }, urgent: { type: "boolean" } }, required: ["reply", "answers", "ready", "urgent"] };
  const history = messages.slice(-14).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 1000) }));
  const out = await env.AI.run(TEXT_MODEL, {
    messages: [{ role: "system", content: system }, ...history],
    response_format: { type: "json_schema", json_schema: schema },
    max_tokens: 700, temperature: 0.3
  });
  const raw = typeof out.response === "string" ? JSON.parse(out.response) : out.response;

  const found = keepKnown(fields, raw?.answers);
  const merged = { ...answers, ...found };
  const stillMissing = fields.filter((f) => f.required && (merged[f.id] === undefined || merged[f.id] === "")).map((f) => f.label);
  const urgent = !!raw?.urgent;
  // Models sometimes leak a stray brace or forget to move on; keep the conversation going.
  let reply = String(raw?.reply || "").replace(/[\s{}]+$/, "").trim() || "Sorry, could you say that again?";
  if (!urgent && language === "en") {
    if (stillMissing.length && !reply.includes("?")) reply += ` Could you tell me your ${stillMissing[0].toLowerCase()}?`;
    if (!stillMissing.length && !/review/i.test(reply)) reply += " I have everything I need. Tap Review and check in when you're ready.";
  }
  return { reply: reply.slice(0, 600), answers: found, missing: stillMissing, ready: stillMissing.length === 0, urgent };
}

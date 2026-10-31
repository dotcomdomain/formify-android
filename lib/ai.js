// AI helpers shared by the voice, scan and check-in endpoints.

export const TEXT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const VISION_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
export const STT_MODEL = "@cf/openai/whisper-large-v3-turbo";
export const TTS_MODEL = "@cf/deepgram/aura-2-en";

const LANGS = { en: "English", fr: "French", es: "Spanish", pa: "Punjabi", ar: "Arabic", zh: "Chinese", hi: "Hindi", ur: "Urdu", pt: "Portuguese", it: "Italian", tl: "Tagalog", ko: "Korean", vi: "Vietnamese", ta: "Tamil", fa: "Persian", pl: "Polish", uk: "Ukrainian", ru: "Russian", de: "German" };
export const langName = (code) => LANGS[code] || code || "English";

// Only the fields the kiosk defines can ever come back, with the right types.
export function cleanFields(fields) {
  return (Array.isArray(fields) ? fields : []).slice(0, 30).map((f) => ({
    id: String(f.id).slice(0, 40), label: String(f.label).slice(0, 80), type: String(f.type), required: !!f.required,
    options: Array.isArray(f.options) ? f.options.map(String).slice(0, 12) : undefined
  }));
}

function answersSchema(fields) {
  const properties = {};
  for (const f of fields) {
    properties[f.id] = f.type === "checkbox" ? { type: "boolean" }
      : f.type === "number" ? { type: "number" }
      : f.options ? { type: "string", enum: [...f.options, ""] }
      : { type: "string" };
  }
  return { type: "object", properties };
}

// Models write dates many ways; the date input only accepts YYYY-MM-DD.
function toIsoDate(v) {
  const m = String(v).match(/(\d{4})\D{1,3}(\d{1,2})\D{1,3}(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "";
}

function keepKnown(fields, raw) {
  const out = {};
  for (const f of fields) {
    let v = raw?.[f.id];
    if (v === undefined || v === null || v === "") continue;
    if (f.type === "checkbox") v = v === true || v === "true";
    else if (f.type === "number") { v = Number(v); if (!Number.isFinite(v)) continue; }
    else v = String(v).trim().slice(0, 300);
    if (f.options && !f.options.includes(v)) continue;
    if (f.type === "date") { v = toIsoDate(v); if (!v) continue; }
    out[f.id] = v;
  }
  return out;
}

async function runJson(env, model, messages, schema, max_tokens = 800) {
  const out = await env.AI.run(model, { messages, response_format: { type: "json_schema", json_schema: schema }, max_tokens, temperature: 0.1 });
  return typeof out.response === "string" ? JSON.parse(out.response) : out.response;
}

const fieldList = (fields) => fields.map((f) => `- ${f.id}: "${f.label}" (${f.type}${f.options ? `, one of: ${f.options.join(" | ")}` : ""})`).join("\n");

// Turn what the visitor said (any language) into form answers, in English.
export async function extractFromSpeech(env, fields, transcript, existing, language) {
  const schema = { type: "object", properties: { answers: answersSchema(fields), reply: { type: "string" } }, required: ["answers", "reply"] };
  const raw = await runJson(env, TEXT_MODEL, [
    { role: "system", content: `You fill in a check-in form from what a visitor said out loud at a kiosk.
Fields:
${fieldList(fields)}
Rules:
- Only fill a field if the visitor clearly said it. Never guess IDs, numbers or dates.
- Write values in English even if the visitor spoke another language. Dates as YYYY-MM-DD.
- For choice fields use exactly one of the listed options.
- reply: one short, friendly sentence in ${langName(language)}. If required fields are still missing, ask for the next one. Otherwise say they can review and check in.` },
    { role: "user", content: `Already filled: ${JSON.stringify(existing || {})}\nVisitor said: "${transcript}"` }
  ], schema);
  return { answers: keepKnown(fields, raw?.answers), reply: String(raw?.reply || "").slice(0, 300) };
}

// Read a card (health card, boarding pass, ID) into the form. The image is never stored.
// Only fields that can be printed on a card are offered, so the model can't invent the rest.
const CARD_TYPES = new Set(["text", "date", "number", "tel", "email"]);
const NOT_ON_CARD = /reason|symptom|why|visit|note|anything|allerg|help|party|starter|bags/i;

export async function extractFromImage(env, fields, dataUrl, model = VISION_MODEL) {
  const cardFields = fields.filter((f) => CARD_TYPES.has(f.type) && !NOT_ON_CARD.test(f.label));
  if (!cardFields.length) return { answers: {}, card_type: "card" };
  const properties = { card_type: { type: "string" } };
  for (const f of cardFields) properties[f.id] = { type: "string" };
  const raw = await runJson(env, model, [
    { role: "system", content: `You read a photo of a card or document and copy printed details exactly.
Return JSON with these keys (use "" if a value is not printed on the card):
${cardFields.map((f) => `- ${f.id}: ${f.label}${f.type === "date" ? " (YYYY-MM-DD)" : ""}`).join("\n")}
- card_type: short name like "Ontario health card" or "boarding pass"
Bilingual cards: "BORN / NE(E) LE" or "DOB" is the date of birth. Ignore issue and expiry dates.` },
    { role: "user", content: [{ type: "text", text: "Read this card." }, { type: "image_url", image_url: { url: dataUrl } }] }
  ], { type: "object", properties, required: Object.keys(properties) }, 400);
  return { answers: keepKnown(cardFields, raw), card_type: String(raw?.card_type || "card").slice(0, 60), raw };
}

// One-line note for the front desk. It summarises and escalates; it never diagnoses.
export async function handoffNote(env, config, answers, meta) {
  const labelled = {};
  for (const s of config.steps) for (const f of s.fields) {
    if (answers[f.id] === undefined) continue;
    // Identifiers stay out of the note; staff can still reveal them on the ticket.
    if (/card|number|birth|dob|phone|email|passport|address/i.test(f.label) && f.sensitive) continue;
    labelled[f.label] = answers[f.id];
  }
  const schema = { type: "object", properties: { summary: { type: "string" }, flags: { type: "array", items: { type: "string" } } }, required: ["summary", "flags"] };
  const raw = await runJson(env, TEXT_MODEL, [
    { role: "system", content: `You write a handoff note for the front desk of a ${config.business_type} ("${config.name}").
- summary: at most 18 words, what this visitor needs, in plain English. No ID numbers, birth dates or contact details.
- flags: 0 to 3 short operational alerts for staff, only when relevant. Examples: "Needs interpreter: Punjabi", "Wheelchair assistance", "Reported fever or cough: offer a mask", "Tell staff now: reports chest pain".
- Never diagnose, give medical advice or rank how sick someone is. If something sounds urgent, flag it for a human.` },
    { role: "user", content: `Checked in via ${meta.channel}. Visitor language: ${langName(meta.language)}.\nAnswers: ${JSON.stringify(labelled)}` }
  ], schema, 300);
  return {
    summary: String(raw?.summary || "").slice(0, 200),
    flags: (Array.isArray(raw?.flags) ? raw.flags : []).map((f) => String(f).slice(0, 60)).filter(Boolean).slice(0, 3)
  };
}

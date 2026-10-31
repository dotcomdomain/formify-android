import { cleanFields, extractFromImage } from "../../lib/ai.js";

// Visitor holds a card to the camera. We read the fields and drop the image.
export async function onRequestPost({ request, env }) {
  const { image, fields, model } = await request.json().catch(() => ({}));
  if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(image)) return Response.json({ error: "No photo received." }, { status: 400 });
  if (image.length > 3_000_000) return Response.json({ error: "Photo too large." }, { status: 413 });
  try {
    const allowed = ["@cf/meta/llama-4-scout-17b-16e-instruct", "@cf/mistralai/mistral-small-3.1-24b-instruct"];
    const { answers, card_type } = await extractFromImage(env, cleanFields(fields), image, allowed.includes(model) ? model : undefined);
    return Response.json({ answers, card_type, found: Object.keys(answers).length });
  } catch (e) {
    return Response.json({ error: "Couldn't read the card. Try again with less glare, or type it in.", detail: String(e.message || e).slice(0, 200) }, { status: 502 });
  }
}

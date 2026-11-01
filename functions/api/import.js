import { memberFor, can } from "../../lib/auth.js";
import { MAX_FILE_BYTES, ImportError, validateUpload, importDocument } from "../../lib/import.js";

const MAX_BODY_BYTES = MAX_FILE_BYTES + 65536;

// Enforce the limit even when Content-Length is absent or untruthful.
async function readUpload(request) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new ImportError("Upload a document using multipart/form-data.", 415);
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw new ImportError("Choose a document smaller than 5 MB.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ImportError("No document received.", 400);
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new ImportError("Choose a document smaller than 5 MB.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return await new Response(new Blob(chunks), { headers: { "content-type": request.headers.get("content-type") } }).formData(); }
  catch { throw new ImportError("The upload was damaged. Choose your document again.", 400); }
}

export async function onRequestPost({ request, env }) {
  const respond = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
  try {
    // Prevent a cross-origin form POST from spending an authenticated business's quota.
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return respond({ error: "Upload documents from Formify." }, 403);
    const member = await memberFor(env, request);
    if (!member) return respond({ error: "Sign in to import documents." }, 401);
    if (!can(member, "forms")) return respond({ error: "Ask your owner or a manager to import forms." }, 403);
    const form = await readUpload(request);
    if (form.getAll("file").length !== 1) throw new ImportError("Upload one document at a time.", 400);
    const file = form.get("file");
    const mode = form.get("mode") || "recreate";
    if (!["recreate", "generate"].includes(mode)) throw new ImportError("Choose whether to recreate a form or generate questions.", 400);
    const validated = await validateUpload(file);
    // One row per business; atomic reservation also limits simultaneous imports.
    const windowStart = Math.floor(Date.now() / 600000) * 600000;
    const allowed = await env.DB.prepare(`INSERT INTO document_import_limits (business_id, window_start, attempts) VALUES (?, ?, 1)
      ON CONFLICT(business_id) DO UPDATE SET
        attempts = CASE WHEN window_start = excluded.window_start THEN attempts + 1 ELSE 1 END,
        window_start = excluded.window_start
      WHERE window_start != excluded.window_start OR attempts < 5
      RETURNING attempts`).bind(member.business_id, windowStart).first();
    if (!allowed) return respond({ error: "Import limit reached. Try again in up to 10 minutes." }, 429, { "retry-after": String(Math.ceil((windowStart + 600000 - Date.now()) / 1000)) });
    return respond(await importDocument(env, validated, mode));
  } catch (e) {
    if (e instanceof ImportError) return respond({ error: e.message }, e.status);
    // Never expose document content or upstream provider error messages.
    return respond({ error: "Document import is temporarily unavailable. Try again shortly or use the description builder." }, 502);
  }
}

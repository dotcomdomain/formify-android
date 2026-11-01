import test from "node:test";
import assert from "node:assert/strict";
import { validateUpload, reviewImport, importDocument, MAX_FILE_BYTES, MAX_TEXT_CHARS } from "../lib/import.js";
import { sanitize } from "../lib/config.js";
import { onRequestPost } from "../functions/api/import.js";

const fixture = () => ({ complete: true, warnings: ["Check the signature separately."], config: {
  name: "Registration", consent_text: "Original consent.\n".repeat(40),
  steps: [{ title: "Your details", description: "Use your current contact information.", fields: [
    { label: "Email", type: "email", sensitive: true, required: true, description: "For confirmation only." },
    { label: "Session", type: "select", sensitive: false, required: false, options: ["Morning", "Afternoon"] }
  ] }]
} });
const file = (contents = "Email: ____\nSession: Morning / Afternoon", name = "intake.txt") => new File([contents], name);
const ai = (result = fixture()) => ({ run: async () => ({ response: JSON.stringify(result) }) });

test("validates text, PDF, images and Office container signatures", async () => {
  for (const upload of [file(), file("%PDF-1.7\n", "intake.pdf"), file(new Uint8Array([137,80,78,71,13,10,26,10]), "photo.png"), file(new Uint8Array([255,216,255]), "photo.jpg"), file("RIFF1234WEBP", "photo.webp"), file("PK\x03\x04word/document.xml", "intake.docx"), file("PK\x03\x04xl/workbook.xml", "intake.xlsx"), file("PK\x03\x04content.xml", "intake.odt")]) {
    assert.ok((await validateUpload(upload)).mime);
  }
});

test("rejects fake, binary, empty, unsupported and oversized uploads", async () => {
  for (const upload of [file("plain text", "fake.pdf"), file("PK\x03\x04xl/workbook.xml", "fake.docx"), file("x\x00y"), file(new Uint8Array([255,254])), file(""), file("hello", "file.exe"), "not a file"]) {
    await assert.rejects(validateUpload(upload), /document|format|Unsupported/);
  }
  await assert.rejects(validateUpload({ size: MAX_FILE_BYTES + 1, arrayBuffer() {} }), { status: 413 });
});

test("preserves instructions, long consent, choices and IDs through repeated sanitization", () => {
  const result = reviewImport(fixture());
  assert.equal(result.config.consent_text, fixture().config.consent_text.trim());
  assert.equal(result.config.steps[0].description, "Use your current contact information.");
  assert.equal(result.config.steps[0].fields[0].description, "For confirmation only.");
  assert.deepEqual(result.config.steps[0].fields[1].options, ["Morning", "Afternoon"]);
  assert.deepEqual(sanitize(result.config), result.config);
  assert.equal(result.config.flow, "forms_only");
  assert.equal(result.config.levers.deposit_cents, 0);
});

test("keeps all 40 supported questions without enabling model-supplied extras", () => {
  const raw = fixture();
  raw.config.steps = Array.from({ length: 5 }, (_, i) => ({ title: `Part ${i}`, fields: Array.from({ length: 8 }, (_, j) => ({ label: `Question ${i}-${j}`, type: "text", required: false, sensitive: false })) }));
  raw.config.levers = { addons: [{ name: "Injected", price_cents: 100 }], deposit_cents: 999 };
  const clean = reviewImport(raw).config;
  assert.equal(clean.steps.flatMap((s) => s.fields).length, 40);
  assert.equal(new Set(clean.steps.flatMap((s) => s.fields).map((f) => f.id)).size, 40);
  assert.deepEqual(clean.levers.addons, []);
});

test("empty consent uses a neutral agreement and a review note", () => {
  const raw = fixture(); raw.config.consent_text = "";
  const result = reviewImport(raw);
  assert.equal(result.config.consent_text, "I agree to submit this form to the business.");
  assert.ok(result.warnings.some((w) => w.includes("No consent")));
});

test("unexpected section metadata cannot silently remove questions", () => {
  const raw = fixture(); raw.config.steps[0].auto = "extras";
  assert.equal(reviewImport(raw).config.steps[0].fields[0].label, "Email");
});

test("rejects partial conversion and anything that would silently lose form content", () => {
  const changes = [
    (r) => { r.complete = false; },
    (r) => { r.config.steps = []; },
    (r) => { r.config.steps = Array(6).fill(r.config.steps[0]); },
    (r) => { r.config.steps[0].fields = Array(9).fill(r.config.steps[0].fields[0]); },
    (r) => { r.config.steps[0].fields[0].label = "x".repeat(81); },
    (r) => { r.config.steps[0].fields[0].type = "signature"; },
    (r) => { r.config.steps[0].description = "x".repeat(2001); },
    (r) => { r.config.consent_text = "x".repeat(4001); },
    (r) => { r.config.steps[0].fields[1].options = Array(13).fill("x"); },
    (r) => { r.config.steps[0].fields[1].options = [""]; },
    (r) => { r.config.steps[0] = null; }
  ];
  for (const change of changes) { const raw = fixture(); change(raw); assert.throws(() => reviewImport(raw)); }
});

test("text conversion uses full source, structured output and no generic fallback", async () => {
  let calls = 0;
  const upload = file("Question\n".repeat(200));
  const env = { AI: { run: async (model, args) => {
    calls++;
    assert.ok(args.messages[1].content.length > 800);
    assert.equal(args.response_format.type, "json_schema");
    return { response: JSON.stringify(fixture()) };
  } } };
  const result = await importDocument(env, await validateUpload(upload), "recreate");
  assert.equal(result.source, "document");
  assert.equal(calls, 1);
  await assert.rejects(importDocument({ AI: { run: async () => ({ response: "{" }) } }, await validateUpload(upload), "recreate"), { status: 502 });
});

test("PDF uses typed Markdown conversion and rejects empty, failed or overlong extraction", async () => {
  const upload = await validateUpload(file("%PDF-1.7\n", "intake.pdf"));
  for (const result of [{ format: "error", error: "private content" }, { format: "markdown", data: "" }, { format: "markdown", data: "x".repeat(MAX_TEXT_CHARS + 1) }]) {
    await assert.rejects(importDocument({ AI: { ...ai(), toMarkdown: async () => result } }, upload, "recreate"));
  }
  const result = await importDocument({ AI: { ...ai(), toMarkdown: async (doc) => {
    assert.equal(doc.blob.type, "application/pdf"); return { format: "markdown", data: "Email: ____" };
  } } }, upload, "recreate");
  assert.ok(result.warnings.some((w) => w.includes("scanned")));
});

test("images go directly to vision with review warnings", async () => {
  const upload = await validateUpload(file(new Uint8Array([255,216,255]), "scan.jpg"));
  const result = await importDocument({ AI: { run: async (model, args) => {
    assert.match(model, /scout/);
    assert.match(args.messages[1].content[1].image_url.url, /^data:image\/jpeg;base64,/);
    return { response: fixture() };
  } } }, upload, "generate");
  assert.ok(result.warnings.some((w) => w.includes("image")));
  assert.ok(result.warnings.some((w) => w.includes("generated")));
});

function endpointEnv({ role = "owner", limited = false, fail = false } = {}) {
  const writes = [];
  return { writes, AI: fail ? { run: async () => { throw new Error("SECRET DOCUMENT CONTENT"); } } : ai(), DB: {
    prepare(sql) { return { bind(...values) { return { async first() {
      if (sql.includes("FROM sessions")) return { subject_id: "member", expires_at: Date.now() + 100000 };
      if (sql.includes("FROM members")) return { business_id: "business", role };
      if (sql.includes("INSERT INTO document_import_limits")) { writes.push(values); return limited ? null : { attempts: 1 }; }
      throw new Error(`Unexpected SQL ${sql}`);
    } }; } }; }
  } };
}
function request(upload = file(), { cookie = true, mode = "recreate", origin } = {}) {
  const body = new FormData(); body.set("file", upload); body.set("mode", mode);
  return new Request("https://formify.test/api/import", { method: "POST", body, headers: { ...(cookie ? { cookie: `fz_biz=${"a".repeat(64)}` } : {}), ...(origin ? { origin } : {}) } });
}

test("endpoint requires a business owner/manager and same origin", async () => {
  for (const [req, env, status] of [[request(file(), { cookie: false }), endpointEnv(), 401], [request(), endpointEnv({ role: "staff" }), 403], [request(file(), { origin: "https://other.test" }), endpointEnv(), 403]]) {
    assert.equal((await onRequestPost({ request: req, env })).status, status);
    assert.equal(env.writes.length, 0);
  }
});

test("endpoint returns a draft with no original content stored", async () => {
  const env = endpointEnv({ role: "manager" });
  const response = await onRequestPost({ request: request(), env });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).source, "document");
  assert.equal(env.writes.length, 1);
  assert.deepEqual(env.writes[0], ["business", Math.floor(Date.now() / 600000) * 600000]);
});

test("endpoint rate limits conversion and hides provider errors", async () => {
  const response = await onRequestPost({ request: request(), env: endpointEnv({ limited: true }) });
  assert.equal(response.status, 429);
  assert.ok(+response.headers.get("retry-after") > 0);
  const error = await onRequestPost({ request: request(), env: endpointEnv({ fail: true }) });
  assert.equal(error.status, 502);
  assert.doesNotMatch(await error.text(), /SECRET/);
});

test("endpoint rejects invalid mode and malformed multipart bodies", async () => {
  assert.equal((await onRequestPost({ request: request(file(), { mode: "other" }), env: endpointEnv() })).status, 400);
  const req = new Request("https://formify.test/api/import", { method: "POST", headers: { cookie: `fz_biz=${"a".repeat(64)}`, "content-type": "multipart/form-data; boundary=test" }, body: "broken" });
  assert.equal((await onRequestPost({ request: req, env: endpointEnv() })).status, 400);
});

test("endpoint caps streamed bodies without Content-Length", async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_FILE_BYTES + 65537)); controller.close(); } });
  const req = new Request("https://formify.test/api/import", { method: "POST", duplex: "half", body: stream, headers: { cookie: `fz_biz=${"a".repeat(64)}`, "content-type": "multipart/form-data; boundary=test" } });
  const env = endpointEnv();
  assert.equal((await onRequestPost({ request: req, env })).status, 413);
  assert.equal(env.writes.length, 0);
});

const DAY = 86400000;

async function loadConfig(env, id) {
  const row = await env.DB.prepare("SELECT config FROM kiosks WHERE id = ?").bind(id).first();
  return row ? JSON.parse(row.config) : null;
}

// Visitor checks in from the kiosk.
export async function onRequestPost({ params, request, env }) {
  const config = await loadConfig(env, params.id);
  if (!config) return Response.json({ error: "Kiosk not found" }, { status: 404 });
  const { answers, consent } = await request.json().catch(() => ({}));
  if (!consent) return Response.json({ error: "Consent is required." }, { status: 400 });

  // Keep only fields the config defines, so the kiosk can't be used to store anything else.
  const clean = {};
  for (const step of config.steps) for (const f of step.fields) {
    const v = answers?.[f.id];
    if (f.required && (v === undefined || v === "" || v === false)) return Response.json({ error: `${f.label} is required.` }, { status: 400 });
    if (v !== undefined && v !== "") clean[f.id] = f.type === "checkbox" ? !!v : String(v).slice(0, 500);
  }

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM checkins WHERE kiosk_id = ? AND created_at >= ?").bind(params.id, start.getTime()).first();
  const ticket = `${config.ticket_prefix}${String(n + 1).padStart(3, "0")}`;
  const now = Date.now();
  await env.DB.prepare("INSERT INTO checkins (kiosk_id, ticket, answers, created_at) VALUES (?, ?, ?, ?)").bind(params.id, ticket, JSON.stringify(clean), now).run();

  const { waiting } = await env.DB.prepare("SELECT COUNT(*) AS waiting FROM checkins WHERE kiosk_id = ? AND status = 'waiting'").bind(params.id).first();
  return Response.json({ ticket, ahead: waiting - 1, wait_minutes: (waiting - 1) * config.avg_service_minutes });
}

// Dashboard: queue, today's numbers, audit log. Sensitive answers are masked unless revealed.
export async function onRequestGet({ params, request, env }) {
  const config = await loadConfig(env, params.id);
  if (!config) return Response.json({ error: "Kiosk not found" }, { status: 404 });

  // Retention is enforced on read, so old data never shows up even if no job ran.
  await env.DB.prepare("DELETE FROM checkins WHERE kiosk_id = ? AND created_at < ?").bind(params.id, Date.now() - config.retention_days * DAY).run();

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const { results } = await env.DB.prepare("SELECT id, ticket, answers, status, created_at, served_at FROM checkins WHERE kiosk_id = ? AND created_at >= ? ORDER BY created_at")
    .bind(params.id, start.getTime() - DAY).all();
  const audit = (await env.DB.prepare("SELECT action, detail, at FROM audit WHERE kiosk_id = ? ORDER BY at DESC LIMIT 30").bind(params.id).all()).results;

  const reveal = new URL(request.url).searchParams.get("reveal");
  const sensitive = new Set(config.steps.flatMap((s) => s.fields.filter((f) => f.sensitive).map((f) => f.id)));
  const checkins = results.map((r) => {
    const a = JSON.parse(r.answers);
    if (String(r.id) !== reveal) for (const k of Object.keys(a)) if (sensitive.has(k)) a[k] = "•••";
    return { ...r, answers: a };
  });
  if (reveal) {
    const t = results.find((r) => String(r.id) === reveal);
    if (t) await env.DB.prepare("INSERT INTO audit (kiosk_id, action, detail, at) VALUES (?, ?, ?, ?)").bind(params.id, "viewed sensitive data", `Ticket ${t.ticket}`, Date.now()).run();
  }
  return Response.json({ config, checkins, audit });
}

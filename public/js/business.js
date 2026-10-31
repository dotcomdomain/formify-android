// Formify for Business. Hash routes: #live #forms #forms/new #forms/<id> #insights #settings
import { mountKiosk } from "/render.js";

const root = document.getElementById("root");
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const time = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { "content-type": "application/json" }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || "Something went wrong."); e.status = r.status; throw e; }
  return data;
}
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2600); }

let me = null, loc = null, poll;
const pick = () => { try { return localStorage.getItem("fz_loc"); } catch { return null; } };
const remember = (id) => { try { localStorage.setItem("fz_loc", id); } catch {} };

// ---------- Auth ----------
let mode = "login";
function renderAuth() {
  clearInterval(poll);
  root.innerHTML = `<div class="auth">
    <section class="pitch">
      <a class="brand" href="/"><span class="mark" style="color:#fff">Form<i>ify</i></span><span class="tag" style="color:#9fb5a8">for Business</span></a>
      <div>
        <h1>Fortify your business with <em>Formify.</em></h1>
        <p style="font-size:18px;color:#cfdcd3;max-width:460px">Describe your front desk in one sentence. Get an AI check-in that customers fill from their phone, a live queue, staff alerts and payments. Keep your current systems.</p>
      </div>
      <p class="small" style="color:#9fb5a8">Free to start · no install · cancel anytime</p>
    </section>
    <section class="formside">
      <form id="auth">
        <div class="seg"><button type="button" data-m="login" class="${mode === "login" ? "on" : ""}">Sign in</button><button type="button" data-m="signup" class="${mode === "signup" ? "on" : ""}">Create account</button></div>
        <h2 style="font-size:34px">${mode === "login" ? "Welcome back" : "Start free"}</h2>
        ${mode === "signup" ? '<label for="bname">Business name</label><input id="bname" required autocomplete="organization">' : ""}
        <label for="email">Email</label><input id="email" type="email" required autocomplete="email">
        <label for="pass">Password</label><input id="pass" type="password" minlength="8" required autocomplete="${mode === "login" ? "current-password" : "new-password"}">
        <button style="width:100%;margin-top:18px" class="btn-big">${mode === "login" ? "Sign in" : "Create my account"}</button>
        <p class="k-err" id="err"></p>
        <p class="muted small">Looking to check in somewhere? <a href="/">Go to Formify</a></p>
      </form>
    </section>
  </div>`;
  root.querySelectorAll("[data-m]").forEach((b) => b.onclick = () => { mode = b.dataset.m; renderAuth(); });
  $("#auth").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api(`/api/biz/${mode}`, { method: "POST", body: { name: $("#bname")?.value, email: $("#email").value, password: $("#pass").value } });
      await boot(mode === "signup" ? "forms/new" : null);
    } catch (err) { $("#err").textContent = err.message; }
  });
}

// ---------- Shell ----------
async function loadMe() {
  me = await api("/api/biz/me");
  loc = me.locations.find((l) => l.id === pick()) || me.locations[0] || null;
}
function shell(active, inner) {
  const alerts = me.locations.reduce((n, l) => n + l.alerts, 0);
  root.innerHTML = `<div class="biz">
    <aside class="sidebar">
      <a class="brand" href="#live"><span class="mark">Form<i>ify</i></span><span class="tag">Business</span></a>
      ${me.locations.length ? `<label class="small" style="color:#9fb5a8;margin:0">Location</label>
        <select id="locsel">${me.locations.map((l) => `<option value="${l.id}"${l.id === loc?.id ? " selected" : ""}>${esc(l.name)}</option>`).join("")}</select>` : ""}
      <nav>${[["live", "Live", alerts], ["forms", "Forms"], ["insights", "Insights"], ["settings", "Settings"]]
        .map(([k, l, c]) => `<button data-nav="${k}" class="${active === k ? "on" : ""}">${l}${c ? `<span class="count">${c}</span>` : ""}</button>`).join("")}</nav>
      <div class="who">${esc(me.business.name)}<br>${esc(me.business.email)}</div>
    </aside>
    <main class="bizmain view">${inner}</main>
  </div>`;
  root.querySelectorAll("[data-nav]").forEach((b) => b.onclick = () => { location.hash = b.dataset.nav; });
  $("#locsel")?.addEventListener("change", (e) => { remember(e.target.value); loc = me.locations.find((l) => l.id === e.target.value); route(); });
}

function route() {
  clearInterval(poll);
  if (!me) return;
  const [tab, id] = (location.hash.slice(1) || "live").split("/");
  if (tab === "forms" && id) return renderBuilder(id === "new" ? null : id);
  if (tab === "forms") return renderForms();
  if (tab === "insights") return renderInsights();
  if (tab === "settings") return renderSettings();
  return renderLive();
}
window.addEventListener("hashchange", route);

const noLocation = (title) => shell(title, `<h1>${title === "live" ? "Live" : "Insights"}</h1>
  <div class="empty panel" style="margin-top:20px"><b>No locations yet</b>Create your first check-in form. It takes a sentence.<div style="margin-top:16px"><a href="#forms/new"><button class="btn-big">Create a form</button></a></div></div>`);

// ---------- Live ----------
const amounts = {};
let seen = new Set(), first = true, reveal = "";
function beep() {
  try { const a = new AudioContext(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; o.connect(g); g.connect(a.destination); g.gain.value = .15; o.start(); setTimeout(() => o.frequency.value = 660, 180); setTimeout(() => { o.stop(); a.close(); }, 420); } catch {}
}
async function renderLive() {
  if (!loc) return noLocation("live");
  shell("live", `<div class="row" style="justify-content:space-between;align-items:flex-end">
      <div><h1>${esc(loc.name)}</h1><p class="muted" style="margin:0">Live front desk · updates every few seconds</p></div>
      <a href="/kiosk.html?id=${loc.id}" target="_blank" class="biz-link">Open the kiosk</a></div>
    <div id="alerts" style="margin-top:18px"></div>
    <div class="kpis" id="kpis"></div>
    <div id="queue"></div>`);
  first = true; seen = new Set();
  await loadLive();
  poll = setInterval(() => { if (!reveal && !document.activeElement?.dataset?.amt) loadLive(); }, 4000);
}
async function loadLive() {
  let d;
  try { d = await api(`/api/kiosks/${loc.id}/checkins${reveal ? `?reveal=${reveal}` : ""}`); } catch (e) { if (e.status === 403) return renderAuth(); return; }
  if (!$("#queue")) return;
  const fresh = d.alerts.filter((a) => !seen.has(a.id));
  if (fresh.length && !first) beep();
  d.alerts.forEach((a) => seen.add(a.id)); first = false;
  $("#alerts").innerHTML = d.alerts.map((a) => `<div class="alert-bar ${a.kind}"><div><div style="font-size:18px">${a.kind === "emergency" ? "Possible emergency at check-in" : "A visitor needs help at the kiosk"}${a.ticket ? ` · ${esc(a.ticket)}` : ""}</div>
    <div style="font-weight:500;opacity:.9">${esc(a.message || "")} · ${time(a.at)}</div></div><button data-ack="${a.id}">On my way</button></div>`).join("");

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = d.checkins.filter((c) => c.created_at >= start.getTime());
  const served = today.filter((c) => c.served_at);
  const avg = served.length ? served.reduce((a, c) => a + (c.served_at - (c.arrived_at || c.created_at)), 0) / served.length / 60000 : 0;
  const paid = today.filter((c) => c.paid_at).reduce((a, c) => a + (c.amount_cents || 0), 0);
  $("#kpis").innerHTML = [[d.checkins.filter((c) => c.status === "waiting").length, "waiting now"], [d.checkins.filter((c) => c.status === "pending").length, "on the way (checked in remotely)"],
    [served.length ? avg.toFixed(1) : "–", "avg. wait, minutes"], [money(paid), "paid through Formify today"]].map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");

  const labels = Object.fromEntries(d.config.steps.flatMap((s) => s.fields.map((f) => [f.id, f.label])));
  const order = { serving: 0, payment: 1, waiting: 2, pending: 3 };
  const active = d.checkins.filter((c) => c.status in order || String(c.id) === reveal).sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4) || (a.arrived_at || a.created_at) - (b.arrived_at || b.created_at));
  const open = new Set([...document.querySelectorAll("details[open]")].map((x) => x.dataset.d));
  $("#queue").innerHTML = active.length ? active.map((c) => {
    const flags = (c.flags || []).map((f) => `<span class="flag${/now|urgent|chest|breath|bleed/i.test(f) ? " urgent" : ""}">${esc(f)}</span>`).join("");
    const details = Object.entries(c.answers).map(([k, v]) => `<div><span class="muted">${esc(labels[k] || k)}:</span> ${v === true ? "Yes" : esc(v)}</div>`).join("");
    const masked = Object.values(c.answers).includes("•••");
    const acts = c.status === "waiting" ? `<button data-s="serving" data-id="${c.id}">Call ${esc(c.ticket)}</button>`
      : c.status === "serving" ? `<button data-s="done" data-id="${c.id}">Done</button><input data-amt="${c.id}" inputmode="decimal" placeholder="$ total" value="${esc(amounts[c.id] || "")}"><button class="btn-alt" data-pay="${c.id}">Send to cashier</button>`
      : c.status === "payment" ? `<span class="pill payment">awaiting ${money(c.amount_cents)}</span><button data-s="done" data-paid="counter" data-id="${c.id}">Paid at counter</button>`
      : `<span class="pill">on the way</span>`;
    return `<div class="qcard ${c.status === "pending" ? "pending" : ""}">
      <div><div class="tk">${esc(c.ticket)}</div><div class="muted small">${time(c.arrived_at || c.created_at)} · ${esc(c.channel || "kiosk")}</div></div>
      <div>${c.summary ? `<div class="summary" style="font-size:17px">${esc(c.summary)}</div>${flags}` : Date.now() - c.created_at < 60000 ? '<div class="muted small">Writing handoff note...</div>' : ""}
        <details data-d="${c.id}"${open.has(String(c.id)) || String(c.id) === reveal ? " open" : ""}><summary>Answers</summary>${details}${masked ? `<button class="ghost" data-reveal="${c.id}" style="margin-top:6px">Reveal sensitive (logged)</button>` : ""}</details></div>
      <div class="acts">${acts}${c.status !== "payment" ? `<button class="ghost" data-s="no-show" data-id="${c.id}">No-show</button>` : ""}</div>
    </div>`;
  }).join("") : `<div class="empty panel"><b>All clear</b>New check-ins from the kiosk, phones and AI assistants show up here.</div>`;
}

root.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.reveal) { reveal = b.dataset.reveal; await loadLive(); reveal = ""; return; }
    if (b.dataset.ack) { await api(`/api/alerts/${b.dataset.ack}`, { method: "POST" }); return loadLive(); }
    if (b.dataset.pay) {
      const amount = parseFloat(String(amounts[b.dataset.pay] || "").replace(/[^0-9.]/g, ""));
      if (!(amount > 0)) return $(`[data-amt="${b.dataset.pay}"]`)?.focus();
      await api(`/api/checkins/${b.dataset.pay}`, { method: "PATCH", body: { status: "payment", amount } });
      delete amounts[b.dataset.pay]; return loadLive();
    }
    if (b.dataset.s) { await api(`/api/checkins/${b.dataset.id}`, { method: "PATCH", body: { status: b.dataset.s, paid: b.dataset.paid } }); return loadLive(); }
  } catch (err) { toast(err.message); }
});
root.addEventListener("input", (e) => { if (e.target.dataset.amt) amounts[e.target.dataset.amt] = e.target.value; });

// ---------- Forms ----------
function renderForms() {
  shell("forms", `<div class="row" style="justify-content:space-between;align-items:flex-end"><div><h1>Forms</h1><p class="muted" style="margin:0">One form per location. Share the link, print the QR, or run it on a tablet.</p></div>
      <a href="#forms/new"><button class="btn-big">New form</button></a></div>
    <div class="cards" style="margin-top:22px">${me.locations.map((l) => `<div class="loccard" style="--b:${esc(l.brand_color)}">
      <h3>${esc(l.name)}</h3><div class="muted small" style="text-transform:capitalize">${esc(l.business_type)}${l.city ? ` · ${esc(l.city)}` : ""} · Ease ${l.ease.avg ?? "–"}</div>
      <div class="links"><a href="#forms/${l.id}">Edit form</a><a href="/kiosk.html?id=${l.id}" target="_blank">Kiosk</a><a href="/go.html?id=${l.id}" target="_blank">Phone link</a><a href="/#b/${l.id}" target="_blank">Public page</a><button data-qr="${l.id}">QR code</button></div>
      <div data-qrbox="${l.id}" style="margin-top:12px"></div></div>`).join("") || '<div class="empty panel" style="grid-column:1/-1"><b>No forms yet</b>Create one in a sentence.</div>'}</div>`);
  root.querySelectorAll("[data-qr]").forEach((b) => b.onclick = () => {
    const box = root.querySelector(`[data-qrbox="${b.dataset.qr}"]`);
    if (box.childElementCount) { box.innerHTML = ""; return; }
    new window.QRCode(box, { text: `${location.origin}/go.html?id=${b.dataset.qr}`, width: 140, height: 140 });
  });
}

const TYPES = ["text", "tel", "email", "date", "number", "select", "checkbox", "textarea"];
let draft = null, source = "";
async function renderBuilder(id) {
  draft = null; source = "";
  shell("forms", `<button class="back" onclick="location.hash='forms'">&larr; Forms</button>
    <h1>${id ? "Edit form" : "New form"}</h1>
    ${id ? "" : `<div class="panel" style="margin:16px 0 22px">
      <p class="small" style="margin:0 0 6px;font-weight:700;color:var(--clay)">Fortify your business with Formify</p>
      <h2 style="font-size:28px">Describe your front desk in a sentence</h2>
      <p class="muted">Who checks in, and what you need to know before you serve them. The AI drafts the form; you approve it.</p>
      <textarea id="prompt" rows="3" placeholder="Barbershop in Hamilton. Walk-ins pick a service and a barber, and we text them when their chair is ready."></textarea>
      <div class="chiprow" style="margin:12px 0">${[["Clinic", "Family clinic in Hamilton. Patients check in with their health card and date of birth, pick walk-in or booked appointment, and say why they're visiting."], ["Barber", "Barbershop. Walk-ins pick a service (haircut, fade, beard trim) and a preferred barber, and leave a phone number for a text."], ["Ski rental", "Ski and snowboard rental shop. Renters give height, weight, boot size, skier type and package, add a helmet, and accept the waiver."], ["Restaurant", "Busy noodle restaurant. Guests join the waitlist with party size and a phone number, and can pre-order a starter."]]
        .map(([l, t]) => `<button type="button" data-ex="${esc(t)}">${l}</button>`).join("")}</div>
      <div class="row"><button id="gen" class="btn-big">Draft my form</button><span class="muted small" id="gstat"></span></div></div>`}
    <div id="editor" class="grid2" ${id ? "" : "hidden"} style="gap:22px"></div>`);
  root.querySelectorAll("[data-ex]").forEach((b) => b.onclick = () => { $("#prompt").value = b.dataset.ex; });
  $("#gen")?.addEventListener("click", async () => {
    const prompt = $("#prompt").value.trim();
    if (!prompt) return $("#prompt").focus();
    $("#gen").disabled = true; $("#gstat").textContent = "Drafting your form...";
    try { const r = await api("/api/generate", { method: "POST", body: { prompt } }); draft = r.config; source = r.source; $("#gstat").textContent = r.source === "ai" ? "Drafted by AI. Review it below." : "Started from a template."; openEditor(null); }
    catch (e) { $("#gstat").textContent = e.message; }
    $("#gen").disabled = false;
  });
  if (id) { draft = (await api(`/api/kiosks/${id}`)).config; openEditor(id); }
}

function openEditor(id) {
  const ed = $("#editor");
  ed.hidden = false;
  const f = (k, label, attrs = "") => `<div><label>${label}</label><input data-k="${k}" ${attrs}></div>`;
  ed.innerHTML = `<div class="panel">
      <h2 style="font-size:24px">Review before it goes live</h2>
      <p class="muted small">Sensitive fields are hidden from staff until revealed, and every reveal is logged.</p>
      <div class="grid2" style="gap:12px">${f("name", "Business name")}${f("brand_color", "Brand colour", 'type="color" style="height:44px;padding:4px"')}</div>
      <label>Welcome title</label><input data-k="welcome_title">
      <label>Consent text visitors agree to</label><textarea data-k="consent_text" rows="2"></textarea>
      <div class="grid2" style="gap:12px">${f("retention_days", "Delete data after (days)", 'type="number" min="1" max="365"')}${f("avg_service_minutes", "Minutes per visitor", 'type="number" min="1" max="120"')}</div>
      <div id="fields"></div>
      <div class="step-title">Public page</div>
      <div class="grid2" style="gap:12px">${f("city", "City", 'placeholder="Hamilton, ON"')}${f("instagram", "Instagram", 'placeholder="@yourbusiness"')}${f("google_reviews", "Google reviews link")}${f("website", "Website")}</div>
      <label class="check" style="font-weight:500"><input type="checkbox" data-k="listed" style="width:auto"> List in the Formify search</label>
      <div class="row" style="margin-top:18px"><button id="save" class="btn-big">${id ? "Save changes" : "Approve and publish"}</button><span class="muted small" id="sstat"></span></div>
    </div>
    <div><div class="row" style="justify-content:space-between;margin-bottom:8px"><strong>Live preview</strong><span class="muted small">Try it, including the assistant</span></div>
      <div id="preview" class="panel" style="padding:0;overflow:hidden"></div></div>`;
  fill(); preview();
  ed.addEventListener("input", onEdit);
  ed.addEventListener("change", (e) => { if (e.target.type === "checkbox" || e.target.tagName === "SELECT") preview(); });
  $("#fields").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-rm]")?.dataset.rm;
    if (!rm) return;
    const [si, fi] = rm.split(".").map(Number);
    draft.steps[si].fields.splice(fi, 1);
    draft.steps = draft.steps.filter((s) => s.fields.length);
    fill(); preview();
  });
  $("#save").addEventListener("click", async () => {
    $("#save").disabled = true;
    try {
      if (id) { await api(`/api/kiosks/${id}`, { method: "PUT", body: { config: draft } }); toast("Saved"); }
      else { const r = await api("/api/kiosks", { method: "POST", body: { config: draft, source } }); remember(r.id); toast("Live! Your form is published."); }
      await loadMe(); location.hash = "forms";
    } catch (e) { $("#sstat").textContent = e.message; }
    $("#save").disabled = false;
  });
}
function fill() {
  document.querySelectorAll("#editor [data-k]").forEach((el) => { if (el.type === "checkbox") el.checked = draft[el.dataset.k] !== false; else el.value = draft[el.dataset.k] ?? ""; });
  $("#fields").innerHTML = draft.steps.map((s, si) => `<div class="step-title">Step ${si + 1}: <input data-st="${si}" value="${esc(s.title)}" style="display:inline;width:auto;padding:5px 8px"></div>
    ${s.fields.map((f, fi) => `<div class="field-row"><input data-f="${si}.${fi}.label" value="${esc(f.label)}">
      <select data-f="${si}.${fi}.type">${TYPES.map((t) => `<option${t === f.type ? " selected" : ""}>${t}</option>`).join("")}</select>
      <span class="row small" style="gap:10px"><label class="small" style="margin:0;font-weight:500"><input type="checkbox" data-f="${si}.${fi}.required" ${f.required ? "checked" : ""} style="width:auto"> required</label>
      <label class="small" style="margin:0;font-weight:500"><input type="checkbox" data-f="${si}.${fi}.sensitive" ${f.sensitive ? "checked" : ""} style="width:auto"> <span class="pill sens">sensitive</span></label></span>
      <button class="x" data-rm="${si}.${fi}" title="Remove field" aria-label="Remove ${esc(f.label)}">&times;</button></div>`).join("")}`).join("");
}
function onEdit(e) {
  const el = e.target;
  if (el.dataset.k) draft[el.dataset.k] = el.type === "number" ? +el.value : el.type === "checkbox" ? el.checked : el.value;
  if (el.dataset.st) draft.steps[+el.dataset.st].title = el.value;
  if (el.dataset.f) {
    const [si, fi, key] = el.dataset.f.split(".");
    const fld = draft.steps[si].fields[fi];
    fld[key] = el.type === "checkbox" ? el.checked : el.value;
    if (key === "type" && fld.type === "select" && !fld.options?.length) fld.options = ["Option 1", "Option 2"];
  }
  if (el.dataset.k !== undefined || el.dataset.f || el.dataset.st) preview();
}
let pn = 0;
function preview() {
  const host = document.createElement("div");
  $("#preview").replaceChildren(host);
  mountKiosk(host, draft, { mode: "preview", onSubmit: async () => ({ ticket: `${draft.ticket_prefix}${String(++pn).padStart(3, "0")}`, ahead: 2, wait_minutes: 2 * draft.avg_service_minutes }) });
}

// ---------- Insights ----------
async function renderInsights() {
  if (!loc) return noLocation("insights");
  shell("insights", `<h1>Insights</h1><p class="muted">${esc(loc.name)} · last 30 days. Only your own visitors; nothing is sold or shared.</p><div id="ins"><p class="muted">Loading...</p></div>`);
  const d = await api(`/api/kiosks/${loc.id}/checkins`);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = d.checkins.filter((c) => c.created_at >= start.getTime());
  const hours = Array.from({ length: 16 }, (_, i) => today.filter((c) => new Date(c.created_at).getHours() === i + 6).length);
  const max = Math.max(1, ...hours);
  const f = d.funnel;
  const finish = f.starts ? Math.round((f.checkins / Math.max(f.starts, f.checkins)) * 100) : null;
  const noShows = d.checkins.filter((c) => c.status === "no-show").length;
  $("#ins").innerHTML = `<div class="kpis">${[[f.views, "page views"], [f.starts, "started a check-in"], [f.checkins, "checked in"], [finish === null ? "–" : `${finish}%`, "finish rate"]].map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("")}</div>
    <div class="grid2" style="gap:22px">
      <div class="panel"><h2 style="font-size:24px">Ease Score</h2>
        <div class="score" style="--b:var(--forest)"><b style="font-size:52px">${d.ease.avg ? d.ease.avg.toFixed(1) : "–"}</b><span>/ 5 · ${d.ease.count} ratings</span></div>
        <p class="muted small">How easy visitors said checking in was. Comments are private to you.</p>
        <ul class="audit">${d.feedback.map((x) => `<li><span class="stars">${x.score}/5</span> · ${esc(x.ticket)} · ${time(x.at)}${x.comment ? `<div>${esc(x.comment)}</div>` : ""}</li>`).join("")}</ul></div>
      <div style="display:grid;gap:22px">
        <div class="panel"><h2 style="font-size:24px">Check-ins by hour (today)</h2><div class="bars">${hours.map((h, i) => `<div title="${i + 6}:00 · ${h}" style="height:${(h / max) * 100}%;background:var(--forest)"></div>`).join("")}</div>
          <div class="row small muted" style="justify-content:space-between"><span>6am</span><span>12pm</span><span>6pm</span></div>
          <p class="small" style="margin:10px 0 0">${noShows ? `${noShows} no-show${noShows > 1 ? "s" : ""} in the last day.` : "No no-shows in the last day."}</p></div>
        <div class="panel"><h2 style="font-size:24px">Audit log</h2><p class="muted small">Check-in data is deleted after ${d.config.retention_days} days.</p>
          <ul class="audit">${d.audit.map((a) => `<li><strong>${esc(a.action)}</strong> · ${time(a.at)}<div class="muted">${esc(a.detail)}</div></li>`).join("")}</ul></div>
      </div>
    </div>`;
}

// ---------- Settings ----------
function renderSettings() {
  shell("settings", `<h1>Settings</h1>
    <div class="grid2" style="gap:22px;margin-top:18px">
      <div class="panel"><h2 style="font-size:24px">Account</h2><p><strong>${esc(me.business.name)}</strong><br><span class="muted">${esc(me.business.email)}</span></p><button class="btn-alt" id="out">Sign out</button></div>
      <div class="panel"><h2 style="font-size:24px">AI assistants can check people in</h2>
        <p class="muted">Customers' own assistants (like Claude) can find you and check them in through Formify's MCP server, with the customer's confirmation.</p>
        <pre style="white-space:pre-wrap;background:var(--cream);padding:12px;border-radius:10px;font-size:13px">claude mcp add --transport http formify ${esc(location.origin)}/mcp</pre></div>
    </div>`);
  $("#out").onclick = async () => { await api("/api/biz/logout", { method: "POST" }); me = null; renderAuth(); };
}

async function boot(next) {
  try { await loadMe(); } catch { return renderAuth(); }
  if (next && location.hash !== `#${next}`) location.hash = next; else route();
}
boot();

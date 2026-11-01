// Formify for Business. Hash routes: #live #forms #forms/new #forms/<id> #insights #settings
import { mountKiosk } from "/render.js";
import { theme, setTheme } from "/js/theme.js";
import { renderInsightsView } from "/js/insights.js";
import { createDemo, COMPANY_SAMPLE } from "/js/demo.js";

let demoStorage;
try { demoStorage = localStorage; } catch {}
const demo = createDemo(demoStorage);
const demoEntry = new URL(location.href);
if (demoEntry.searchParams.get("demo") === "1") {
  demo.setEnabled(true);
  demoEntry.searchParams.delete("demo");
  history.replaceState(null, "", demoEntry.pathname + demoEntry.search + demoEntry.hash);
}
const switchDemo = (enabled) => { demo.setEnabled(enabled); location.reload(); };
const demoUrl = (id = loc?.id || COMPANY_SAMPLE.id, view = "kiosk") => `${location.origin}/demo.html?view=${encodeURIComponent(view)}&id=${encodeURIComponent(id)}`;

const root = document.getElementById("root");
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const time = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
async function api(url, opts = {}) {
  if (demo.enabled) return demo.request(url, opts);
  const r = await fetch(url, { ...opts, headers: { "content-type": "application/json" }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || "Something went wrong."); e.status = r.status; throw e; }
  return data;
}
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2600); }

let me = null, loc = null, poll;
const pick = () => { try { return localStorage.getItem(demo.enabled ? "fz_demo_loc" : "fz_loc"); } catch { return null; } };
const remember = (id) => { try { localStorage.setItem(demo.enabled ? "fz_demo_loc" : "fz_loc", id); } catch {} };

// ---------- Auth ----------
let mode = "login";
function renderAuth() {
  clearInterval(poll);
  root.innerHTML = `<div class="auth">
    <section class="pitch">
      <a class="brand" href="/"><img class="brand-logo" src="/logo.svg?v=916199d2b9" alt="Formify" width="320" height="80"><span class="tag" style="color:#9fb5a8">for Business</span></a>
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
        <button type="button" id="explore-demo" class="btn-alt" style="width:100%">Explore with demo data</button>
        <p class="muted small">Looking to check in somewhere? <a href="/">Go to Formify</a></p>
      </form>
    </section>
  </div>`;
  root.querySelectorAll("[data-m]").forEach((b) => b.onclick = () => { mode = b.dataset.m; renderAuth(); });
  $("#explore-demo").onclick = () => { demo.setEnabled(true); location.hash = "live"; location.reload(); };
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
      <a class="brand" href="#live"><img class="brand-logo" src="/logo.svg?v=916199d2b9" alt="Formify" width="320" height="80"><span class="tag">Business</span></a>
      ${me.locations.length ? `<label class="small" style="color:#9fb5a8;margin:0">Location</label>
        <select id="locsel">${me.locations.map((l) => `<option value="${l.id}"${l.id === loc?.id ? " selected" : ""}>${esc(l.name)}</option>`).join("")}</select>` : ""}
      <nav>${[["live", "Live", alerts], me.perms.forms && ["page", "Page"], me.perms.forms && ["forms", "Forms"], me.perms.insights && ["insights", "Insights"], me.perms.staff && ["people", "People"], ["settings", "Settings"]].filter(Boolean)
        .map(([k, l, c]) => `<button data-nav="${k}" class="${active === k ? "on" : ""}">${l}${c ? `<span class="count">${c}</span>` : ""}</button>`).join("")}</nav>
      <div class="who">${esc(me.member.name)} · ${esc(me.member.role)}<br>${esc(me.business.name)}
        <div><button class="theme-dot" id="themeBtn" title="Switch theme" aria-label="Switch colour theme"></button></div></div>
    </aside>
    <main class="bizmain view">${demo.enabled ? `<div class="demo-banner" role="status"><div><strong>Demo mode</strong><span>Fictional data. Changes stay in this browser; messages, payments and publishing are simulated.</span></div><div class="row"><a href="${demoUrl(COMPANY_SAMPLE.id)}" target="_blank" rel="noopener">Try Snow Valley concept</a><button type="button" id="exit-demo">Exit demo</button></div></div>` : ""}${inner}</main>
  </div>`;
  root.querySelectorAll("[data-nav]").forEach((b) => b.onclick = () => { location.hash = b.dataset.nav; });
  $("#themeBtn").onclick = () => setTheme(theme() === "blue" ? "warm" : "blue");
  $("#exit-demo")?.addEventListener("click", () => switchDemo(false));
  if (demo.enabled) root.querySelectorAll("a[href]").forEach((link) => {
    const url = new URL(link.href, location.origin);
    if (url.origin !== location.origin) return;
    const page = url.pathname.match(/^\/(kiosk|go|now)(?:\.html)?$/);
    if (page) link.href = demoUrl(url.searchParams.get("id") || loc.id, { kiosk:"kiosk", go:"phone", now:"now" }[page[1]]);
    else if (url.pathname.startsWith("/p/") || url.hash.startsWith("#b/")) link.href = demoUrl(loc?.id, "page");
  });
  $("#locsel")?.addEventListener("change", (e) => { remember(e.target.value); loc = me.locations.find((l) => l.id === e.target.value); route(); });
}

function route() {
  clearInterval(poll);
  if (!me) return;
  const [tab, id] = (location.hash.slice(1) || "live").split("/");
  if (tab === "forms" && me.perms.forms) return id ? renderBuilder(id === "new" ? null : id) : renderForms();
  if (tab === "insights" && me.perms.insights) return renderInsights();
  if (tab === "page" && me.perms.forms) return renderPageEditor();
  if (tab === "people" && me.perms.staff) return renderPeople();
  if (tab === "settings") return renderSettings();
  return renderLive();
}
window.addEventListener("hashchange", route);

const noLocation = (title) => shell(title, `<h1>${title === "live" ? "Live" : "Insights"}</h1>
  <div class="empty panel" style="margin-top:20px"><b>No locations yet</b>${me.perms.forms ? 'Create your first check-in form. It takes a sentence.<div style="margin-top:16px"><a href="#forms/new"><button class="btn-big">Create a form</button></a></div>' : "Ask your owner or a manager to set up a location."}</div>`);

// ---------- Live ----------
const amounts = {};
const prefilled = {};
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
    <div id="binbox"></div>
    <div id="goal"></div>
    <div class="kpis" id="kpis"></div>
    <div id="queue"></div>`);
  first = true; seen = new Set();
  await loadLive();
  poll = setInterval(() => { const a = document.activeElement?.dataset || {}; if (!reveal && !a.amt && !a.tin && !a.keepr && !a.apt && !a.apa) loadLive(); }, 4000);
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
  $("#goal").innerHTML = goalCard(d.goal);
  $("#kpis").innerHTML = [[d.checkins.filter((c) => c.status === "waiting").length, "waiting now"], [d.checkins.filter((c) => c.status === "pending").length, "on the way (checked in remotely)"],
    [served.length ? avg.toFixed(1) : "–", "avg. wait, minutes"], [money(paid), "paid through Formify today"]].map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");

  const labels = Object.fromEntries(d.config.steps.flatMap((s) => s.fields.map((f) => [f.id, f.label])));
  $("#binbox").innerHTML = d.inbox.length ? `<div class="panel" style="margin-bottom:16px"><h3 style="margin:0 0 6px">Needs a reply</h3>${d.inbox.map((x) => `
    <div class="visit-row"><div style="min-width:0"><b>${esc(x.ticket)}</b> <span class="muted small">${esc(x.status)}</span>
      ${x.delete_status === "requested" ? `<div class="small"><span class="flag urgent">Data deletion request</span> The customer asked you to delete their info.${x.delete_note ? ` "${esc(x.delete_note)}"` : ""}</div>
        <div class="row small" style="gap:6px;margin-top:6px"><button data-ddel="${x.id}">Delete their info</button><input data-keepr="${x.id}" placeholder="Or: reason you must keep it" style="flex:1;min-width:160px;padding:7px 9px"><button class="btn-alt" data-dkeep="${x.id}">Keep</button></div>` : ""}
      ${x.unread ? `<div class="small" style="margin-top:4px">${x.unread} new message${x.unread > 1 ? "s" : ""}: "${esc(x.last || "")}"</div><button class="ghost small" data-thread="${x.id}" style="margin-top:6px">Open conversation</button><div class="bthread" data-thr="${x.id}" ${openThreads.has(String(x.id)) ? "" : "hidden"}></div>` : ""}
    </div></div>`).join("")}</div>` : "";

  const flow = d.config.flow || "walk_in";
  const order = { serving: 0, ready: 1, payment: 2, waiting: 3, pending: 4 };
  const active = d.checkins.filter((c) => c.status in order || String(c.id) === reveal).sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4) || a.line_at - b.line_at);
  const open = new Set([...document.querySelectorAll("details[open]")].map((x) => x.dataset.d));
  $("#queue").innerHTML = active.length ? active.map((c) => {
    const flags = (c.flags || []).map((f) => `<span class="flag${/now|urgent|chest|breath|bleed/i.test(f) ? " urgent" : ""}">${esc(f)}</span>`).join("");
    const details = Object.entries(c.answers).map(([k, v]) => `<div><span class="muted">${esc(labels[k] || k)}:</span> ${v === true ? "Yes" : esc(v)}</div>`).join("");
    const masked = Object.values(c.answers).includes("•••");
    // Add-ons the customer ticked pre-fill the cashier total.
    const addonCents = d.config.steps.flatMap((st) => st.fields).filter((f) => f.price_cents && c.answers[f.id] === true).reduce((a, f) => a + f.price_cents, 0);
    // So do approved extras, added on top of anything already typed in.
    const extraCents = addonCents + (c.approved_cents || 0);
    if (extraCents !== (prefilled[c.id] || 0)) {
      const typed = Math.round((parseFloat(amounts[c.id]) || 0) * 100);
      amounts[c.id] = ((typed + extraCents - (prefilled[c.id] || 0)) / 100).toFixed(2);
      prefilled[c.id] = extraCents;
    }
    const badges = [c.deposit_cents ? `<span class="pill ${c.deposit_paid_at ? "ok" : ""}">deposit ${money(c.deposit_cents)} ${c.deposit_paid_at ? "paid" : "unpaid"}</span>` : "",
      d.goal.playbook === "faster_mornings" && !String(c.channel || "").startsWith("kiosk") ? '<span class="pill ok">express</span>' : "",
      addonCents ? `<span class="pill">add-ons ${money(addonCents)}</span>` : "",
      c.approvals_open ? '<span class="pill payment">waiting on approval</span>' : "",
      c.approved_cents ? `<span class="pill ok">approved ${money(c.approved_cents)}</span>` : ""].join(" ");
    const acts = c.status === "waiting" ? `<button data-s="serving" data-id="${c.id}">Call ${esc(c.ticket)}</button>`
      : c.status === "serving" && flow === "dropoff" ? `<button data-s="ready" data-id="${c.id}">Ready for pickup</button>`
      : c.status === "serving" || c.status === "ready" ? `${c.status === "ready" ? '<span class="pill ok">ready for pickup</span>' : ""}<button data-s="done" data-id="${c.id}">Done</button><input data-amt="${c.id}" inputmode="decimal" placeholder="$ total" value="${esc(amounts[c.id] || "")}"><button class="btn-alt" data-pay="${c.id}">Send to cashier</button>`
      : c.status === "payment" ? `<span class="pill payment">awaiting ${money(c.amount_cents)}</span><button data-s="done" data-paid="counter" data-id="${c.id}">Paid at counter</button>`
      : `<span class="pill">on the way</span>`;
    return `<div class="qcard ${c.status === "pending" ? "pending" : ""}">
      <div><div class="tk">${esc(c.ticket)}${c.unread ? `<span class="unread">${c.unread}</span>` : ""}</div><div class="muted small">${time(c.arrived_at || c.created_at)} · ${esc(c.channel || "kiosk")}</div><div style="margin-top:6px">${badges}</div></div>
      <div>${c.summary ? `<div class="summary" style="font-size:17px">${esc(c.summary)}</div>${flags}` : Date.now() - c.created_at < 60000 ? '<div class="muted small">Writing handoff note...</div>' : ""}
        <details data-d="${c.id}"${open.has(String(c.id)) || String(c.id) === reveal ? " open" : ""}><summary>Answers</summary>${details}${masked ? `<button class="ghost" data-reveal="${c.id}" style="margin-top:6px">Reveal sensitive (logged)</button>` : ""}</details>
        <button class="ghost small" data-thread="${c.id}" style="margin-top:6px">${openThreads.has(String(c.id)) ? "Hide" : "Messages"}${c.unread ? ` (${c.unread} new)` : ""}</button>
        <div class="bthread" data-thr="${c.id}" ${openThreads.has(String(c.id)) ? "" : "hidden"}></div></div>
      <div class="acts">${acts}${c.status !== "payment" ? `<button class="ghost" data-s="no-show" data-id="${c.id}">No-show</button>` : ""}</div>
    </div>`;
  }).join("") : `<div class="empty panel"><b>All clear</b>New check-ins from the kiosk, phones and AI assistants show up here.</div>`;
  for (const id of openThreads) drawThread(id);
}

function goalCard(g) {
  if (!g) return "";
  return `<div class="goalcard"><div><div class="small" style="font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.8">Playbook: ${esc(g.name)} · ${esc(g.goal)}</div>
    <div class="row" style="gap:16px;align-items:baseline;margin-top:6px"><span class="gv">${esc(g.value)}</span><span><b>${esc(g.metric)}</b> ${esc(g.detail)}</span></div></div>
    ${me.perms.forms ? `<a href="#forms/${loc.id}" class="small" style="color:inherit">Change goal</a>` : ""}</div>`;
}

// ---------- Visit threads (business side) ----------
const openThreads = new Set();
const drafts = {};
const QUICK_REPLIES = ["Come on in, you're next", "Running about 10 minutes behind, sorry!", "It's ready for pickup", "Can you come to the front desk?"];
async function drawThread(id) {
  const boxes = root.querySelectorAll(`[data-thr="${id}"]`);
  if (!boxes.length) return;
  let msgs, approvals;
  try { ({ messages: msgs, approvals } = await api(`/api/checkins/${id}/messages`)); } catch { return; }
  const ap = apDrafts[id] || {};
  const open = approvals.some((a) => a.status === "pending");
  const html = `<div class="tml">${msgs.map((m) => {
    const t = time(m.at);
    if (m.kind === "approval") {
      const a = approvals.find((x) => x.message_id === m.id);
      const state = !a || a.status === "pending" ? ["payment", "waiting"] : a.status === "approved" ? ["ok", "approved"] : ["", "declined"];
      return `<div class="tm receipt"><span class="pill ${state[0]}">${state[1]}</span> ${esc(a?.title || m.body)}${a?.amount_cents ? ` · ${money(a.amount_cents)}` : ""} · ${t}</div>`;
    }
    if (m.sender === "system") return `<div class="tm ${m.kind === "receipt" ? "receipt" : "system"}">${esc(m.body)} · ${t}</div>`;
    return `<div class="tm ${m.sender}">${m.sender === "business" ? `<span class="small" style="opacity:.75">${esc(m.author || "Staff")}: </span>` : ""}${esc(m.body)} <span class="small" style="opacity:.6">${t}</span></div>`;
  }).join("") || '<div class="tm system">No messages yet.</div>'}</div>
    <div class="quick">${QUICK_REPLIES.map((q) => `<button data-qr="${id}" data-text="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    <div class="send"><input data-tin="${id}" placeholder="Reply to the customer" value="${esc(drafts[id] || "")}"><button data-tsend="${id}">Send</button></div>
    <div class="send"><input data-apt="${id}" placeholder="Ask to approve, e.g. New brake cable" maxlength="140" value="${esc(ap.title || "")}"><input data-apa="${id}" inputmode="decimal" placeholder="$" aria-label="Amount" style="flex:0 0 72px" value="${esc(ap.amount || "")}"><button class="btn-alt" data-apsend="${id}" ${open ? "disabled" : ""}>${open ? "Waiting" : "Ask"}</button></div>`;
  boxes.forEach((b) => { b.innerHTML = html; });
}
const apDrafts = {};
async function askApproval(id) {
  const { title, amount } = apDrafts[id] || {};
  const dollars = String(amount || "").replace(/[^0-9.]/g, "");
  await api(`/api/checkins/${id}/approvals`, { method: "POST", body: { title, amount: dollars } });
  delete apDrafts[id];
  toast("Sent to the customer.");
  await loadLive();
}
async function sendReply(id, body) {
  if (!String(body || "").trim()) return;
  await api(`/api/checkins/${id}/messages`, { method: "POST", body: { body } });
  delete drafts[id];
  await drawThread(id);
}

root.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.reveal) { reveal = b.dataset.reveal; await loadLive(); reveal = ""; return; }
    if (b.dataset.ack) { await api(`/api/alerts/${b.dataset.ack}`, { method: "POST" }); return loadLive(); }
    if (b.dataset.thread) {
      const id = b.dataset.thread;
      if (openThreads.has(id)) openThreads.delete(id); else openThreads.add(id);
      root.querySelectorAll(`[data-thr="${id}"]`).forEach((x) => { x.hidden = !openThreads.has(id); });
      if (openThreads.has(id)) await drawThread(id);
      return;
    }
    if (b.dataset.qr) return sendReply(b.dataset.qr, b.dataset.text);
    if (b.dataset.tsend) return sendReply(b.dataset.tsend, root.querySelector(`[data-tin="${b.dataset.tsend}"]`)?.value);
    if (b.dataset.apsend) return await askApproval(b.dataset.apsend);
    if (b.dataset.invsend) return await sendInvite(b.dataset.invsend);
    if (b.dataset.copy) { await navigator.clipboard.writeText(b.dataset.copy); return toast(b.dataset.copied); }
    if (b.dataset.ddel) {
      if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap to confirm delete"; return; }
      await api(`/api/checkins/${b.dataset.ddel}/data`, { method: "POST", body: { action: "delete" } }); toast("Their info was deleted and they were told."); return loadLive();
    }
    if (b.dataset.dkeep) {
      const note = root.querySelector(`[data-keepr="${b.dataset.dkeep}"]`)?.value;
      await api(`/api/checkins/${b.dataset.dkeep}/data`, { method: "POST", body: { action: "keep", note } }); toast("Reply sent to the customer."); return loadLive();
    }
    if (b.dataset.pay) {
      const amount = parseFloat(String(amounts[b.dataset.pay] || "").replace(/[^0-9.]/g, ""));
      if (!(amount > 0)) return $(`[data-amt="${b.dataset.pay}"]`)?.focus();
      await api(`/api/checkins/${b.dataset.pay}`, { method: "PATCH", body: { status: "payment", amount } });
      delete amounts[b.dataset.pay]; return loadLive();
    }
    if (b.dataset.s) { await api(`/api/checkins/${b.dataset.id}`, { method: "PATCH", body: { status: b.dataset.s, paid: b.dataset.paid } }); return loadLive(); }
  } catch (err) { toast(err.message); }
});
root.addEventListener("input", (e) => { if (e.target.dataset.amt) amounts[e.target.dataset.amt] = e.target.value; if (e.target.dataset.tin) drafts[e.target.dataset.tin] = e.target.value; const { apt, apa } = e.target.dataset; if (apt) (apDrafts[apt] ||= {}).title = e.target.value; if (apa) (apDrafts[apa] ||= {}).amount = e.target.value; });
root.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset.tin) { e.preventDefault(); sendReply(e.target.dataset.tin, e.target.value); } });

root.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (!demo.enabled || !link) return;
  const url = new URL(link.href, location.origin);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) {
    event.preventDefault();
    try {
      const data = demo.request(url.pathname + url.search);
      if (!data.csv) return toast("This demo download is unavailable.");
      const blobUrl = URL.createObjectURL(new Blob([data.csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a"); anchor.href = blobUrl; anchor.download = "formify-demo-visits.csv"; anchor.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (error) { toast(error.message); }
    return;
  }
  const page = url.pathname.match(/^\/(kiosk|go|now)(?:\.html)?$/);
  if (page) link.href = demoUrl(url.searchParams.get("id") || loc.id, { kiosk:"kiosk", go:"phone", now:"now" }[page[1]]);
  else if (url.pathname.startsWith("/p/") || url.hash.startsWith("#b/")) link.href = demoUrl(loc?.id, "page");
});

// ---------- Forms ----------
function renderForms() {
  shell("forms", `<div class="row" style="justify-content:space-between;align-items:flex-end"><div><h1>Forms</h1><p class="muted" style="margin:0">One form per location. Share the link, print the QR, or run it on a tablet.</p></div>
      <a href="#forms/new"><button class="btn-big">New form</button></a></div>
    <div class="cards" style="margin-top:22px">${me.locations.map((l) => `<div class="loccard" style="--b:${esc(l.brand_color)}">
      <h3>${esc(l.name)}</h3><div class="muted small" style="text-transform:capitalize">${esc(l.business_type)}${l.city ? ` · ${esc(l.city)}` : ""} · Ease ${l.ease.avg ?? "–"}</div>
      <div class="links"><a href="#forms/${l.id}">Edit form</a><a href="/kiosk.html?id=${l.id}" target="_blank">Kiosk</a><a href="/go.html?id=${l.id}" target="_blank">Phone link</a><a href="/now.html?id=${l.id}" target="_blank">Now serving screen</a><a href="${me.business.slug ? `/p/${me.business.slug}` : `/#b/${l.id}`}" target="_blank">Public page</a><button data-qr="${l.id}">QR code</button></div>
      <div class="links"><button data-copy="${esc(demo.enabled ? demoUrl(l.id,"phone") : `${location.origin}/go.html?id=${l.id}`)}" data-copied="Link copied. Add it to Linktree, a bio or an email.">Copy form link</button><button data-copy="${esc(`<iframe src="${demo.enabled ? demoUrl(l.id,"phone") : `${location.origin}/go.html?id=${l.id}`}" title="${l.name}" width="100%" height="760" style="border:0"></iframe>`)}" data-copied="Embed code copied. Paste it into a WordPress Custom HTML block.">Copy website embed</button></div>
      <div data-qrbox="${l.id}" style="margin-top:12px"></div>
      <div class="bthread"><div class="send"><input type="email" data-invmail="${l.id}" placeholder="Their email" aria-label="Email to invite"><button data-invsend="${l.id}">Invite</button></div>
        <input data-invname="${l.id}" placeholder="Their name (optional)" aria-label="Their name" style="width:100%;margin-top:6px;padding:8px 10px"><div class="small muted" data-invlist="${l.id}" style="margin-top:8px"></div></div></div>`).join("") || '<div class="empty panel" style="grid-column:1/-1"><b>No forms yet</b>Create one in a sentence.</div>'}</div>`);
  me.locations.forEach((l) => drawInvites(l.id));
  root.querySelectorAll("[data-qr]").forEach((b) => b.onclick = () => {
    const box = root.querySelector(`[data-qrbox="${b.dataset.qr}"]`);
    if (box.childElementCount) { box.innerHTML = ""; return; }
    new window.QRCode(box, { text: demo.enabled ? demoUrl(b.dataset.qr, "phone") : `${location.origin}/go.html?id=${b.dataset.qr}`, width: 140, height: 140 });
  });
}

// Email invites: a personal form link per customer, with whether they've opened it.
const INVITE_STATUS = { created: "drafted", sent: "sent", opened: "opened" };
async function drawInvites(id) {
  const box = root.querySelector(`[data-invlist="${id}"]`);
  if (!box) return;
  try {
    const { invites } = await api(`/api/kiosks/${id}/invites`);
    box.innerHTML = invites.map((i) => `<div>${esc(i.name || i.email)} · <b>${INVITE_STATUS[i.status]}</b></div>`).join("");
  } catch { box.textContent = ""; }
}
async function sendInvite(id) {
  const email = root.querySelector(`[data-invmail="${id}"]`);
  const name = root.querySelector(`[data-invname="${id}"]`);
  const r = await api(`/api/kiosks/${id}/invites`, { method: "POST", body: { email: email.value, name: name.value } });
  email.value = ""; name.value = "";
  // Until email sending is connected, the invite opens as a ready-made draft in the owner's own mail app.
  if (demo.enabled) toast("Demo invite added. No email was sent.");
  else if (r.mailto) { location.href = r.mailto; toast("Invite ready in your email app."); } else toast("Invite sent.");
  await drawInvites(id);
}

const TYPES = ["text", "tel", "email", "date", "number", "select", "checkbox", "textarea"];
const TYPE_LABEL = { text: "Short answer", tel: "Phone", email: "Email", date: "Date", number: "Number", select: "Choice", checkbox: "Checkbox", textarea: "Long answer" };
let draft = null, source = "", importWarnings = [];
async function renderBuilder(id) {
  draft = null; source = ""; importWarnings = [];
  shell("forms", `<button class="back" onclick="location.hash='forms'">&larr; Forms</button>
    <h1>${id ? "Edit form" : "New form"}</h1>
    ${id ? "" : `<div class="panel" style="margin:16px 0 22px">
      <p class="small" style="margin:0 0 6px;font-weight:700;color:var(--clay)">Fortify your business with Formify</p>
      <h2 style="font-size:28px">Describe your business in a sentence</h2>
      <p class="muted">Say who fills it in and what you need to know. AI drafts the form, and you approve it.</p>
      <textarea id="prompt" rows="3" placeholder="Independent auto repair shop in Hamilton. Customers drop off cars for brakes and diagnostics."></textarea>
      <div class="chiprow" style="margin:12px 0">${[["Auto repair", "Independent auto repair shop in Hamilton. Customers drop off cars for brakes, oil changes and diagnostics."], ["Adventure park waiver", "Treetop adventure park waiver for visitors, with emergency contact and medical notes."], ["Event registration", "Event registration for a charity gala with guests and dietary needs."], ["Motel check-in", "Small motel guest check-in before arrival."], ["Clinic intake", "New patient intake for a physiotherapy clinic."], ["Staff onboarding", "Staff onboarding form for new hires at my shop. I need their contact details, start date, role and emergency contact."]]
        .map(([l, t]) => `<button type="button" data-ex="${esc(t)}">${l}</button>`).join("")}</div>
      <div class="row"><button id="gen" class="btn-big">Draft my form</button><span class="muted small" id="gstat" role="status"></span></div></div>
      <form id="document-import" class="panel" style="margin:16px 0 22px">
        <h2 style="font-size:28px">Import a document</h2>
        <p class="muted">Turn an existing document into an editable form. Review the draft before publishing.</p>
        <label for="import-file">Document, up to 5 MB</label>
        <input id="import-file" name="file" type="file" required accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.xlsx,.odt" aria-describedby="import-help">
        <p id="import-help" class="muted small">PDF, DOCX, PNG, JPEG, WebP, TXT, Markdown, CSV, XLSX or ODT. Up to 5 sections with 8 questions each. Files are sent to Cloudflare AI for processing; Formify does not save the original document.</p>
        <label for="import-mode">What would you like to do?</label>
        <select id="import-mode" name="mode"><option value="recreate">Recreate an existing form</option><option value="generate">Generate questions based on a document</option></select>
        <div class="row" style="margin-top:16px"><button id="import-button" class="btn-big">Import document</button><span id="import-status" class="muted small" role="status" aria-live="polite"></span></div>
      </form>`}
    <div id="editor" class="grid2" ${id ? "" : "hidden"} style="gap:22px"></div>`);
  root.querySelectorAll("[data-ex]").forEach((b) => b.onclick = () => { $("#prompt").value = b.dataset.ex; });
  $("#gen")?.addEventListener("click", async () => {
    const button = $("#gen"), status = $("#gstat"), importButton = $("#import-button");
    const prompt = $("#prompt").value.trim();
    if (!prompt) return $("#prompt").focus();
    button.disabled = true; importButton.disabled = true; status.textContent = "Drafting your form...";
    if ($("#save")) $("#save").disabled = true;
    try {
      const r = await api("/api/generate", { method: "POST", body: { prompt } });
      if (!button.isConnected) return;
      draft = r.config; source = r.source; importWarnings = [];
      status.textContent = r.source === "ai" ? "Drafted by AI. Review it below." : "Started from a template.";
      $("#import-status").textContent = ""; openEditor(null);
    } catch (e) { if (button.isConnected) status.textContent = e.message; }
    finally { button.disabled = false; importButton.disabled = false; if (button.isConnected && $("#save")) $("#save").disabled = false; }
  });
  $("#document-import")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget, button = $("#import-button"), status = $("#import-status"), gen = $("#gen");
    const file = $("#import-file").files[0];
    if (!file?.size) { status.textContent = "Choose a non-empty document."; return; }
    if (file.size > 5 * 1024 * 1024) { status.textContent = "Choose a document smaller than 5 MB."; return; }
    button.disabled = true; gen.disabled = true;
    if ($("#save")) $("#save").disabled = true;
    status.textContent = "Reading your document and drafting questions. This may take a minute...";
    form.setAttribute("aria-busy", "true");
    try {
      let result;
      if (demo.enabled) result = demo.request("/api/import", { method: "POST" });
      else {
        const response = await fetch("/api/import", { method: "POST", body: new FormData(form) });
        result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Could not import the document. Try again.");
      }
      if (!form.isConnected) return;
      draft = result.config; source = "document"; importWarnings = result.warnings || [];
      status.textContent = demo.enabled ? "Sample import ready. Your document was not uploaded or converted." : `Imported ${file.name}. Review the draft and notes below.`;
      $("#gstat").textContent = "";
      openEditor(null);
      $("#editor").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) { if (form.isConnected) status.textContent = error.message; }
    finally {
      button.disabled = false; gen.disabled = false; form.removeAttribute("aria-busy");
      if (form.isConnected && $("#save")) $("#save").disabled = false;
    }
  });
  if (id) { draft = (await api(`/api/kiosks/${id}`)).config; openEditor(id); }
}

function openEditor(id) {
  const ed = $("#editor");
  ed.hidden = false;
  const f = (k, label, attrs = "") => `<div><label>${label}</label><input data-k="${k}" ${attrs}></div>`;
  ed.classList.add("bldgrid");
  ed.classList.remove("grid2");
  ed.innerHTML = `<div class="bldmain">
      <div class="bldhead"><div><h2>${id ? "Edit your form" : "Your form is ready"}</h2><p class="muted">Check the questions, try the preview, then publish.</p></div>
        <div class="bldact"><button id="save" class="btn-big">${demo.enabled ? "Save demo form" : id ? "Save changes" : "Publish form"}</button><span class="muted small" id="sstat"></span></div></div>
      ${source === "document" ? `<section class="import-notes" aria-label="Document import review">
        <strong>Check your imported form</strong>
        <ul>${importWarnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
        <label class="check small"><input id="import-reviewed" type="checkbox" style="width:auto"> I compared the questions, choices and instructions with my document and reviewed these notes.</label>
      </section>` : ""}
      <div class="panel bldform">
        <input class="bldtitle" data-k="welcome_title" aria-label="Form title">
        <input class="bldsub" data-k="welcome_subtitle" aria-label="Form description">
        <div id="fields"></div>
        <div class="row" style="gap:10px"><button type="button" class="btn-alt" id="addq">Add a question</button><button type="button" class="btn-alt" id="add-section">Add a section</button></div>
      </div>
      <details class="bldsec"><summary>Goal and flow</summary>
        <div class="pbgrid" id="pbgrid"></div>
        <div id="levers"></div>
        <label for="flowsel">How do customers come in?</label>
        <select data-k="flow" id="flowsel">
          <option value="walk_in">Walk in and wait in line</option>
          <option value="appointment">Book ahead, then check in on arrival</option>
          <option value="dropoff">Drop off, pick up when it's ready</option>
          <option value="forms_only">Forms only (waivers, sign-ups), no line</option>
        </select>
      </details>
      <details class="bldsec"><summary>Privacy and consent</summary>
        <label>Consent text customers agree to</label><textarea data-k="consent_text" rows="3" maxlength="4000"></textarea>
        <div class="grid2" style="gap:12px">${f("retention_days", "Delete data after (days)", 'type="number" min="1" max="365"')}${f("avg_service_minutes", "Minutes per customer", 'type="number" min="1" max="120"')}</div>
        <p class="muted small">Private answers stay hidden from staff until revealed, and every reveal is logged.</p>
      </details>
      <details class="bldsec"><summary>Business details</summary>
        <div class="grid2" style="gap:12px">${f("name", "Business name")}${f("brand_color", "Brand colour", 'type="color" style="height:44px;padding:4px"')}${f("city", "City", 'placeholder="Hamilton, ON"')}${f("instagram", "Instagram", 'placeholder="@yourbusiness"')}${f("google_reviews", "Google reviews link")}${f("website", "Website")}</div>
        <label class="check" style="font-weight:500"><input type="checkbox" data-k="listed" style="width:auto"> Show in Formify search</label>
      </details>
    </div>
    <aside class="bldside"><div class="row" style="justify-content:space-between;margin-bottom:10px"><strong>Live preview</strong><span class="muted small">Try it like a customer</span></div>
      <div class="bldphone"><div id="preview"></div></div></aside>`;
  fill(); drawPlaybooks(); preview();
  ed.oninput = onEdit;
  ed.onclick = onLeverClick;
  ed.onchange = (e) => {
    if (e.target.closest("#preview")) return;
    if (e.target.dataset.f?.endsWith(".type")) {
      const [si, fi] = e.target.dataset.f.split(".").map(Number);
      const q = draft.steps[si].fields[fi];
      if (q.type === "select" && !q.options?.length) q.options = ["Option 1", "Option 2"];
      fill();
    }
    if (e.target.type === "checkbox" || e.target.tagName === "SELECT") preview();
  };
  $("#addq").addEventListener("click", () => {
    if (!draft.steps.length) draft.steps.push({ title: "Your details", fields: [] });
    const fields = draft.steps.at(-1).fields;
    if (fields.length >= 8) return toast("Each section supports up to 8 questions.");
    fields.push({ id: `field_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`, label: "New question", type: "text", required: false, sensitive: false });
    fill(); preview();
    [...root.querySelectorAll(".bldqlabel")].at(-1)?.select();
  });
  $("#fields").addEventListener("click", (e) => {
    const add = e.target.closest("[data-add-field]");
    if (add) {
      const fields = draft.steps[+add.dataset.addField].fields;
      if (fields.length >= 8) return toast("Each section supports up to 8 questions.");
      fields.push({ id: `field_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`, label: "New question", type: "text", required: false, sensitive: false });
      fill(); preview(); return;
    }
    const rm = e.target.closest("[data-rm]")?.dataset.rm;
    if (!rm) return;
    const [si, fi] = rm.split(".").map(Number);
    draft.steps[si].fields.splice(fi, 1);
    draft.steps = draft.steps.filter((s) => s.fields.length);
    fill(); preview();
  });
  $("#add-section").onclick = () => {
    if (draft.steps.filter((s) => s.auto !== "extras").length >= 5) return toast("A form supports up to 5 sections.");
    draft.steps.push({ title: "New section", description: "", fields: [{ id: `field_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`, label: "New question", type: "text", required: false, sensitive: false }] });
    fill(); preview();
  };
  $("#save").addEventListener("click", async () => {
    if (source === "document" && !$("#import-reviewed")?.checked) { $("#sstat").textContent = "Review the import notes and confirm you checked the draft before publishing."; $("#import-reviewed")?.focus(); return; }
    if (!draft.steps.some((s) => s.fields.length)) { $("#sstat").textContent = "Add at least one question before publishing."; return; }
    for (const field of draft.steps.flatMap((s) => s.fields)) {
      if (field.type === "select" && (!field.options?.length || field.options.length > 12 || field.options.some((o) => o.length > 60))) {
        $("#sstat").textContent = `Check choices for "${field.label}": use 1 to 12 choices, each up to 60 characters.`; return;
      }
    }
    $("#save").disabled = true;
    try {
      if (id) { await api(`/api/kiosks/${id}`, { method: "PUT", body: { config: draft } }); toast("Saved"); }
      else { const r = await api("/api/kiosks", { method: "POST", body: { config: draft, source } }); remember(r.id); toast(demo.enabled ? "Sample form saved in this browser." : "Live! Your form is published."); }
      await loadMe(); location.hash = "forms";
    } catch (e) { $("#sstat").textContent = e.message; }
    $("#save").disabled = false;
  });
}
function fill() {
  document.querySelectorAll("#editor [data-k]").forEach((el) => { if (el.type === "checkbox") el.checked = draft[el.dataset.k] !== false; else el.value = draft[el.dataset.k] ?? ""; });
  $("#fields").innerHTML = draft.steps.map((s, si) => `<input class="bldstep" data-st="${si}" maxlength="60" value="${esc(s.title)}" aria-label="Section title">
    ${s.description ? `<label class="small">Section instructions<textarea data-sd="${si}" rows="2" maxlength="2000">${esc(s.description)}</textarea></label>` : ""}
    ${s.fields.map((f, fi) => `<div class="bldq"><div class="bldqrow"><input class="bldqlabel" data-f="${si}.${fi}.label" value="${esc(f.label)}" aria-label="Question">
      <select data-f="${si}.${fi}.type" aria-label="Answer type">${TYPES.map((t) => `<option value="${t}"${t === f.type ? " selected" : ""}>${TYPE_LABEL[t]}</option>`).join("")}</select>
      <button class="x" data-rm="${si}.${fi}" title="Remove question" aria-label="Remove ${esc(f.label)}">&times;</button></div>
      ${f.type === "select" ? `<input class="bldopts" data-fo="${si}.${fi}" value="${esc((f.options || []).join(", "))}" placeholder="Choices, separated by commas" aria-label="Choices">` : ""}
      <div class="bldflags"><label><input type="checkbox" data-f="${si}.${fi}.required" ${f.required ? "checked" : ""}> Required</label>
      <label><input type="checkbox" data-f="${si}.${fi}.sensitive" ${f.sensitive ? "checked" : ""}> Private</label></div>
      ${f.description ? `<label class="small">Question instructions<textarea data-f="${si}.${fi}.description" rows="2" maxlength="2000">${esc(f.description)}</textarea></label>` : ""}</div>`).join("")}
    <button type="button" class="btn-alt small" data-add-field="${si}">Add a question here</button>`).join("");
}
function onEdit(e) {
  const el = e.target;
  if (el.closest("#preview") || el.id === "import-reviewed") return;
  if (el.dataset.fo) {
    const [si, fi] = el.dataset.fo.split(".").map(Number);
    draft.steps[si].fields[fi].options = el.value.split(",").map((o) => o.trim()).filter(Boolean);
    return preview();
  }
  if (el.dataset.k) draft[el.dataset.k] = el.type === "number" ? +el.value : el.type === "checkbox" ? el.checked : el.value;
  if (el.dataset.st) draft.steps[+el.dataset.st].title = el.value;
  if (el.dataset.sd !== undefined) draft.steps[+el.dataset.sd].description = el.value;
  if (el.dataset.f) {
    const [si, fi, key] = el.dataset.f.split(".");
    const fld = draft.steps[si].fields[fi];
    fld[key] = key === "options" ? el.value.split("\n").map((v) => v.trim()).filter(Boolean) : el.type === "checkbox" ? el.checked : el.value;
    if (key === "type" && fld.type === "select" && !fld.options?.length) fld.options = ["Option 1", "Option 2"];
  }
  if (el.dataset.lv) {
    const k = el.dataset.lv;
    if (k === "deposit") draft.levers.deposit_cents = Math.max(0, Math.round(+el.value * 100) || 0);
    else if (k === "rebook_weeks") draft.levers.rebook_weeks = +el.value;
    else draft.levers[k] = el.checked;
    return;
  }
  if (el.dataset.ad) {
    const [i, key] = el.dataset.ad.split(".");
    const a = draft.levers.addons[+i];
    if (key === "name") a.name = el.value; else a.price_cents = Math.max(0, Math.round(+el.value * 100) || 0);
    syncExtras(); fill(); preview();
    return;
  }
  if (el.dataset.k !== undefined || el.dataset.f || el.dataset.st) preview();
}
// ---- Playbooks: pick a goal; it presets the flow and switches (server: lib/playbooks.js)
let PB = null;
async function drawPlaybooks() {
  PB ??= (await api("/api/playbooks")).playbooks;
  if (!draft.playbook || !PB[draft.playbook]) draft.playbook = "fill_chair";
  draft.levers = { ...PB[draft.playbook].levers, ...(draft.levers || {}) };
  $("#pbgrid").innerHTML = Object.entries(PB).map(([k, p]) => `<button type="button" class="pb${k === draft.playbook ? " on" : ""}" data-pb="${k}">
    <b>${esc(p.name)}</b><span>${esc(p.goal)}</span><span class="muted">${esc(p.for)}</span></button>`).join("");
  const L = draft.levers;
  $("#levers").innerHTML = `<div class="levers">
    <label class="check"><input type="checkbox" data-lv="waitlist_offer" ${L.waitlist_offer ? "checked" : ""} style="width:auto"> When someone cancels or no-shows, offer the spot to people on their way</label>
    <label class="check"><input type="checkbox" data-lv="now_serving" ${L.now_serving ? "checked" : ""} style="width:auto"> "Now serving" screen for the waiting room</label>
    <div class="grid2" style="gap:12px">
      <div><label>Deposit to hold a spot booked remotely ($, 0 = none)</label><input type="number" min="0" step="1" data-lv="deposit" value="${(L.deposit_cents || 0) / 100}"></div>
      <div><label>Invite them back after</label><select data-lv="rebook_weeks">${[0, 1, 2, 3, 4, 6, 8, 12].map((w) => `<option value="${w}"${+L.rebook_weeks === w ? " selected" : ""}>${w ? `${w} week${w > 1 ? "s" : ""}` : "Don't ask"}</option>`).join("")}</select></div>
    </div>
    <label>Add-ons customers can pick when they check in</label>
    <div id="addons">${(L.addons || []).map((a, i) => `<div class="row" style="gap:8px;margin-bottom:6px;flex-wrap:nowrap"><input data-ad="${i}.name" value="${esc(a.name)}" placeholder="Helmet"><input data-ad="${i}.price" type="number" min="0" step="0.01" value="${(a.price_cents / 100).toFixed(2)}" style="max-width:120px"><button type="button" class="x" data-adrm="${i}" aria-label="Remove add-on">&times;</button></div>`).join("")}</div>
    <button type="button" class="btn-alt small" data-adadd style="padding:7px 12px">Add an add-on</button>
  </div>`;
}
function syncExtras() {
  // Mirror the server's generated Extras step so the preview shows add-ons right away.
  draft.steps = draft.steps.filter((st) => st.auto !== "extras");
  const ads = (draft.levers.addons || []).filter((a) => a.name && a.price_cents > 0);
  if (ads.length) draft.steps.push({ title: "Extras", auto: "extras", fields: ads.map((a, i) => ({ id: `addon_${i + 1}`, label: `${a.name} (+$${(a.price_cents / 100).toFixed(2)})`, type: "checkbox", required: false, sensitive: false, price_cents: a.price_cents })) });
}
function onLeverClick(e) {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.pb) {
    // A new goal brings its flow and switch defaults, but keeps the owner's add-ons.
    const addons = draft.levers?.addons || [];
    draft.playbook = b.dataset.pb;
    draft.flow = PB[b.dataset.pb].flow;
    draft.levers = { ...PB[b.dataset.pb].levers, addons };
    $("#flowsel").value = draft.flow;
    drawPlaybooks(); preview();
  }
  if (b.dataset.adadd !== undefined) { draft.levers.addons = [...(draft.levers.addons || []), { name: "", price_cents: 0 }]; drawPlaybooks(); }
  if (b.dataset.adrm !== undefined) { draft.levers.addons.splice(+b.dataset.adrm, 1); syncExtras(); fill(); drawPlaybooks(); preview(); }
}
let pn = 0;
function preview() {
  const host = document.createElement("div");
  $("#preview").replaceChildren(host);
  mountKiosk(host, draft, { mode: "preview", demo: demo.enabled, onSubmit: async () => ({ ticket: `${draft.ticket_prefix}${String(++pn).padStart(3, "0")}`, ahead: 2, wait_minutes: 2 * draft.avg_service_minutes }) });
}

// ---------- Page: one public page with every form and the business's links ----------
async function renderPageEditor() {
  shell("page", `<h1>Your page</h1><p class="muted">One link for your Instagram bio, Google listing and door. It shows all your forms, your links and your live wait.</p><div id="pg"><p class="muted">Loading...</p></div>`);
  const d = await api("/api/biz/page");
  const pr = d.profile;
  const input = (id, label, val, attrs = "") => `<div><label for="${id}">${label}</label><input id="${id}" value="${esc(val || "")}" ${attrs}></div>`;
  $("#pg").innerHTML = `<div class="grid2 pageedit" style="gap:22px;margin-top:16px">
    <form class="panel" id="pgform">
      <h2 style="font-size:24px">About</h2>
      ${input("pg_name", "Business name", d.name, "required")}
      <label for="pg_slug">Page link</label>
      <div class="row" style="gap:6px;flex-wrap:nowrap"><span class="muted small" style="white-space:nowrap">${esc(location.host)}/p/</span><input id="pg_slug" value="${esc(d.slug)}" pattern="[a-z0-9-]{3,40}" required></div>
      ${input("pg_tagline", "Tagline", pr.tagline, 'placeholder="Fades, beard trims and walk-ins since 2015"')}
      <label for="pg_about">About</label><textarea id="pg_about" rows="3">${esc(pr.about)}</textarea>
      <div class="grid2" style="gap:12px">${input("pg_address", "Address", pr.address)}${input("pg_city", "City", pr.city, 'placeholder="Hamilton, ON"')}${input("pg_phone", "Phone", pr.phone, 'type="tel"')}<div><label for="pg_color">Colour</label><input id="pg_color" type="color" value="${esc(pr.brand_color || "#1f4d3a")}" style="height:44px;padding:4px"></div></div>
      <label for="pg_hours">Hours</label><textarea id="pg_hours" rows="2" placeholder="Mon-Fri 9-7, Sat 9-5">${esc(pr.hours)}</textarea>
      <h2 style="font-size:24px;margin-top:22px">Links</h2>
      <div class="grid2" style="gap:12px">${input("ln_instagram", "Instagram", pr.links.instagram, 'placeholder="@yourbusiness"')}${input("ln_tiktok", "TikTok", pr.links.tiktok, 'placeholder="@yourbusiness"')}${input("ln_facebook", "Facebook page link", pr.links.facebook)}${input("ln_google_reviews", "Google reviews link", pr.links.google_reviews, 'placeholder="g.page/r/..."')}${input("ln_website", "Website", pr.links.website)}</div>
      <p class="muted small">Review links are shown to every visitor, whatever they rated.</p>
      <h2 style="font-size:24px;margin-top:22px">Forms on your page</h2>
      <div class="formlist" id="pgforms"></div>
      <div class="row" style="margin-top:18px;gap:10px"><button class="btn-big">Save page</button><span class="k-err small" id="pgerr"></span></div>
    </form>
    <div style="display:grid;gap:22px;align-content:start">
      <div class="panel" id="pglive"></div>
      <div class="panel"><h2 style="font-size:22px">Where to put it</h2><ul style="margin:0;padding-left:18px;line-height:1.7">
        <li>Instagram and TikTok bio link</li><li>Google Business Profile "Website" or "Booking" link</li><li>A printed QR code on the door and counter</li><li>Booking confirmation texts and emails</li></ul></div>
    </div>
  </div>`;

  let forms = d.forms.map((f) => ({ ...f }));
  const drawForms = () => {
    $("#pgforms").innerHTML = forms.map((f, i) => `<div class="formrow" style="${f.listed ? "" : "opacity:.55"}">
      <div style="flex:1;min-width:0"><input data-fl="${i}" value="${esc(f.label)}" placeholder="${esc(f.fallback)}" aria-label="Form name">
        <div class="muted small" style="margin-top:4px">${esc(f.subtitle || "")}</div>
        <label class="check small" style="margin:6px 0 0;font-weight:500"><input type="checkbox" data-fv="${i}" ${f.listed ? "checked" : ""} style="width:auto"> Show on page and in search</label></div>
      <div class="handle"><button type="button" data-up="${i}" aria-label="Move up" ${i ? "" : "disabled"}>&uarr;</button><button type="button" data-dn="${i}" aria-label="Move down" ${i < forms.length - 1 ? "" : "disabled"}>&darr;</button></div>
    </div>`).join("") || '<p class="muted">No forms yet. <a href="#forms/new">Create one</a>.</p>';
  };
  drawForms();
  $("#pgforms").addEventListener("input", (e) => {
    if (e.target.dataset.fl) forms[+e.target.dataset.fl].label = e.target.value;
    if (e.target.dataset.fv) { forms[+e.target.dataset.fv].listed = e.target.checked; drawForms(); }
  });
  $("#pgforms").addEventListener("click", (e) => {
    const up = e.target.dataset.up, dn = e.target.dataset.dn;
    if (up === undefined && dn === undefined) return;
    const i = +(up ?? dn), j = up !== undefined ? i - 1 : i + 1;
    [forms[i], forms[j]] = [forms[j], forms[i]];
    drawForms();
  });
  const drawLive = (slug, published) => {
    const url = demo.enabled ? demoUrl(loc?.id, "page") : `${location.origin}/p/${slug}`;
    $("#pglive").innerHTML = published
      ? `<h2 style="font-size:22px">${demo.enabled ? "Preview your sample page" : "Your page is live"}</h2><p style="word-break:break-all"><a href="${url}" target="_blank" rel="noopener">${esc(url)}</a></p>
         <div class="row" style="gap:8px"><a href="${url}" target="_blank" rel="noopener"><button type="button">Open page</button></a><button type="button" class="btn-alt" id="pgcopy">Copy link</button></div><div id="pgqr" style="margin-top:14px"></div>`
      : `<h2 style="font-size:22px">Not published yet</h2><p class="muted" style="margin:0">Save to publish your page at ${esc(location.host)}/p/${esc(slug)}.</p>`;
    if (published) {
      new window.QRCode($("#pgqr"), { text: url, width: 150, height: 150 });
      $("#pgcopy").onclick = async () => { try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch { toast(url); } };
    }
  };
  drawLive(d.slug, d.published);

  $("#pgform").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#pgerr").textContent = "";
    const v = (id) => $(`#${id}`).value;
    try {
      const r = await api("/api/biz/page", { method: "POST", body: {
        name: v("pg_name"), slug: v("pg_slug").toLowerCase(),
        profile: { tagline: v("pg_tagline"), about: v("pg_about"), address: v("pg_address"), city: v("pg_city"), phone: v("pg_phone"), hours: v("pg_hours"), brand_color: v("pg_color"),
          links: { instagram: v("ln_instagram"), tiktok: v("ln_tiktok"), facebook: v("ln_facebook"), google_reviews: v("ln_google_reviews"), website: v("ln_website") } },
        forms: forms.map((f) => ({ id: f.id, label: f.label, listed: f.listed }))
      } });
      toast("Page saved");
      await loadMe();
      await renderPageEditor();
    } catch (err) { $("#pgerr").textContent = err.message; }
  });
}

// ---------- Insights ----------
function renderInsights() {
  if (!loc) return noLocation("insights");
  return renderInsightsView({ shell, location: loc, api, demo: demo.enabled, setPoll: (timer) => { poll = timer; } });
}

// ---------- People (owner only) ----------
async function renderPeople() {
  shell("people", `<h1>People</h1><p class="muted">Give your team their own logins. Staff see the live front desk; managers can also edit forms and see insights. Every sensitive-data reveal is logged with their name.</p>
    <div class="grid2" style="gap:22px;margin-top:18px">
      <div class="panel"><h2 style="font-size:24px">Team</h2><div id="team"><p class="muted">Loading...</p></div></div>
      <form class="panel" id="addp"><h2 style="font-size:24px">Add someone</h2>
        <label for="pn">Name</label><input id="pn" required>
        <label for="pe">Work email</label><input id="pe" type="email" required>
        <label for="pr">Role</label><select id="pr"><option value="staff">Staff: live front desk</option><option value="manager">Manager: front desk, forms, insights</option></select>
        <button style="margin-top:14px">Create login</button><p class="k-err small" id="perr"></p><div id="pout"></div></form>
    </div>`);
  const load = async () => {
    const { members } = await api("/api/biz/staff");
    $("#team").innerHTML = members.map((m) => `<div class="visit-row"><div><b>${esc(m.name)}</b><div class="muted small">${esc(m.email)} · ${esc(m.role)}</div></div>
      ${m.role === "owner" ? '<span class="pill">owner</span>' : `<button class="ghost" data-rmm="${m.id}">Remove</button>`}</div>`).join("");
    root.querySelectorAll("[data-rmm]").forEach((b) => b.onclick = async () => {
      // Two taps, so nobody is removed by accident.
      if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap to confirm"; b.style.color = "var(--clay)"; return; }
      await api(`/api/biz/staff/${b.dataset.rmm}`, { method: "DELETE" }); toast("Removed. Their sessions ended."); load();
    });
  };
  load();
  $("#addp").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#perr").textContent = "";
    try {
      const r = await api("/api/biz/staff", { method: "POST", body: { name: $("#pn").value, email: $("#pe").value, role: $("#pr").value } });
      $("#pout").innerHTML = `<div class="confirm" style="margin-top:14px"><b>Login created for ${esc(r.email)}</b><p class="small" style="margin:6px 0">One-time password (shown once): <code style="font-size:15px">${esc(r.temp_password)}</code></p><p class="muted small" style="margin:0">Give it to them in person. They should change it in Settings after signing in.</p></div>`;
      e.target.reset(); load();
    } catch (err) { $("#perr").textContent = err.message; }
  });
}

// ---------- Settings ----------
function renderSettings() {
  shell("settings", `<h1>Settings</h1>
    <section class="panel demo-settings" style="margin-top:18px"><div><h2 style="font-size:24px">Demo mode</h2><p class="muted">Explore sample queues, messages, forms, CRM insights, payments and team members. Your real account and customer records stay separate.</p></div>
      <label class="demo-toggle" for="demo-toggle"><span>Use demo data</span><input id="demo-toggle" type="checkbox" role="switch" ${demo.enabled ? "checked" : ""}><span class="demo-switch" aria-hidden="true"></span></label>
      ${demo.enabled ? '<button id="reset-demo" type="button" class="btn-alt">Reset sample data</button>' : ""}</section>
    <div class="grid2" style="gap:22px;margin-top:18px">
      <div class="panel"><h2 style="font-size:24px">Your login</h2><p><strong>${esc(me.member.name)}</strong> · ${esc(me.member.role)}<br><span class="muted">${esc(me.member.email)} · ${esc(me.business.name)}</span></p>
        <form id="pw"><label for="cur">Current password</label><input id="cur" type="password" autocomplete="current-password" required>
          <label for="nxt">New password</label><input id="nxt" type="password" minlength="8" autocomplete="new-password" required>
          <div class="row" style="margin-top:14px;gap:8px"><button>Change password</button><button type="button" class="btn-alt" id="out">Sign out</button></div><p class="k-err small" id="pwerr"></p></form></div>
      <div style="display:grid;gap:22px">
        <div class="panel"><h2 style="font-size:24px">Appearance</h2><div class="seg" id="themes"><button type="button" data-th="warm" class="${theme() === "warm" ? "on" : ""}">Warm</button><button type="button" data-th="blue" class="${theme() === "blue" ? "on" : ""}">Blue</button></div></div>
        <div class="panel"><h2 style="font-size:24px">Payments</h2>
          <p class="muted" style="margin:0">${demo.enabled ? "Sample payments are simulated in this browser. No payment processor is connected to the demo." : me.payments ? "Card payments run through <strong>Stripe test mode</strong>. Customers pay on their phone; no real money moves." : "Stripe isn't connected, so the phone Pay button is a demo. Add a Stripe test key to take test card payments."}</p></div>
        ${me.perms.staff ? `<div class="panel"><h2 style="font-size:24px">Connect your systems</h2>
          <p class="muted">Formify sends every check-in, update, payment and message to your webhook: connect Zapier or Make to reach your booking tool, POS, CRM or a Google Sheet, or point it at your own software. Signed with a secret so you can verify it.</p>
          <form id="whf"><label for="wh">Webhook URL</label><input id="wh" type="url" placeholder="https://hooks.zapier.com/..." autocomplete="off">
            <div class="row" style="gap:8px;margin-top:10px"><button>Save</button><button type="button" class="btn-alt" id="whtest">Send test event</button></div>
            <p class="small" id="whout" style="margin:8px 0 0"></p></form>
          <p class="muted small" style="margin:10px 0 0">Also: CSV export in Insights, and the MCP server below for AI assistants.</p></div>` : ""}
        <div class="panel"><h2 style="font-size:24px">AI assistants can check people in</h2>
          <p class="muted">Customers' own assistants (like Claude) can find you and check them in through Formify's MCP server, with the customer's confirmation.</p>
          ${demo.enabled ? '<p class="muted small">Assistant check-ins are simulated locally in this demo. Exit demo mode to connect an agent to your real business.</p>' : `<pre style="white-space:pre-wrap;background:var(--cream);padding:12px;border-radius:10px;font-size:13px">claude mcp add --transport http formify ${esc(location.origin)}/mcp</pre>`}</div>
      </div>
    </div>`);
  $("#demo-toggle").onchange = (event) => switchDemo(event.target.checked);
  $("#reset-demo")?.addEventListener("click", () => { demo.reset(); location.reload(); });
  $("#out").onclick = async () => { if (demo.enabled) return switchDemo(false); await api("/api/biz/logout", { method: "POST" }); me = null; renderAuth(); };
  if (demo.enabled) {
    $("#cur").disabled = true; $("#nxt").disabled = true;
    $("#pw button:not([type='button'])").disabled = true;
    $("#out").textContent = "Exit demo";
    $("#pwerr").textContent = "Password changes are unavailable in demo mode.";
  }
  if (me.perms.staff) {
    api("/api/biz/integrations").then((x) => { $("#wh").value = x.webhook_url || ""; }).catch(() => {});
    $("#whf").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const r = await api("/api/biz/integrations", { method: "POST", body: { webhook_url: $("#wh").value } });
        $("#whout").innerHTML = r.secret ? `Saved. Signing secret (shown once): <code>${esc(r.secret)}</code>. Verify the <code>x-formify-signature</code> header (HMAC-SHA256 of the body).` : "Webhook removed.";
      } catch (err) { $("#whout").textContent = err.message; }
    });
    $("#whtest").onclick = async () => { try { await api("/api/biz/integrations", { method: "POST", body: { test: true } }); $("#whout").textContent = demo.enabled ? "Demo event simulated. No webhook request was sent." : "Test event sent."; } catch (err) { $("#whout").textContent = err.message; } };
  }
  root.querySelectorAll("[data-th]").forEach((b) => b.onclick = () => { setTheme(b.dataset.th); renderSettings(); });
  $("#pw").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await api("/api/biz/password", { method: "POST", body: { current: $("#cur").value, next: $("#nxt").value } }); toast("Password changed. Other devices were signed out."); e.target.reset(); }
    catch (err) { $("#pwerr").textContent = err.message; }
  });
}

async function boot(next) {
  try { await loadMe(); } catch { return renderAuth(); }
  if (next && location.hash !== `#${next}`) location.hash = next; else route();
}
boot();

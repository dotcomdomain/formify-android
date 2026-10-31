// Formify for customers: Search, Visits, Assistant, You. Hash routes: #search #visits #assistant #you #b/<id> #checkin/<id>[/chat]
import { mountKiosk } from "/render.js";
import { theme, setTheme } from "/js/theme.js";

const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || "Something went wrong."); e.status = r.status; throw e; }
  return data;
}
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.append(t); setTimeout(() => t.remove(), 2600);
}

// ---------- Your info: on this device, or in an account (encrypted) ----------
const PKEYS = [["name", "Name"], ["dob", "Date of birth"], ["health_card", "Health card number"], ["phone", "Phone"], ["email", "Email"]];
const PROFILE_MAP = [[/name/i, "name"], [/birth|dob/i, "dob"], [/health card|ohip/i, "health_card"], [/phone|mobile|cell/i, "phone"], [/email/i, "email"]];
const profileKey = (label) => PROFILE_MAP.find(([re]) => re.test(label))?.[1];
const local = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} }
};
let account = { signedIn: false };

async function loadAccount() {
  try {
    account = await api("/api/me/profile");
    // Mirror to the device so forms can pre-fill; cleared on sign-out.
    local.set("ks_profile", account.profile || {});
  } catch { account = { signedIn: false }; }
}
const profile = () => (account.signedIn ? account.profile || {} : local.get("ks_profile", {}));
async function saveProfile(p) {
  local.set("ks_profile", p);
  if (account.signedIn) { await api("/api/me/profile", { method: "PUT", body: { profile: p } }); account.profile = p; }
}
function rememberVisit(v) {
  if (account.signedIn) { (account.visits ||= []).unshift({ ...v, at: Date.now() }); return; } // the account records it server-side too
  const visits = local.get("ks_visits", []);
  visits.unshift({ ...v, at: Date.now() });
  local.set("ks_visits", visits.slice(0, 20));
}
const prefillFor = (config) => {
  const p = profile(), out = {};
  for (const s of config.steps) for (const f of s.fields) { const k = profileKey(f.label); if (k && p[k]) out[f.id] = p[k]; }
  return out;
};
const track = (id, type) => fetch(`/api/kiosks/${encodeURIComponent(id)}/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type }) }).catch(() => {});

// ---------- Router ----------
function route() {
  const [tab, id, extra] = (location.hash.slice(1) || "search").split("/");
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === (["b", "biz", "checkin"].includes(tab) ? "search" : tab)));
  window.scrollTo({ top: 0 });
  clearInterval(inboxTimer);
  if (tab === "assistant") return renderAssistant();
  if (tab === "visits") return renderVisits();
  if (tab === "you") return renderYou();
  if (tab === "biz" && id) return renderPage(id);
  if (tab === "b" && id) return renderBusiness(id);
  if (tab === "checkin" && id) return renderCheckin(id, extra === "chat");
  return renderSearch();
}
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) location.hash = b.dataset.tab; });
$("#themeBtn").addEventListener("click", () => { setTheme(theme() === "blue" ? "warm" : "blue"); if (location.hash === "#you") renderYou(); });
window.addEventListener("hashchange", route);

// ---------- Search ----------
let query = "", type = "";
function renderSearch() {
  view.innerHTML = `<section class="view">
    <div class="hero">
      <h1>Can't get through?<br><em>Send the form.</em></h1>
      <p>Find a business, fill in its form, and it gets everything it needs, even if nobody picks up the phone.</p>
    </div>
    <form class="searchbar" id="sform" role="search">
      <input id="q" placeholder="Try ski, haircut, walk-in clinic..." value="${esc(query)}" autocomplete="off" aria-label="Search businesses">
      <button>Search</button>
    </form>
    <div class="chiprow" id="types">
      ${[["", "Everything"], ["clinic", "Clinics"], ["barber", "Barbers"], ["ski", "Ski"], ["restaurant", "Restaurants"], ["airport", "Travel"]]
        .map(([t, l]) => `<button type="button" data-t="${t}" class="${t === type ? "on" : ""}">${l}</button>`).join("")}
    </div>
    <div class="cards" id="results"></div>
  </section>`;
  let timer;
  $("#q").addEventListener("input", (e) => { query = e.target.value; clearTimeout(timer); timer = setTimeout(loadResults, 200); });
  $("#sform").addEventListener("submit", (e) => { e.preventDefault(); loadResults(); });
  $("#types").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (!b) return; type = b.dataset.t; document.querySelectorAll("#types button").forEach((x) => x.classList.toggle("on", x === b)); loadResults(); });
  loadResults();
}
async function loadResults() {
  const box = $("#results");
  if (!box) return;
  const { businesses } = await api(`/api/directory?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`);
  // Group forms by the business that owns them, keeping search order (most used first).
  const groups = [];
  const byKey = new Map();
  for (const f of businesses) {
    const key = f.page_slug || f.id;
    if (!byKey.has(key)) { const g = { key, slug: f.page_slug, name: f.page_slug ? f.page_name : f.name, lead: f, forms: [] }; byKey.set(key, g); groups.push(g); }
    byKey.get(key).forms.push(f);
  }
  if (!groups.length) { box.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>Nothing here yet</b>Try another word, or ask the <a href="#assistant">assistant</a>.</div>`; return; }
  box.innerHTML = groups.map((g, i) => {
    const b = g.lead;
    const rated = g.forms.filter((f) => f.ease.count);
    const n = rated.reduce((s, f) => s + f.ease.count, 0);
    const avg = n ? rated.reduce((s, f) => s + f.ease.avg * f.ease.count, 0) / n : null;
    const waiting = g.forms.reduce((s, f) => s + (f.waiting || 0), 0);
    const month = g.forms.reduce((s, f) => s + (f.checkins_month || 0), 0);
    return `<a class="bcard" href="${g.slug ? `#biz/${g.slug}` : `#b/${b.id}`}" style="--b:${esc(b.brand_color)};animation-delay:${i * 60}ms">
      ${i === 0 && month ? '<span class="badge" style="align-self:flex-start;margin-bottom:6px">Most used</span>' : ""}
      <h3>${esc(g.name)}</h3>
      <div class="meta">${esc(b.business_type)}${b.city ? ` · ${esc(b.city)}` : ""}${g.forms.length > 1 ? ` · <span style="text-transform:none">${g.forms.length} forms</span>` : ""}</div>
      <div class="foot">
        <div class="score">${avg ? `<b>${avg.toFixed(1)}</b><span>Ease · ${n}</span>` : '<span>New on Formify</span>'}</div>
        <span class="waitpill">${waiting ? `${waiting} waiting` : "No wait"}</span>
      </div>
      ${month ? `<div class="meta" style="text-transform:none;font-size:13px">${month} check-ins this month</div>` : ""}
    </a>`;
  }).join("");
}

// ---------- Business page: profile, socials, every form ----------
const ICON = {
  instagram: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M14 3h3a4 4 0 0 0 4 4v3a7 7 0 0 1-4-1.3V15a6 6 0 1 1-6-6v3.2a2.8 2.8 0 1 0 3 2.8z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v7h4v-7h3l1-4h-4V8.5a.5.5 0 0 1 .5-.5z"/></svg>',
  google_reviews: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z"/></svg>',
  website: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>'
};
const LINK_LABEL = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", google_reviews: "Google reviews", website: "Website" };

async function renderPage(slug) {
  view.innerHTML = `<section class="view"><p class="muted">Loading...</p></section>`;
  let p;
  try { p = await api(`/api/page/${encodeURIComponent(slug)}`); } catch { view.innerHTML = `<div class="empty"><b>Page not found</b><a href="#search">Back to search</a></div>`; return; }
  const pr = p.profile;
  p.forms.forEach((f) => track(f.id, "view"));
  const links = Object.entries(pr.links).filter(([, u]) => u)
    .map(([k, u]) => `<a class="soc" href="${esc(u)}" target="_blank" rel="noopener">${ICON[k]}<span>${LINK_LABEL[k]}</span></a>`).join("");
  const waiting = p.forms.reduce((s, f) => s + f.waiting, 0);
  view.innerHTML = `<section class="view" style="max-width:860px;margin:0 auto">
    <button class="back" onclick="history.back()">&larr; Back</button>
    <article class="sheet" style="--b:${esc(pr.brand_color)}">
      <div class="sheet-head" style="padding-bottom:26px">
        <div class="meta">${esc(p.business_type)}${pr.city ? ` · ${esc(pr.city)}` : ""}</div>
        <h2>${esc(p.name)}</h2>
        ${pr.tagline ? `<div style="font-size:18px;opacity:.92">${esc(pr.tagline)}</div>` : ""}
        ${links ? `<div class="socrow">${links}</div>` : ""}
      </div>
      <div class="sheet-body">
        <div class="statrow">
          <div><div class="v">${p.ease.avg ? p.ease.avg.toFixed(1) : "–"}</div><div class="l">Ease Score${p.ease.count ? ` · ${p.ease.count} ratings` : ""}</div></div>
          <div><div class="v">${waiting}</div><div class="l">waiting now</div></div>
          <div><div class="v">${p.forms.length}</div><div class="l">form${p.forms.length === 1 ? "" : "s"} you can fill ahead</div></div>
        </div>
        ${pr.about ? `<p style="font-size:16.5px;max-width:620px">${esc(pr.about)}</p>` : ""}
        <div class="pageinfo">
          ${pr.address ? `<div><span class="muted small">Address</span><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pr.address)}" target="_blank" rel="noopener">${esc(pr.address)}</a></div>` : ""}
          ${pr.hours ? `<div><span class="muted small">Hours</span><span style="white-space:pre-line">${esc(pr.hours)}</span></div>` : ""}
          ${pr.phone ? `<div><span class="muted small">Phone</span><a href="tel:${esc(pr.phone.replace(/[^0-9+]/g, ""))}">${esc(pr.phone)}</a></div>` : ""}
        </div>
        <h3 style="font-family:var(--serif);font-weight:400;font-size:26px;margin:26px 0 12px">Fill in before you arrive</h3>
        <div class="formlist">${p.forms.map((f, i) => `
          <div class="formrow" style="--b:${esc(f.brand_color)};animation-delay:${i * 60}ms">
            <div><b>${esc(f.label)}</b><div class="muted small">${esc(f.subtitle || "")}</div>
              <div class="small" style="margin-top:6px">${f.waiting ? `<span class="waitpill">${f.waiting} waiting · ~${f.wait_minutes} min</span>` : '<span class="waitpill">No wait</span>'}${f.ease.avg ? ` <span class="muted">Ease ${f.ease.avg.toFixed(1)}</span>` : ""}</div></div>
            <div class="formacts"><a href="#checkin/${f.id}/chat"><button>With the assistant</button></a><a href="#checkin/${f.id}"><button class="btn-alt">Fill it myself</button></a></div>
          </div>`).join("") || '<p class="muted">No forms are open right now.</p>'}</div>
      </div>
    </article>
  </section>`;
}

// ---------- Business page ----------
async function renderBusiness(id) {
  view.innerHTML = `<section class="view"><p class="muted">Loading...</p></section>`;
  let data;
  try { data = await api(`/api/kiosks/${encodeURIComponent(id)}`); } catch { view.innerHTML = `<div class="empty"><b>Not found</b><a href="#search">Back to search</a></div>`; return; }
  const b = data.business;
  track(id, "view");
  const links = [[b.google_reviews, "Google reviews"], [b.instagram, "Instagram"], [b.website, "Website"]].filter(([u]) => u)
    .map(([u, l]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${l}</a>`).join("");
  const saved = Object.keys(prefillFor(data.config)).length;
  view.innerHTML = `<section class="view" style="max-width:760px;margin:0 auto">
    <button class="back" onclick="history.back()">&larr; Back</button>
    <article class="sheet" style="--b:${esc(b.brand_color)}">
      <div class="sheet-head"><div class="meta">${esc(b.business_type)}${b.city ? ` · ${esc(b.city)}` : ""}</div><h2>${esc(b.name)}</h2><div style="opacity:.9">${esc(b.welcome_subtitle)}</div></div>
      <div class="sheet-body">
        <div class="statrow">
          <div><div class="v">${b.ease.avg ? b.ease.avg.toFixed(1) : "–"}</div><div class="l">Ease Score${b.ease.count ? ` · ${b.ease.count} ratings` : ""}</div></div>
          <div><div class="v">${b.waiting || 0}</div><div class="l">waiting now</div></div>
          <div><div class="v">~${(b.waiting || 0) * b.wait_minutes_per_visitor}</div><div class="l">minutes wait</div></div>
        </div>
        <div class="cta">
          <a href="#checkin/${b.id}/chat"><button class="btn-big" style="width:100%">Check in with the assistant</button></a>
          <a href="#checkin/${b.id}"><button class="btn-big btn-alt" style="width:100%">Fill the form myself</button></a>
        </div>
        <p class="muted small" style="margin:12px 0 0">${saved ? `${saved} detail${saved > 1 ? "s" : ""} from <a href="#you">your info</a> will be filled in for you. ` : ""}Ease Score is how easy visitors found checking in here.</p>
        ${links ? `<div class="linkbtns">${links}</div>` : ""}
        ${b.page_slug ? `<p style="margin:16px 0 0"><a href="#biz/${esc(b.page_slug)}">See everything from ${esc(b.page_name || b.name)} &rarr;</a></p>` : ""}
      </div>
    </article>
  </section>`;
}

// ---------- Check-in (the business's own form, with its in-form assistant) ----------
async function renderCheckin(id, chat) {
  let data;
  try { data = await api(`/api/kiosks/${encodeURIComponent(id)}`); } catch { location.hash = "search"; return; }
  const { config } = data;
  track(id, "start");
  view.innerHTML = `<section class="view" style="max-width:760px;margin:0 auto">
    <button class="back" onclick="history.back()">&larr; Back</button>
    <article class="sheet" style="--b:${esc(config.brand_color)}">
      <div class="sheet-head" style="padding-bottom:18px"><div class="meta">Checking in</div><h2 style="font-size:34px">${esc(config.name)}</h2></div>
      <div class="sheet-body"><div id="kiosk"></div></div>
    </article>
  </section>`;
  mountKiosk($("#kiosk"), config, {
    mode: "phone", kioskId: id, startAt: "consent", preferChat: chat,
    onSubmit: (body) => api(`/api/kiosks/${encodeURIComponent(id)}/checkins`, { method: "POST", body }),
    onDone: (r) => { rememberVisit({ token: r.token, ticket: r.ticket, name: config.name }); location.href = `/visit.html#${r.token}`; }
  });
}

// ---------- Assistant: find the place, then fill its form ----------
const A = { phase: "find", log: [], cMsgs: [], shown: [], biz: null, config: null, aMsgs: [], answers: {}, language: "en", busy: false };
const greet = () => A.log.length || A.log.push({ who: "bot", text: "Hi! Tell me what you need, like \"a haircut this afternoon\" or \"ski rentals for Saturday\", and I'll find the place and fill in their check-in for you." });

function renderAssistant() {
  greet();
  view.innerHTML = `<section class="view assist">
    <div class="chatcard">
      <div class="chatlog" id="log" aria-live="polite"></div>
      <div class="slotbar" id="slots"></div>
      <form class="composer" id="compose">
        <button type="button" class="mic" id="mic">Talk</button>
        <input id="say" placeholder="What do you need?" autocomplete="off" aria-label="Message">
        <button>Send</button>
      </form>
    </div>
    <aside class="side">
      <h3>Your check-in, handled.</h3>
      <ul>
        <li>Finds the business that fits, most used first.</li>
        <li>Fills their form with what you say and <a href="#you" style="color:var(--sun)">your saved info</a>.</li>
        <li>Shows you everything before anything is sent. You confirm, it checks you in.</li>
      </ul>
      <div class="try" style="margin-top:14px">${["I need a haircut today", "Ski rental for this weekend", "Walk-in clinic, sore throat"].map((t) => `<button type="button" data-try="${esc(t)}">${esc(t)}</button>`).join("")}</div>
      ${A.biz ? `<button type="button" id="restart" style="margin-top:16px;background:transparent;border:1px solid rgba(255,255,255,.4)">Start over</button>` : ""}
    </aside>
  </section>`;
  drawLog();
  $("#compose").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#say").value.trim(); if (v) { $("#say").value = ""; send(v); } });
  $("#mic").addEventListener("click", toggleMic);
  view.querySelectorAll("[data-try]").forEach((b) => b.onclick = () => send(b.dataset.try));
  $("#restart")?.addEventListener("click", () => { Object.assign(A, { phase: "find", log: [], cMsgs: [], shown: [], biz: null, config: null, aMsgs: [], answers: {} }); renderAssistant(); });
}

function drawLog() {
  const log = $("#log");
  if (!log) return;
  log.innerHTML = A.log.map((m, i) => {
    if (m.who === "pick") return `<div class="pick">${m.items.map((b) => `<button type="button" data-pick="${b.id}" style="--b:${esc(b.brand_color)}"><b>${esc(b.name)}</b><span>${b.ease.avg ? `Ease ${b.ease.avg.toFixed(1)} · ` : ""}${b.waiting ? `${b.waiting} waiting` : "no wait"}${b.city ? ` · ${esc(b.city)}` : ""}</span></button>`).join("")}</div>`;
    if (m.who === "confirm") return confirmCard(i === A.log.length - 1);
    if (m.who === "ticket") return `<div class="ticketcard"><div class="small" style="opacity:.8">You're checked in at ${esc(m.name)}</div><div class="t">${esc(m.ticket)}</div>
      <div>Arrival code <b style="font-size:22px;letter-spacing:.2em">${esc(m.code)}</b> · type it at the kiosk or tap "I'm here" when you arrive.</div>
      <div style="margin-top:10px"><a href="/visit.html#${esc(m.token)}">Live status and place in line &rarr;</a></div>
      ${m.canSave ? `<button type="button" id="saveInfo" style="margin-top:12px;background:#fff;color:var(--forest)">Save my details for next time</button>` : ""}</div>`;
    return `<div class="msg ${m.who === "me" ? "me" : "bot"}">${esc(m.text)}</div>`;
  }).join("") + (A.busy ? '<div class="msg bot typing"><i></i><i></i><i></i></div>' : "");
  log.scrollTop = log.scrollHeight;
  log.querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => choose(b.dataset.pick));
  $("#confirmBtn")?.addEventListener("click", submitAssistant);
  $("#editBtn")?.addEventListener("click", () => { location.hash = `checkin/${A.biz}`; });
  $("#saveInfo")?.addEventListener("click", async () => {
    const p = { ...profile() };
    for (const s of A.config.steps) for (const f of s.fields) { const k = profileKey(f.label); if (k && A.answers[f.id]) p[k] = String(A.answers[f.id]); }
    await saveProfile(p); toast("Saved to your info"); A.log.at(-1).canSave = false; drawLog();
  });
  const slots = $("#slots");
  if (slots) slots.innerHTML = A.phase === "fill" && A.config ? A.config.steps.flatMap((s) => s.fields).map((f) => {
    const v = A.answers[f.id], has = v !== undefined && v !== "" && v !== false;
    return `<span class="slot${has ? " ok" : ""}${f.required && !has ? " need" : ""}">${esc(f.label)}</span>`;
  }).join("") : "";
}

function confirmCard(live) {
  const fields = A.config.steps.flatMap((s) => s.fields);
  const rows = fields.filter((f) => A.answers[f.id] !== undefined && A.answers[f.id] !== "").map((f) => `<dt>${esc(f.label)}</dt><dd>${A.answers[f.id] === true ? "Yes" : A.answers[f.id] === false ? "No" : esc(A.answers[f.id])}</dd>`).join("");
  return `<div class="confirm"><div style="font-family:var(--serif);font-size:22px">Ready to check in at ${esc(A.config.name)}?</div>
    <dl>${rows}</dl><p class="muted small" style="margin:0 0 12px">${esc(A.config.consent_text)}</p>
    ${live ? `<div class="row" style="gap:8px"><button type="button" id="confirmBtn">I agree, check me in</button><button type="button" id="editBtn" class="btn-alt">Edit in the form</button></div>` : ""}</div>`;
}

async function send(text) {
  if (A.busy) return;
  A.log.push({ who: "me", text });
  A.busy = true; drawLog();
  try {
    if (A.phase === "find") {
      A.cMsgs.push({ role: "user", content: text });
      const r = await api("/api/concierge", { method: "POST", body: { messages: A.cMsgs, shown: A.shown.map((b) => ({ id: b.id, name: b.name, business_type: b.business_type })) } });
      A.cMsgs.push({ role: "assistant", content: r.reply });
      A.log.push({ who: "bot", text: r.reply });
      if (r.results?.length) { A.shown = r.results; A.log.push({ who: "pick", items: r.results }); }
      if (r.picked) { A.busy = false; return choose(r.picked); }
    } else if (A.phase === "fill") {
      await agentTurn(text);
    } else {
      A.log.push({ who: "bot", text: "You're all set here. Tap Start over to check in somewhere else." });
    }
  } catch (e) { A.log.push({ who: "bot", text: e.message }); }
  A.busy = false; drawLog();
}

async function choose(id) {
  A.busy = true; drawLog();
  try {
    const { config } = await api(`/api/kiosks/${encodeURIComponent(id)}`);
    Object.assign(A, { phase: "fill", biz: id, config, answers: prefillFor(config), aMsgs: [] });
    track(id, "start");
    const n = Object.keys(A.answers).length;
    await agentTurn(`I'd like to check in at ${config.name}.${n ? ` (Filled ${n} detail${n > 1 ? "s" : ""} from my saved info.)` : ""}`, { silent: true });
  } catch (e) { A.log.push({ who: "bot", text: e.message }); }
  A.busy = false; drawLog();
  if (!$("#restart")) renderAssistant();
}

async function agentTurn(text, { silent = false } = {}) {
  A.aMsgs.push({ role: "user", content: text });
  const r = await api("/api/agent", { method: "POST", body: { id: A.biz, messages: A.aMsgs, answers: A.answers, language: A.language } });
  Object.assign(A.answers, r.answers || {});
  A.aMsgs.push({ role: "assistant", content: r.reply });
  A.log.push({ who: "bot", text: r.reply });
  if (!silent && A.lastVoice) speak(r.reply);
  if (r.urgent) api(`/api/kiosks/${encodeURIComponent(A.biz)}/alerts`, { method: "POST", body: { kind: "emergency", message: text.slice(0, 300) } }).catch(() => {});
  if (r.ready) { A.phase = "confirm"; A.log.push({ who: "confirm" }); }
}

async function submitAssistant() {
  A.busy = true; drawLog();
  try {
    const r = await api(`/api/kiosks/${encodeURIComponent(A.biz)}/checkins`, { method: "POST", body: { answers: A.answers, consent: true, channel: "phone", language: A.language, via: ["assistant"] } });
    rememberVisit({ token: r.token, ticket: r.ticket, name: A.config.name });
    A.phase = "done";
    const unsaved = A.config.steps.flatMap((s) => s.fields).some((f) => { const k = profileKey(f.label); return k && A.answers[f.id] && profile()[k] !== String(A.answers[f.id]); });
    A.log.push({ who: "ticket", ticket: r.ticket, code: r.code, token: r.token, name: A.config.name, canSave: unsaved });
  } catch (e) {
    A.phase = "fill";
    A.log.push({ who: "bot", text: `${e.message} Tell me and I'll fix it.` });
  }
  A.busy = false; drawLog();
}

// Voice for the assistant: record, transcribe (any language), send.
let rec, recTimer, caption, heard = "";
// Live captions while talking, where the browser offers speech recognition. Whisper still writes the final text.
function startCaption() {
  heard = "";
  const Recognizer = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognizer) return;
  caption = new Recognizer();
  caption.continuous = true;
  caption.interimResults = true;
  caption.lang = navigator.language || "en-US";
  caption.onresult = (e) => {
    heard = [...e.results].map((x) => x[0].transcript).join(" ").replace(/\s+/g, " ").trim();
    const input = $("#say");
    if (input) { input.value = heard; input.scrollLeft = input.scrollWidth; }
  };
  caption.onerror = () => {};
  try { caption.start(); } catch { caption = null; }
}
async function toggleMic() {
  const btn = $("#mic");
  if (rec?.state === "recording") { clearTimeout(recTimer); rec.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      caption?.abort();
      caption = null;
      btn.classList.remove("rec"); btn.textContent = "Talk";
      const input = $("#say");
      if (input) input.value = "";
      const blob = new Blob(chunks, { type: rec.mimeType });
      const audio = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
      let r = {};
      try { r = await api("/api/stt", { method: "POST", body: { audio } }); } catch (e) { if (!heard) toast(e.message); }
      const text = r.text || heard;
      if (text) { A.language = r.language || A.language; A.lastVoice = true; send(text); } else if (r.text === "") toast("Didn't catch that. Try again.");
    };
    rec.start(); btn.classList.add("rec"); btn.textContent = "Stop";
    startCaption();
    recTimer = setTimeout(() => rec.state === "recording" && rec.stop(), 20000);
  } catch { toast("Microphone not available. You can type instead."); }
}
async function speak(text) {
  try {
    if (A.language !== "en") { const u = new SpeechSynthesisUtterance(text); u.lang = A.language; speechSynthesis.speak(u); return; }
    const r = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    if (r.ok) new Audio(URL.createObjectURL(await r.blob())).play();
  } catch {}
}

// ---------- Visits: one inbox for every business ----------
let inboxTimer;
const STATUS_LABEL = { pending: "Checked in · not arrived", waiting: "In line", serving: "Your turn", ready: "Ready for pickup", payment: "Payment due", done: "Done", "no-show": "Closed" };
const visitTokens = () => (account.signedIn ? (account.visits || []).map((v) => v.token) : local.get("ks_visits", []).map((v) => v.token)).filter(Boolean);
async function fetchVisits() {
  const tokens = visitTokens();
  if (!tokens.length) return [];
  try { return (await api("/api/visits", { method: "POST", body: { tokens } })).visits; } catch { return []; }
}
async function refreshUnread() {
  const visits = await fetchVisits();
  const n = visits.reduce((s, v) => s + (v.unread || 0), 0);
  const dot = $("#unreadDot");
  if (dot) { dot.hidden = !n; dot.textContent = n > 9 ? "9+" : String(n); }
  return visits;
}
async function renderVisits() {
  view.innerHTML = `<section class="view">
    <div class="hero" style="margin-bottom:18px"><h1 style="font-size:clamp(36px,5vw,58px)">Every business, <em>one inbox.</em></h1>
      <p>Your place in line, messages, receipts and follow-ups from every business you've checked in with.</p></div>
    <div id="inbox" class="formlist"><p class="muted">Loading...</p></div>
  </section>`;
  const draw = async () => {
    const visits = await refreshUnread();
    const box = $("#inbox");
    if (!box) return clearInterval(inboxTimer);
    box.innerHTML = visits.length ? visits.map((v, i) => {
      const when = new Date(v.last?.at || v.at);
      const live = ["pending", "waiting", "serving", "ready", "payment"].includes(v.status);
      return `<a class="formrow" href="/visit.html#${esc(v.token)}" style="--b:${esc(v.brand_color)};text-decoration:none;color:inherit;animation-delay:${i * 40}ms">
        <div style="min-width:0;flex:1"><div class="row" style="gap:8px"><b>${esc(v.name)}</b>${v.unread ? `<span class="badge" style="background:var(--clay);color:#fff">${v.unread} new</span>` : ""}</div>
          <div class="muted small">${esc(v.form || "Check-in")} · ticket ${esc(v.ticket)} · ${when.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</div>
          ${v.last ? `<div class="small" style="margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.last.sender === "customer" ? "You: " : ""}${esc(v.last.body)}</div>` : ""}</div>
        <span class="waitpill" style="flex:none;${live ? "" : "background:var(--sand);color:var(--muted)"}">${esc(STATUS_LABEL[v.status] || v.status)}${v.paid ? " · paid" : ""}</span></a>`;
    }).join("") : `<div class="empty panel"><b>No visits yet</b>Check in somewhere and it shows up here: your place in line, messages and receipts. <div style="margin-top:14px"><a href="#search">Find a business</a> or ask the <a href="#assistant">assistant</a></div></div>`;
  };
  await draw();
  inboxTimer = setInterval(draw, 6000);
}

// ---------- You ----------
let authMode = "signup";
function renderYou() {
  const p = profile();
  const visits = account.signedIn ? account.visits || [] : local.get("ks_visits", []);
  view.innerHTML = `<section class="view">
    <div class="hero" style="margin-bottom:18px"><h1 style="font-size:clamp(36px,5vw,58px)">Type it <em>once.</em></h1>
      <p>Your details fill every Formify form for you. Businesses only get the fields their form asks for, and only when you check in.</p></div>
    <div class="you">
      <div class="panel">
        <div class="row" style="justify-content:space-between;margin-bottom:6px"><h2 style="margin:0">Your info</h2>
          <span class="lock">${account.signedIn ? `Encrypted in your account · ${esc(account.email)}` : "Saved on this device only"}</span></div>
        <form id="pform">
          <div class="row2">${PKEYS.map(([k, l]) => `<div><label for="p_${k}">${l}</label><input id="p_${k}" name="${k}" ${k === "dob" ? 'type="date"' : k === "email" ? 'type="email"' : k === "phone" ? 'type="tel"' : ""} value="${esc(p[k] || "")}"></div>`).join("")}</div>
          <div class="row" style="margin-top:18px;justify-content:space-between"><button>Save</button>
            <button type="button" class="ghost" id="wipe">${account.signedIn ? "Delete my account" : "Delete from this device"}</button></div>
        </form>
      </div>
      <div style="display:grid;gap:22px">
        <div class="panel">${account.signedIn ? `<h2>Signed in</h2><p class="muted">Your info and check-ins follow you to any device.</p><button type="button" class="btn-alt" id="signout">Sign out</button>` : `
          <h2>Use it on every device</h2><p class="muted">Optional. Create an account and your info syncs, encrypted. Without one, it stays on this device.</p>
          <div class="seg"><button type="button" data-mode="signup" class="${authMode === "signup" ? "on" : ""}">Create account</button><button type="button" data-mode="login" class="${authMode === "login" ? "on" : ""}">Sign in</button></div>
          <form id="aform"><label for="a_email">Email</label><input id="a_email" type="email" autocomplete="email" required>
            <label for="a_pass">Password</label><input id="a_pass" type="password" autocomplete="${authMode === "signup" ? "new-password" : "current-password"}" minlength="8" required>
            <button style="margin-top:14px;width:100%">${authMode === "signup" ? "Create account and sync" : "Sign in"}</button><p class="k-err small" id="aerr"></p></form>`}</div>
        <div class="panel"><h2>Your data, your call</h2>
          <p class="muted" style="margin:0 0 10px">Each business only gets the fields its form asks for, and only when you check in. Open any visit in <a href="#visits">Visits</a> to see exactly what that business has, when it's deleted, download it, or ask them to delete it.</p>
          <p class="small" style="margin:0"><strong>${visits.length}</strong> business visit${visits.length === 1 ? "" : "s"} hold your info right now. Formify never sells it.</p></div>
        <div class="panel"><h2>Appearance</h2><div class="seg" style="margin:0"><button type="button" data-th="warm" class="${theme() === "warm" ? "on" : ""}">Warm</button><button type="button" data-th="blue" class="${theme() === "blue" ? "on" : ""}">Blue</button></div></div>
        <div class="panel"><h2>Recent check-ins</h2>
          ${visits.length ? visits.map((v) => `<div class="visit-row"><div><b>${esc(v.name)}</b><div class="muted small">Ticket ${esc(v.ticket)} · ${new Date(v.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</div></div><a href="/visit.html#${esc(v.token)}" class="small">Status</a></div>`).join("")
            : '<p class="muted" style="margin:0">Nothing yet. <a href="#search">Find a business</a> or ask the <a href="#assistant">assistant</a>.</p>'}</div>
      </div>
    </div>
  </section>`;

  $("#pform").addEventListener("submit", async (e) => {
    e.preventDefault();
    const next = {};
    for (const [k] of PKEYS) { const v = $(`#p_${k}`).value.trim(); if (v) next[k] = v; }
    try { await saveProfile(next); toast(account.signedIn ? "Saved to your account" : "Saved on this device"); } catch (err) { toast(err.message); }
  });
  let armed = false;
  $("#wipe").addEventListener("click", async (e) => {
    // Two taps to delete, so it can't happen by accident.
    if (!armed) { armed = true; e.target.textContent = "Tap again to confirm"; e.target.style.color = "var(--clay)"; setTimeout(() => { armed = false; renderYou(); }, 4000); return; }
    if (account.signedIn) { await api("/api/me/account", { method: "DELETE" }); account = { signedIn: false }; }
    local.del("ks_profile"); local.del("ks_visits");
    toast("Deleted"); renderYou();
  });
  $("#signout")?.addEventListener("click", async () => { await api("/api/me/logout", { method: "POST" }); account = { signedIn: false }; local.del("ks_profile"); toast("Signed out. Info removed from this device."); renderYou(); });
  view.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => { authMode = b.dataset.mode; renderYou(); });
  view.querySelectorAll("[data-th]").forEach((b) => b.onclick = () => { setTheme(b.dataset.th); renderYou(); });
  $("#aform")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { email: $("#a_email").value, password: $("#a_pass").value, profile: local.get("ks_profile", {}) };
    try {
      await api(`/api/me/${authMode}`, { method: "POST", body });
      await loadAccount();
      toast(authMode === "signup" ? "Account created. Your info is synced." : "Signed in");
      renderYou();
    } catch (err) { $("#aerr").textContent = err.message; }
  });
}

await loadAccount();
route();
refreshUnread();
setInterval(refreshUnread, 20000);

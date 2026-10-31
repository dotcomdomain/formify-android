const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
const count = (n) => Number(n || 0).toLocaleString();
const pct = (n, total) => total ? `${Math.round(n / total * 100)}%` : "—";
const date = (at) => new Date(at).toLocaleString();
let selectedDays = 30;

const card = (value, label, detail = "") => `<div class="kpi"><div class="v">${esc(value)}</div><div class="l">${esc(label)}</div>${detail ? `<p class="muted small" style="margin:8px 0 0">${esc(detail)}</p>` : ""}</div>`;
function comparison(current, previous, label, days) {
  if (!previous) return "Previous period unavailable within retained history.";
  const delta = current - previous[label];
  return `${delta > 0 ? "+" : ""}${count(delta)} versus the previous ${days} days.`;
}
function reasons(row) {
  return [row.delete_status === "requested" && "Deletion request", row.unread > 0 && `${row.unread} unread message(s)`, row.score && row.score <= 2 && `Ease ${row.score}/5`, row.status === "payment" && !row.paid_at && `${money(row.amount_cents)} awaiting payment`, row.status === "ready" && "Ready for pickup"].filter(Boolean).join(" · ");
}
const table = (head, body) => `<div class="insight-table"><table><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;

function draw(d) {
  const s = d.summary, c = d.customers, r = d.ratings, w = d.window;
  const peak = d.hours.reduce((a, h) => h.visits > a.visits ? h : a, { hour: 0, visits: 0 });
  const dailyMax = Math.max(1, ...d.daily.map((x) => x.visits));
  const hourMax = Math.max(1, ...d.hours.map((x) => x.visits));
  const rangeNote = w.clipped ? "This period is limited by your retention setting or the date this form was created." : "";
  return `<div class="insight-coverage"><strong>${esc(new Date(w.from).toISOString().slice(0, 10))} to ${esc(new Date(w.to).toISOString().slice(0, 10))} · UTC</strong>
      <p class="muted small" style="margin:4px 0 0">${esc(rangeNote)} Visit data older than ${w.retention_days} days is excluded. Charts use UTC; this window includes partial days.</p></div>
    ${!s.visits ? '<div class="panel insight-empty"><h2>No visits in this period</h2><p class="muted">Share your form link or run your kiosk. Visits, feedback and follow-up work will appear here as customers use it.</p><a href="#forms">View your forms</a></div>' : ""}
    <div class="kpis insight-kpis">
      ${card(count(s.visits), "Visits", comparison(s.visits, d.previous, "visits", w.requested_days))}
      ${card(count(s.completed), "Completed visits", `${pct(s.completed, s.visits)} of visits in this period. Active: ${count(s.active)}.`)}
      ${card(count(c.identified_customers), "Signed-in customers", `${count(c.repeat_customers)} had multiple visits within retained history.`)}
      ${card(s.wait_ms === null ? "—" : `${Math.round(s.wait_ms / 60000)} min`, "Average recorded wait", `${count(s.wait_samples)} visits with arrival and service timestamps.`)}
    </div>
    <section class="panel" aria-label="Recommended actions"><div class="row" style="justify-content:space-between"><h2>Focus for your team</h2><a class="biz-link" href="#live">Open Live</a></div>
      <div class="insight-actions">${d.recommendations.length ? d.recommendations.map((x) => `<article><h3>${esc(x.title)}</h3><p>${esc(x.detail)}</p>${x.action === "Open Live" ? '<a href="#live">Open Live →</a>' : x.action === "See feedback" ? '<button type="button" class="btn-alt small" data-insight-feedback>See feedback</button>' : ""}</article>`).join("") : '<p class="muted">No follow-up flags in this period. Keep an eye on new messages, feedback and pickups.</p>'}</div>
    </section>
    <div class="grid2 insight-grid">
      <section class="panel"><h2>Visit trend</h2><p class="muted small">Daily check-ins, including visits still in progress.</p>
        <div class="insight-chart" role="img" aria-label="Daily visit counts. Exact values are in the table below.">${d.daily.map((x) => `<div title="${esc(x.day)}: ${x.visits} visits" style="height:${x.visits / dailyMax * 100}%"></div>`).join("")}</div>
        <div class="row muted small" style="justify-content:space-between"><span>${esc(d.daily[0]?.day || "")}</span><span>${esc(d.daily.at(-1)?.day || "")}</span></div>
        <details><summary>See daily counts</summary>${table(["Date (UTC)", "Visits", "Completed"], d.daily.map((x) => `<tr><th scope="row">${esc(x.day)}</th><td>${count(x.visits)}</td><td>${count(x.completed)}</td></tr>`).join(""))}</details>
      </section>
      <section class="panel"><h2>When visitors arrive</h2><p class="muted small">${peak.visits ? `Busiest hour: ${String(peak.hour).padStart(2, "0")}:00 UTC, ${count(peak.visits)} visits.` : "No arrivals recorded yet."}</p>
        <div class="insight-chart" role="img" aria-label="Visits by hour in UTC. Exact values are in the table below.">${d.hours.map((h) => `<div title="${String(h.hour).padStart(2, "0")}:00 UTC: ${h.visits} visits" style="height:${h.visits / hourMax * 100}%"></div>`).join("")}</div>
        <div class="row muted small" style="justify-content:space-between"><span>00:00</span><span>12:00</span><span>23:00 UTC</span></div>
        <details><summary>See hourly counts</summary>${table(["Hour (UTC)", "Visits"], d.hours.map((h) => `<tr><th scope="row">${String(h.hour).padStart(2, "0")}:00</th><td>${count(h.visits)}</td></tr>`).join(""))}</details>
      </section>
      <section class="panel"><h2>Customer relationships</h2>
        <div class="insight-stat"><span>Repeat signed-in customers</span><strong>${count(c.repeat_customers)} <small>(${pct(c.repeat_customers, c.identified_customers)})</small></strong></div>
        <div class="insight-stat"><span>Single-visit signed-in customers</span><strong>${count(c.single_visit_customers)}</strong></div>
        <div class="insight-stat"><span>Anonymous visits</span><strong>${count(s.anonymous_visits)}</strong></div>
        <p class="muted small">Customers are counted by signed-in account at this location. Repeat means multiple visit records in retained history, including cancelled visits. Anonymous visits are not treated as distinct people. Deleted history cannot establish whether someone visited before.</p>
        <h3 style="margin-top:20px">How people check in</h3>
        ${d.channels.length ? d.channels.map((x) => `<div class="insight-stat"><span style="text-transform:capitalize">${esc(x.channel)}</span><strong>${count(x.visits)} <small>(${pct(x.visits, s.visits)})</small></strong></div>`).join("") : '<p class="muted small">No check-in channels yet.</p>'}
      </section>
      <section class="panel"><h2>Payments and outcomes</h2>
        <div class="insight-stat"><span>Recorded paid totals</span><strong>${money(s.paid_cents)}</strong></div>
        <div class="insight-stat"><span>Paid visits</span><strong>${count(s.paid_visits)}</strong></div>
        <div class="insight-stat"><span>Recorded deposits, separate</span><strong>${money(s.deposit_cents)}</strong></div>
        <div class="insight-stat"><span>Awaiting payment</span><strong>${money(s.outstanding_cents)}</strong></div>
        <p class="muted small">Amounts are CAD, for visits created in this period. Includes counter entries and demo/test payments. These are recorded amounts, not reconciled revenue. Deposits are shown separately to avoid adding them to final totals.</p>
        <div class="insight-stat"><span>No-shows</span><strong>${count(s.no_shows)} <small>(${pct(s.no_shows, s.completed + s.no_shows)})</small></strong></div>
        <div class="insight-stat"><span>Cancelled visits</span><strong>${count(s.cancelled)}</strong></div>
        <p class="muted small">No-show rate uses completed visits plus no-shows; active and cancelled visits are excluded.</p>
      </section>
    </div>
    <section class="panel"><h2>Visits needing attention</h2><p class="muted small">Up to 20 visits in this period, prioritizing data requests and unread messages. Open Live to review their threads.</p>
      ${d.attention.length ? table(["Ticket", "Created", "Status", "Follow-up"], d.attention.map((x) => `<tr><th scope="row">${esc(x.ticket)}</th><td>${esc(date(x.created_at))}</td><td>${esc(x.status)}</td><td>${esc(reasons(x))}</td></tr>`).join("")) : '<p class="muted">No visits flagged for follow-up.</p>'}
    </section>
    <div class="grid2 insight-grid">
      <section class="panel" id="insight-feedback"><h2>Ease Score and private feedback</h2>
        <div class="insight-rating">${r.count ? Number(r.average).toFixed(1) : "—"}<span>/ 5 · ${count(r.count)} ratings</span></div>
        <p class="muted small">Feedback for visits created in this period. Low scores: ${count(r.low_scores)}.</p>
        <ul class="audit">${d.feedback.length ? d.feedback.map((x) => `<li><strong>${x.score}/5 · ${esc(x.ticket)}</strong><div class="muted small">${esc(date(x.at))}</div>${x.comment ? `<p class="insight-comment">${esc(x.comment)}</p>` : ""}</li>`).join("") : '<li class="muted">No ratings yet.</li>'}</ul>
      </section>
      <section class="panel"><h2>Form activity</h2>
        ${[["view", "Page views"], ["start", "Form starts"], ["checkin", "Check-in events"], ["rebook", "Rebook clicks"]].map(([key, label]) => `<div class="insight-stat"><span>${label}</span><strong>${count(d.funnel[key])}</strong></div>`).join("")}
        <p class="muted small">Anonymous activity counts in this period. Events are not linked into individual sessions, so these counts do not establish a conversion rate. Rebook clicks do not confirm a booking.</p>
        <details><summary>Recent audit activity</summary><ul class="audit">${d.audit.length ? d.audit.map((a) => `<li><strong>${esc(a.action)}</strong><div class="muted small">${esc(date(a.at))}</div><div>${esc(a.detail)}</div></li>`).join("") : '<li class="muted">No audit activity in this period.</li>'}</ul></details>
      </section>
    </div>`;
}

export function renderInsightsView({ shell, location, api, setPoll }) {
  shell("insights", `<div class="row" style="justify-content:space-between;align-items:flex-end"><div><h1>Insights</h1><p class="muted" style="margin:0">${esc(location.name)} · your business's live visit data</p></div>
    <div class="row insight-controls"><label for="insight-period">Period</label><select id="insight-period">${[7,30,90].map((days) => `<option value="${days}"${days === selectedDays ? " selected" : ""}>Last ${days} days</option>`).join("")}</select><button type="button" class="btn-alt" id="insight-refresh">Refresh</button><a id="insight-export" class="biz-link">Export period CSV</a></div></div>
    <p id="insight-status" class="muted small" role="status" aria-live="polite">Loading analytics...</p><div id="ins" class="insight-content"></div>`);
  const host = document.getElementById("ins"), status = document.getElementById("insight-status"), period = document.getElementById("insight-period"), button = document.getElementById("insight-refresh");
  let version = 0, loading = false, loadedDays = null;
  async function refresh() {
    if (!host.isConnected) return;
    const requestVersion = ++version, days = Number(period.value);
    selectedDays = days; loading = true; button.disabled = true;
    document.getElementById("insight-export").href = `/api/kiosks/${encodeURIComponent(location.id)}/export?days=${days}`;
    status.textContent = "Updating analytics...";
    if (loadedDays !== days) { host.innerHTML = '<p class="muted">Loading this period...</p>'; loadedDays = null; }
    try {
      const data = await api(`/api/kiosks/${encodeURIComponent(location.id)}/insights?days=${days}`);
      if (!host.isConnected || requestVersion !== version) return;
      host.innerHTML = draw(data); loadedDays = days;
      host.querySelectorAll("[data-insight-feedback]").forEach((b) => b.onclick = () => host.querySelector("#insight-feedback").scrollIntoView({ behavior: "smooth", block: "start" }));
      status.textContent = `Updated ${date(data.generated_at)}. Refreshes every 30 seconds while this tab is visible.`;
    } catch (error) {
      if (!host.isConnected || requestVersion !== version) return;
      status.textContent = loadedDays === days ? `Refresh failed. Showing the last successful update. ${error.message}` : error.message;
      if (loadedDays === null) host.innerHTML = '<div class="panel"><p>Analytics could not be loaded. Use Refresh to try again.</p></div>';
    } finally { if (host.isConnected && requestVersion === version) { loading = false; button.disabled = false; } }
  }
  button.onclick = refresh;
  period.onchange = refresh;
  setPoll(setInterval(() => { if (!document.hidden && !loading && host.isConnected) refresh(); }, 30000));
  refresh();
}

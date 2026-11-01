import { createDemo, COMPANY_SAMPLE } from "/js/demo.js";
import { mountKiosk } from "/render.js";

// A public sample must never change the visitor's real dashboard mode or session.
let store;
try { store = localStorage; } catch {}
const sandboxStorage = { getItem: (key) => key === "fz_business_demo" ? "1" : store?.getItem(key), setItem: (key,value) => { if (key !== "fz_business_demo") store?.setItem(key,value); } };
const demo = createDemo(sandboxStorage);
const params = new URLSearchParams(location.search);
const id = params.get("id") || COMPANY_SAMPLE.id, view = params.get("view") || "kiosk";
const root = document.getElementById("demo-content");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const previewUrl = (formId) => `/demo.html?view=kiosk&id=${encodeURIComponent(formId)}`;

function show() {
  let config;
  try { config = demo.previewConfig(id); }
  catch { root.innerHTML = '<section class="panel"><h1>Sample form not found</h1><p>Open the demo dashboard to choose a sample.</p><a href="/business.html?demo=1#forms">View demo forms</a></section>'; return; }
  const isCompany = id === COMPANY_SAMPLE.id;
  document.title = `${config.name} · Formify demo`;
  const banner = `<div class="demo-banner"><div><strong>${isCompany ? "Unofficial Snow Valley concept" : "Browser-only demo"}</strong><span>${isCompany ? esc(COMPANY_SAMPLE.note) : "Fictional sample data. No business is contacted and no payment is made."}</span></div></div>`;
  if (view === "now") {
    const d = demo.request(`/api/kiosks/${id}/now`);
    root.innerHTML = `${banner}<section class="panel demo-board"><h1>${esc(d.name)}</h1><p class="muted">Sample now-serving screen</p><div class="demo-serving">${esc(d.serving.join(" · ") || "No one being served")}</div><h2>Up next</h2><div class="demo-next">${d.next.map((n)=>`<span>${esc(n.ticket)}</span>`).join("") || "No one waiting"}</div><p>Ready for pickup: ${esc(d.ready.join(", ") || "None")}</p></section>`;
    return;
  }
  if (view === "page") {
    const d = demo.request("/api/biz/page");
    root.innerHTML = `${banner}<section class="panel demo-public-page"><p class="demo-eyebrow">Sample business page</p><h1>${esc(d.name)}</h1><p>${esc(d.profile.tagline)}</p><p class="muted">${esc(d.profile.about)}</p><p>${esc(d.profile.address)} · ${esc(d.profile.city)}<br>${esc(d.profile.hours)}</p><div class="formlist">${d.forms.map((f)=>`<a class="formrow" href="${previewUrl(f.id)}"><div><b>${esc(f.label || f.fallback)}</b><p class="muted small">${esc(f.subtitle)}</p></div><span>Try sample →</span></a>`).join("")}</div></section>`;
    return;
  }
  root.innerHTML = `${banner}<div class="demo-concept-grid"><section class="demo-story">
    <p class="demo-eyebrow">${isCompany ? "From paper counter form to phone pre-check-in" : "A sample customer experience"}</p>
    <h1>${isCompany ? "More time on the slopes. Less time on rental paperwork." : esc(config.form_label || config.name)}</h1>
    <p class="demo-lead">${isCompany ? "A renter enters their details before reaching the counter. The rental team receives a readable record and still handles fitting and equipment release." : esc(config.welcome_subtitle)}</p>
    ${isCompany ? `<div class="panel"><h2>Why this example?</h2><p>Snow Valley's rental guide describes completing a paper form at the shop, handing it to the cashier and bringing it to the fitting area.</p><p>A mobile pre-check-in could reduce writing at the counter and make renter details easier for staff to read.</p><a href="${COMPANY_SAMPLE.guide}" target="_blank" rel="noopener">Read Snow Valley's rental guide</a> · <a href="${COMPANY_SAMPLE.source}" target="_blank" rel="noopener">View its public group form</a></div>
    <div class="demo-benefits"><article><strong>Clear steps on a phone</strong><p>Visit details, fitting information and questions for staff.</p></article><article><strong>Readable handoff</strong><p>Structured answers that can appear in a front desk queue.</p></article><article><strong>Technician work stays with staff</strong><p>No binding calculations, equipment guarantees or replacement rental agreement.</p></article></div>` : '<div class="panel"><h2>Try the full flow</h2><p>Start the form, agree to the sample notice, then use “Fill sample answers” or enter fictional information. The submission appears only in this browser’s demo data.</p></div>'}
    <a class="biz-link" href="/business.html?demo=1#forms">Explore all demo forms →</a>
  </section><section class="demo-form-panel"><div class="row" style="justify-content:space-between;margin-bottom:12px"><strong>Try the mock form</strong><span class="pill">No account needed</span></div><div id="demo-kiosk"></div><p class="muted small" style="margin-top:14px">Use fictional details only. Nothing is submitted to ${isCompany ? "Snow Valley" : "a real business"}.</p></section></div>`;
  mountKiosk(document.getElementById("demo-kiosk"),config,{mode:"preview",demo:true,idleMs:600000,onSubmit:async({answers})=>demo.previewSubmit(id,answers)});
}
show();
if (view === "now") setInterval(show,4000);

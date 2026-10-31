// Renders any kiosk config. Used by the live preview in the builder and by the real kiosk.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fieldHtml(f, value) {
  const req = f.required ? " required" : "";
  const v = value ?? "";
  if (f.type === "checkbox") return `<label class="check"><input type="checkbox" name="${f.id}"${value ? " checked" : ""}> ${esc(f.label)}</label>`;
  const label = `<label for="f_${f.id}">${esc(f.label)}${f.required ? "" : ' <span class="muted small">(optional)</span>'}</label>`;
  if (f.type === "select") return label + `<select id="f_${f.id}" name="${f.id}"${req}><option value="">Choose one</option>${f.options.map((o) => `<option${o === v ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  if (f.type === "textarea") return label + `<textarea id="f_${f.id}" name="${f.id}" rows="3"${req}>${esc(v)}</textarea>`;
  return label + `<input id="f_${f.id}" name="${f.id}" type="${f.type}" value="${esc(v)}"${req}${f.type === "number" ? ' min="0"' : ""}>`;
}

export function mountKiosk(root, config, { onSubmit, idleMs = 60000 } = {}) {
  let screen = "welcome", step = 0, answers = {}, consent = false, result = null, error = "", idle;
  root.classList.add("kiosk");
  root.style.setProperty("--brand", config.brand_color);

  const reset = () => { screen = "welcome"; step = 0; answers = {}; consent = false; result = null; error = ""; draw(); };
  const bump = () => { clearTimeout(idle); if (screen !== "welcome") idle = setTimeout(reset, idleMs); };

  function collect() {
    const form = root.querySelector("form");
    if (!form) return true;
    for (const f of config.steps[step].fields) {
      const el = form.elements[f.id];
      answers[f.id] = f.type === "checkbox" ? el.checked : el.value.trim();
    }
    return form.reportValidity();
  }

  function draw() {
    const head = `<div class="k-head"><span>${esc(config.name)}</span><span class="small" style="opacity:.85">Self check-in</span></div>`;
    let body = "";
    if (screen === "welcome") {
      body = `<h2>${esc(config.welcome_title)}</h2><p class="k-sub">${esc(config.welcome_subtitle)}</p><div><button class="k-btn" data-go="consent">Start</button></div>`;
    } else if (screen === "consent") {
      body = `<h2>Before we start</h2><p class="k-sub">${esc(config.consent_text)}</p>
        <label class="check"><input type="checkbox" id="consent"${consent ? " checked" : ""}> I agree</label>
        <div class="k-err">${esc(error)}</div>
        <div class="k-nav"><button class="k-btn ghost" data-go="welcome">Back</button><button class="k-btn" data-go="form">Continue</button></div>`;
    } else if (screen === "form") {
      const s = config.steps[step];
      const dots = config.steps.map((_, i) => `<i class="${i <= step ? "on" : ""}"></i>`).join("");
      body = `<div class="dots">${dots}</div><h2>${esc(s.title)}</h2>
        <form onsubmit="return false">${s.fields.map((f) => fieldHtml(f, answers[f.id])).join("")}</form>
        <div class="k-err">${esc(error)}</div>
        <div class="k-nav"><button class="k-btn ghost" data-go="back">Back</button><button class="k-btn" data-go="next">${step === config.steps.length - 1 ? "Check in" : "Next"}</button></div>`;
    } else if (screen === "done") {
      const wait = result.wait_minutes > 0 ? `About ${result.wait_minutes} min wait · ${result.ahead} ahead of you` : "You're next";
      body = `<p class="k-sub">Your number</p><div class="ticket">${esc(result.ticket)}</div><h2 style="font-size:24px">${esc(config.done_message)}</h2><p class="k-sub">${esc(wait)}</p><div><button class="k-btn" data-go="welcome">Done</button></div>`;
    }
    root.innerHTML = head + `<div class="k-body">${body}</div>`;
  }

  root.addEventListener("click", async (e) => {
    const go = e.target.closest("[data-go]")?.dataset.go;
    if (!go) return;
    bump();
    error = "";
    if (go === "welcome") return reset();
    if (go === "consent") { screen = "consent"; return draw(); }
    if (go === "form") {
      consent = root.querySelector("#consent")?.checked;
      if (!consent) { error = "Please agree to continue."; return draw(); }
      screen = "form"; step = 0; return draw();
    }
    if (go === "back") { collect(); if (step === 0) screen = "consent"; else step--; return draw(); }
    if (go === "next") {
      if (!collect()) return;
      if (step < config.steps.length - 1) { step++; return draw(); }
      e.target.disabled = true;
      try {
        result = await onSubmit({ answers, consent });
        screen = "done";
      } catch (err) { error = err.message || "Something went wrong. Please see the front desk."; }
      draw();
    }
  });
  root.addEventListener("input", bump);
  draw();
  return { reset };
}

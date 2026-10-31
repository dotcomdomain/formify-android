// Renders any kiosk config. Used by the builder preview, the tablet kiosk and the phone check-in.
// mode: "kiosk" (tablet at the door), "phone" (visitor's own phone), "preview" (builder).

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const post = async (url, body) => {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Something went wrong.");
  return data;
};

// Saved profile lives only on the visitor's phone. Keys are normalised labels, so
// "Full name" at a clinic fills "Name" at a restaurant.
const PROFILE_KEY = "ks_profile";
const PROFILE_MAP = [[/name/i, "name"], [/birth|dob/i, "dob"], [/health card|ohip/i, "health_card"], [/phone|mobile|cell/i, "phone"], [/email/i, "email"]];
const profileKey = (label) => PROFILE_MAP.find(([re]) => re.test(label))?.[1];
const readProfile = () => { try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch { return {}; } };
const writeProfile = (p) => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {} };

function fieldHtml(f, value) {
  const req = f.required ? " required" : "";
  const v = value ?? "";
  const description = f.description ? `<p class="muted small" id="d_${f.id}" style="white-space:pre-wrap">${esc(f.description)}</p>` : "";
  const described = f.description ? ` aria-describedby="d_${f.id}"` : "";
  if (f.type === "checkbox") return `<label class="check"><input type="checkbox" name="${f.id}"${req}${described}${value ? " checked" : ""}> ${esc(f.label)}</label>${description}`;
  const label = `<label for="f_${f.id}">${esc(f.label)}${f.required ? "" : ' <span class="muted small">(optional)</span>'}</label>${description}`;
  if (f.type === "select") return label + `<select id="f_${f.id}" name="${f.id}"${req}${described}><option value="">Choose one</option>${f.options.map((o) => `<option${o === v ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  if (f.type === "textarea") return label + `<textarea id="f_${f.id}" name="${f.id}" rows="3"${req}${described}>${esc(v)}</textarea>`;
  return label + `<input id="f_${f.id}" name="${f.id}" type="${f.type}" value="${esc(v)}"${req}${described}${f.type === "number" ? ' min="0" inputmode="numeric"' : ""}>`;
}

async function shrink(file, max = 1024) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

const toBase64 = (blob) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.readAsDataURL(blob); });

let currentAudio;
async function speak(text, lang) {
  if (!text) return;
  try { currentAudio?.pause(); } catch {}
  // Aura voices are English; other languages use the device voice.
  if (lang && lang !== "en") {
    if ("speechSynthesis" in window) { const u = new SpeechSynthesisUtterance(text); u.lang = lang; speechSynthesis.cancel(); speechSynthesis.speak(u); }
    return;
  }
  try {
    const r = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    if (!r.ok) throw new Error();
    currentAudio = new Audio(URL.createObjectURL(await r.blob()));
    await currentAudio.play();
  } catch {
    if ("speechSynthesis" in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text)); }
  }
}

export function mountKiosk(root, config, { mode = "kiosk", kioskId, onSubmit, onArrive, onDone, qrUrl, idleMs = 60000, startAt = "welcome", preferChat = false, initialAnswers = {}, demo = false } = {}) {
  const fields = config.steps.flatMap((s) => s.fields);
  const phone = mode === "phone";
  let s;
  const fresh = () => ({ screen: startAt, step: 0, answers: { ...initialAnswers }, consent: false, result: null, error: "", busy: "", note: "", reply: "", language: "en", via: new Set(), remember: true, recording: false, chat: [], thinking: false, draft: "", lastVoice: false, urgent: false });
  s = fresh();
  let idle, rec, recTimer, caption;
  root.classList.add("kiosk");
  if (phone) root.classList.add("phone");
  root.style.setProperty("--brand", config.brand_color);

  const reset = () => { stopRec(true); s = fresh(); draw(); };
  const bump = () => { clearTimeout(idle); if (!phone && s.screen !== "welcome") idle = setTimeout(reset, idleMs); };

  function prefillFromProfile() {
    if (!phone) return 0;
    const p = readProfile();
    let n = 0;
    for (const f of fields) { const k = profileKey(f.label); if (k && p[k] && s.answers[f.id] === undefined) { s.answers[f.id] = p[k]; n++; } }
    return n;
  }

  function collect(list) {
    const form = root.querySelector("form");
    if (!form) return true;
    for (const f of list) {
      const el = form.elements[f.id];
      if (!el) continue;
      s.answers[f.id] = f.type === "checkbox" ? el.checked : el.value.trim();
    }
    return form.reportValidity();
  }
  const visibleFields = () => (s.screen === "review" ? fields : s.screen === "form" ? config.steps[s.step].fields : []);

  const aiBar = () => demo ? '<div class="ai-bar"><button class="ai-btn" data-go="demo-fill">Fill sample answers</button><span class="muted small">Local demo. No microphone, camera or AI requests.</span></div>' : `
    <div class="ai-bar">
      <button class="ai-btn" data-go="chat">Talk to the assistant</button>
      <button class="ai-btn" data-go="scan">Scan a card</button>
      <input type="file" accept="image/*" capture="environment" id="scanInput" hidden>
    </div>`;

  const isMissing = (f) => f.required && (s.answers[f.id] === undefined || s.answers[f.id] === "" || s.answers[f.id] === false);
  const profileMatches = () => {
    if (!phone) return 0;
    const p = readProfile();
    return fields.filter((f) => { const k = profileKey(f.label); return k && p[k] && s.answers[f.id] === undefined; }).length;
  };

  function chatHtml() {
    const bubbles = s.chat.map((m) => `<div class="bubble ${m.role}">${esc(m.content)}</div>`).join("") + (s.thinking ? '<div class="bubble assistant typing"><i></i><i></i><i></i></div>' : "");
    const filled = fields.map((f) => {
      const v = s.answers[f.id];
      const has = v !== undefined && v !== "" && v !== false;
      return `<span class="slot${has ? " ok" : ""}${isMissing(f) ? " need" : ""}">${esc(f.label)}</span>`;
    }).join("");
    const ready = !fields.some(isMissing);
    const saved = profileMatches();
    return `<div class="chat-wrap">
      ${s.urgent ? `<div class="urgent-banner">${kioskId ? "Staff have been alerted. " : ""}If this is an emergency, tell a staff member now or call 911.</div>` : ""}
      <div class="chat" id="chatLog">${bubbles}</div>
      <div class="slots">${filled}</div>
      <form class="chat-in" onsubmit="return false">
        <button class="mic${s.recording ? " rec" : ""}" data-go="chatmic" type="button" aria-label="${s.recording ? "Stop recording" : "Talk"}">${s.recording ? "Stop" : "Talk"}</button>
        <input id="msg" placeholder="${s.recording ? "Listening..." : "Type here, or tap Talk"}" autocomplete="off" value="${esc(s.draft)}">
        <button data-go="send" type="submit">Send</button>
      </form>
      <div class="row" style="gap:8px;margin-top:10px">
        <button class="ai-btn" data-go="scan" type="button">Scan a card</button>
        ${saved ? `<button class="ai-btn" data-go="useprofile" type="button">Use my saved info (${saved})</button>` : ""}
        <input type="file" accept="image/*" capture="environment" id="scanInput" hidden>
        <span style="flex:1"></span>
        <button class="k-btn ghost" data-go="toform" type="button" style="margin:0">Fill the form instead</button>
        <button class="k-btn" data-go="toreview" type="button" style="margin:0"${ready ? "" : " disabled"}>Review and check in</button>
      </div>
      <div class="k-err">${esc(s.error)}</div>
    </div>`;
  }

  function draw() {
    const helpBtn = mode === "kiosk" ? `<button class="help-btn" data-go="help">${s.helpSent ? "Staff notified" : "Need help?"}</button>` : `<span class="small" style="opacity:.85">${phone ? "Check in from your phone" : "Self check-in"}</span>`;
    const head = `<div class="k-head"><span>${esc(config.name)}</span>${helpBtn}</div>`;
    let body = "";
    if (s.screen === "welcome") {
      const qr = mode === "kiosk" && qrUrl ? `<div class="qr-box"><div id="qr"></div><div><strong>Skip the line</strong><div class="muted small">Scan with your phone camera to check in before you get to the desk.</div></div></div>` : "";
      body = `<h2>${esc(phone ? `Check in to ${config.name}` : config.welcome_title)}</h2>
        <p class="k-sub">${esc(phone ? "Fill this in now and you'll skip the front desk when you arrive." : config.welcome_subtitle)}</p>
        <div class="row"><button class="k-btn" data-go="consent">Start</button>
        ${mode === "kiosk" ? '<button class="k-btn ghost" data-go="code">Checked in on your phone?</button>' : ""}</div>${qr}`;
    } else if (s.screen === "code") {
      body = `<h2>Enter your check-in code</h2><p class="k-sub">It's the 4-digit code on your phone.</p>
        <form onsubmit="return false"><input id="code" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" autocomplete="off" style="font-size:40px;letter-spacing:.4em;text-align:center;max-width:260px"></form>
        <div class="k-err">${esc(s.error)}</div>
        <div class="k-nav"><button class="k-btn ghost" data-go="welcome">Back</button><button class="k-btn" data-go="arrive">I'm here</button></div>`;
    } else if (s.screen === "consent") {
      body = `<h2>Before we start</h2><p class="k-sub" style="white-space:pre-wrap">${esc(config.consent_text)}</p>
        <label class="check"><input type="checkbox" id="consent"${s.consent ? " checked" : ""}> I agree</label>
        <div class="k-err">${esc(s.error)}</div>
        <div class="k-nav"><button class="k-btn ghost" data-go="welcome">Back</button><button class="k-btn" data-go="form">Continue</button></div>`;
    } else if (s.screen === "form") {
      const st = config.steps[s.step];
      const dots = config.steps.map((_, i) => `<i class="${i <= s.step ? "on" : ""}"></i>`).join("");
      body = `<div class="dots">${dots}</div>${s.step === 0 ? aiBar() : ""}${s.note ? `<div class="ai-note">${esc(s.note)}</div>` : ""}<h2>${esc(st.title)}</h2>
        ${st.description ? `<p class="k-sub" style="white-space:pre-wrap">${esc(st.description)}</p>` : ""}
        <form onsubmit="return false">${st.fields.map((f) => fieldHtml(f, s.answers[f.id])).join("")}</form>
        <div class="k-err">${esc(s.error)}</div>
        <div class="k-nav"><button class="k-btn ghost" data-go="back">Back</button><button class="k-btn" data-go="next">${s.step === config.steps.length - 1 ? "Check in" : "Next"}</button></div>`;
    } else if (s.screen === "chat") {
      body = chatHtml();
    } else if (s.screen === "review") {
      body = `${aiBar()}
        ${s.note ? `<div class="ai-note">${esc(s.note)}</div>` : ""}
        ${s.reply ? `<div class="ai-reply">${esc(s.reply)}</div>` : ""}
        <h2>Check your details</h2>
        <form onsubmit="return false">${fields.map((f) => fieldHtml(f, s.answers[f.id])).join("")}
        ${phone ? `<label class="check small"><input type="checkbox" id="remember"${s.remember ? " checked" : ""}> Remember my name and contact details on this phone for next time</label>` : ""}</form>
        <div class="k-err">${esc(s.error)}</div>
        <div class="k-nav"><button class="k-btn ghost" data-go="welcome">Start over</button><button class="k-btn" data-go="submit">Check in</button></div>`;
    } else if (s.screen === "done") {
      const r = s.result;
      const wait = r.wait_minutes > 0 ? `About ${r.wait_minutes} min wait · ${r.ahead} ahead of you` : "You're next";
      body = `<p class="k-sub">Your number</p><div class="ticket">${esc(r.ticket)}</div><h2 style="font-size:24px">${esc(config.done_message)}</h2><p class="k-sub">${esc(wait)}</p><div><button class="k-btn" data-go="welcome">Done</button></div>`;
    }
    const busy = s.busy ? `<div class="k-busy"><div class="spin"></div><div>${esc(s.busy)}</div></div>` : "";
    root.innerHTML = head + `<div class="k-body">${body}</div>` + busy;
    if (s.screen === "welcome" && mode === "kiosk" && qrUrl && window.QRCode) new window.QRCode(root.querySelector("#qr"), { text: qrUrl, width: 120, height: 120 });
    root.querySelector("#scanInput")?.addEventListener("change", onScan);
    if (s.screen === "code") root.querySelector("#code")?.focus();
    if (s.screen === "chat") {
      const log = root.querySelector("#chatLog");
      log.scrollTop = log.scrollHeight;
      const msg = root.querySelector("#msg");
      msg.addEventListener("input", () => { s.draft = msg.value; });
      if (!phone) msg.focus();
    }
  }

  // Staff alert goes to the dashboard instantly. Only the message that triggered it is sent.
  function alertStaff(kind, message) {
    if (!kioskId) return;
    fetch(`/api/kiosks/${encodeURIComponent(kioskId)}/alerts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, message: String(message || "").slice(0, 300) }) }).catch(() => {});
  }

  // Assistant chat: each turn sends the conversation and current answers; the server returns
  // a reply plus any fields it could fill. The visitor still reviews and submits.
  function openChat() {
    s.screen = "chat";
    if (!s.chat.length) s.chat.push({ role: "assistant", content: `Hi! I'm the check-in assistant for ${config.name}. Tell me what brings you in today, or tap Talk and just say it.` });
    draw();
  }
  async function chatSend(text, { voice = false } = {}) {
    const t = String(text || "").trim();
    if (!t) return;
    s.chat.push({ role: "user", content: t });
    s.draft = ""; s.thinking = true; s.error = ""; s.lastVoice = voice;
    draw();
    try {
      const r = await post("/api/agent", { id: kioskId, config: kioskId ? undefined : config, messages: s.chat, answers: s.answers, language: s.language });
      Object.assign(s.answers, r.answers || {});
      if (Object.keys(r.answers || {}).length) s.via.add(voice ? "voice" : "assistant");
      s.chat.push({ role: "assistant", content: r.reply });
      if (r.urgent) { s.urgent = true; alertStaff("emergency", t); }
      if (voice || r.urgent) speak(r.reply, s.language);
    } catch (e) { s.error = e.message; }
    s.thinking = false;
    draw();
  }
  async function chatAudio(blob) {
    const heard = s.caption;
    s.caption = ""; s.thinking = true; draw();
    let r = {};
    try { r = await post("/api/stt", { audio: await toBase64(blob) }); } catch (e) { if (!heard) { s.thinking = false; s.error = e.message; return draw(); } }
    s.thinking = false;
    const text = r.text || heard;
    if (!text) { s.chat.push({ role: "assistant", content: "Sorry, I didn't catch that. Tap Talk and try again." }); return draw(); }
    s.language = r.language || s.language;
    s.via.add("voice");
    await chatSend(text, { voice: true });
  }

  async function submit() {
    if (!collect(fields)) return;
    if (phone) {
      s.remember = root.querySelector("#remember")?.checked ?? false;
      if (s.remember) {
        const p = readProfile();
        for (const f of fields) { const k = profileKey(f.label); if (k && s.answers[f.id]) p[k] = s.answers[f.id]; }
        writeProfile(p);
      }
    }
    s.busy = "Checking you in..."; draw();
    try {
      s.result = await onSubmit({ answers: s.answers, consent: s.consent, channel: phone ? "phone" : "kiosk", language: s.language, via: [...s.via] });
      s.busy = "";
      if (onDone) return onDone(s.result);
      s.screen = "done";
    } catch (err) { s.busy = ""; s.error = err.message; }
    draw();
  }

  // Live captions while talking, where the browser offers speech recognition. Whisper still writes the final text.
  function startCaption() {
    s.caption = "";
    const Recognizer = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognizer || s.screen !== "chat") return;
    caption = new Recognizer();
    caption.continuous = true;
    caption.interimResults = true;
    caption.lang = navigator.language || "en-US";
    caption.onresult = (e) => {
      s.caption = [...e.results].map((x) => x[0].transcript).join(" ").replace(/\s+/g, " ").trim();
      const input = root.querySelector("#msg");
      if (input) { input.value = s.caption; input.scrollLeft = input.scrollWidth; }
    };
    caption.onerror = () => {};
    try { caption.start(); } catch { caption = null; }
  }

  // Voice: tap to start, tap to stop (auto-stops after 20 s).
  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (rec?.cancelled) return;
        const blob = new Blob(chunks, { type: rec.mimeType });
        if (s.screen === "chat") await chatAudio(blob); else await onAudio(blob);
      };
      rec.start();
      s.recording = true; s.error = ""; s.reply = "Listening... tell me everything in one go, then tap Stop.";
      draw();
      startCaption();
      recTimer = setTimeout(() => stopRec(), 20000);
    } catch { s.error = "Microphone not available. You can type instead."; draw(); }
  }
  function stopRec(cancel) {
    clearTimeout(recTimer);
    caption?.abort();
    caption = null;
    if (rec && rec.state !== "inactive") { rec.cancelled = !!cancel; rec.stop(); }
    s.recording = false;
  }
  async function onAudio(blob) {
    s.busy = "Understanding..."; draw();
    try {
      const r = await post("/api/voice", { audio: await toBase64(blob), fields, answers: s.answers });
      Object.assign(s.answers, r.answers);
      if (r.transcript) s.via.add("voice");
      s.language = r.language || s.language;
      const n = Object.keys(r.answers || {}).length;
      s.note = r.transcript ? `Heard${r.language && r.language !== "en" ? ` (${r.language_name})` : ""}: "${r.transcript}"${n ? ` · filled ${n} field${n > 1 ? "s" : ""}` : ""}` : "";
      s.reply = r.reply || "";
      s.screen = "review";
      speak(s.reply, s.language);
    } catch (e) { s.error = e.message; }
    s.busy = ""; draw();
  }

  async function onScan(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    collect(visibleFields());
    s.busy = "Reading your card..."; draw();
    try {
      const r = await post("/api/scan", { image: await shrink(file), fields });
      Object.assign(s.answers, r.answers);
      s.via.add("scan");
      if (s.screen === "chat") {
        s.busy = "";
        const got = fields.filter((f) => r.answers[f.id] !== undefined).map((f) => f.label).join(", ");
        return chatSend(r.found ? `I scanned my ${r.card_type}. (Filled: ${got}. The photo was not saved.)` : "I tried to scan my card but nothing was read.");
      }
      s.note = r.found ? `Read from your ${r.card_type}: ${r.found} field${r.found > 1 ? "s" : ""} filled. The photo was not saved.` : "Couldn't find any details on that card. Try again or type them in.";
      s.reply = "";
      s.screen = "review";
    } catch (err) { s.error = err.message; }
    s.busy = ""; draw();
  }

  root.addEventListener("click", async (e) => {
    const go = e.target.closest("[data-go]")?.dataset.go;
    if (!go) return;
    bump();
    s.error = "";
    if (go === "demo-fill" && demo) {
      for (const f of fields) s.answers[f.id] = f.type === "checkbox" ? true : f.type === "select" ? f.options[0] : f.type === "date" ? new Date().toISOString().slice(0, 10) : f.type === "number" ? (/height/i.test(f.label) ? 170 : /weight/i.test(f.label) ? 70 : 28) : f.type === "email" ? "alex@example.com" : f.type === "tel" ? "555-0100" : /name/i.test(f.label) ? "Alex Demo" : "Sample only";
      return draw();
    }
    if (go === "welcome") return reset();
    if (go === "code") { s.screen = "code"; return draw(); }
    if (go === "arrive") {
      const code = root.querySelector("#code").value.trim();
      if (!/^\d{4}$/.test(code)) { s.error = "Enter the 4 digits from your phone."; return draw(); }
      s.busy = "Finding your check-in..."; draw();
      try { s.result = await onArrive(code); s.screen = "done"; } catch (err) { s.error = err.message; }
      s.busy = ""; return draw();
    }
    if (go === "consent") { s.screen = "consent"; return draw(); }
    if (go === "form") {
      s.consent = root.querySelector("#consent")?.checked;
      if (!s.consent) { s.error = "Please agree to continue."; return draw(); }
      const n = prefillFromProfile();
      if (n) s.note = `Filled ${n} detail${n > 1 ? "s" : ""} from your info.`;
      if (preferChat) return openChat();
      s.screen = "form"; s.step = 0; return draw();
    }
    if (go === "mic") { collect(visibleFields()); return s.recording ? stopRec() : startRec(); }
    if (go === "chat") { collect(visibleFields()); return openChat(); }
    if (go === "help") { alertStaff("help", "Visitor tapped Need help on the kiosk"); s.helpSent = true; setTimeout(() => { s.helpSent = false; draw(); }, 30000); return draw(); }
    if (go === "chatmic") return s.recording ? stopRec() : startRec();
    if (go === "send") return chatSend(root.querySelector("#msg")?.value);
    if (go === "useprofile") {
      const p = readProfile();
      const got = [];
      for (const f of fields) { const k = profileKey(f.label); if (k && p[k] && s.answers[f.id] === undefined) { s.answers[f.id] = p[k]; got.push(f.label); } }
      return chatSend(`Use my saved info. (Filled from this phone: ${got.join(", ")}.)`);
    }
    if (go === "toreview") { s.note = ""; s.reply = ""; s.screen = "review"; return draw(); }
    if (go === "toform") { s.note = ""; s.screen = "form"; s.step = 0; return draw(); }
    if (go === "scan") return root.querySelector("#scanInput").click();
    if (go === "back") { collect(visibleFields()); if (s.step === 0) s.screen = "consent"; else s.step--; return draw(); }
    if (go === "next") {
      if (!collect(visibleFields())) return;
      if (s.step < config.steps.length - 1) { s.step++; s.note = ""; return draw(); }
      return submit();
    }
    if (go === "submit") return submit();
  });
  root.addEventListener("input", bump);
  draw();
  return { reset };
}

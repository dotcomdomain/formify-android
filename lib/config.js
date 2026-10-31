// Kiosk config: the one format the generator writes and the kiosk renders.

export const FLOWS = ["walk_in", "appointment", "dropoff", "forms_only"];
export const FIELD_TYPES = ["text", "tel", "email", "date", "number", "select", "checkbox", "textarea"];

// Labels that look like personal or health data get flagged even if the model forgets.
const SENSITIVE_RE = /health|ohip|card|insurance|birth|dob|symptom|medical|condition|allerg|medication|passport|sin\b|social insurance|address|phone|email/i;

export const SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    business_type: { type: "string" },
    brand_color: { type: "string" },
    ticket_prefix: { type: "string" },
    welcome_title: { type: "string" },
    welcome_subtitle: { type: "string" },
    consent_text: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          fields: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                type: { type: "string", enum: FIELD_TYPES },
                required: { type: "boolean" },
                sensitive: { type: "boolean" },
                options: { type: "array", items: { type: "string" } }
              },
              required: ["label", "type", "required", "sensitive"]
            }
          }
        },
        required: ["title", "fields"]
      }
    },
    done_message: { type: "string" },
    notify: { type: "string" },
    avg_service_minutes: { type: "number" },
    retention_days: { type: "number" }
  },
  required: ["name", "business_type", "brand_color", "ticket_prefix", "welcome_title", "welcome_subtitle",
    "consent_text", "steps", "done_message", "notify", "avg_service_minutes", "retention_days"]
};

const str = (v, max, fallback = "") => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback);
const num = (v, lo, hi, fallback) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : fallback);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "field";

// Never trust the model (or the browser): clamp everything to what the kiosk can render.
export function sanitize(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const used = new Set();
  const steps = (Array.isArray(c.steps) ? c.steps : []).slice(0, 5).map((s) => ({
    title: str(s?.title, 60, "Your details"),
    fields: (Array.isArray(s?.fields) ? s.fields : []).slice(0, 8).map((f) => {
      const label = str(f?.label, 80, "Field");
      // Keep an existing id so renaming a label in the builder doesn't orphan answers.
      let id = typeof f?.id === "string" && /^[a-z0-9_]{1,40}$/.test(f.id) ? f.id : slug(label);
      while (used.has(id)) id += "_2";
      used.add(id);
      const type = FIELD_TYPES.includes(f?.type) ? f.type : "text";
      const field = { id, label, type, required: !!f?.required, sensitive: !!f?.sensitive || SENSITIVE_RE.test(label) };
      if (type === "select") {
        field.options = (Array.isArray(f?.options) ? f.options : []).map((o) => str(o, 60)).filter(Boolean).slice(0, 12);
        if (!field.options.length) field.type = "text";
      }
      return field;
    }).filter(Boolean)
  })).filter((s) => s.fields.length);

  return {
    name: str(c.name, 60, "My Business"),
    business_type: str(c.business_type, 40, "general"),
    brand_color: /^#[0-9a-f]{6}$/i.test(c.brand_color) ? c.brand_color : "#1f6feb",
    ticket_prefix: str(c.ticket_prefix, 1, "A").toUpperCase().replace(/[^A-Z]/, "A"),
    welcome_title: str(c.welcome_title, 80, "Welcome"),
    welcome_subtitle: str(c.welcome_subtitle, 160, "Tap start to check in."),
    consent_text: str(c.consent_text, 400, "We only use this information to serve you today."),
    steps: steps.length ? steps : TEMPLATES.clinic.steps,
    done_message: str(c.done_message, 200, "You're checked in. Please take a seat."),
    notify: str(c.notify, 60, "Front desk"),
    avg_service_minutes: num(c.avg_service_minutes, 1, 120, 10),
    retention_days: num(c.retention_days, 1, 365, 30),
    // Public business page
    city: str(c.city, 60, ""),
    website: url(c.website),
    google_reviews: url(c.google_reviews),
    instagram: instagram(c.instagram),
    listed: c.listed !== false,
    form_label: str(c.form_label, 60, ""),
    // How customers come in: walk_in (line), appointment (book, then arrive), dropoff (leave it, pick up when ready), forms_only (waivers, sign-ups)
    flow: FLOWS.includes(c.flow) ? c.flow : "walk_in"
  };
}

function url(v) {
  const s = str(v, 300);
  if (!s) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch { return ""; }
}

// Accepts "@handle", "handle" or a full instagram.com link.
function instagram(v) {
  const s = str(v, 200);
  if (!s) return "";
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]{1,30})/) || s.match(/^@?([A-Za-z0-9._]{1,30})$/);
  return m ? `https://www.instagram.com/${m[1]}/` : "";
}

export const TEMPLATES = {
  clinic: {
    name: "Maple Lane Family Clinic", business_type: "clinic", brand_color: "#0f766e", ticket_prefix: "C",
    welcome_title: "Welcome to Maple Lane Family Clinic", welcome_subtitle: "Check in for your appointment in under a minute.",
    consent_text: "Your answers go only to the clinic's front desk to prepare for your visit. They are deleted after 30 days.",
    steps: [
      { title: "About you", fields: [
        { label: "Full name", type: "text", required: true, sensitive: false },
        { label: "Date of birth", type: "date", required: true, sensitive: true },
        { label: "Health card number", type: "text", required: true, sensitive: true } ] },
      { title: "Your visit", fields: [
        { label: "Appointment type", type: "select", required: true, sensitive: false, options: ["Booked appointment", "Walk-in", "Prescription renewal", "Lab results"] },
        { label: "Main reason for your visit", type: "textarea", required: false, sensitive: true },
        { label: "I have a cough, fever or rash", type: "checkbox", required: false, sensitive: true } ] }
    ],
    done_message: "You're checked in. Please take a seat and we'll call your number.",
    notify: "Front desk", avg_service_minutes: 12, retention_days: 30
  },
  restaurant: {
    name: "Lantern Noodle Bar", business_type: "restaurant", brand_color: "#c2410c", ticket_prefix: "R",
    welcome_title: "Join the waitlist", welcome_subtitle: "Order ahead while you wait for a table.",
    consent_text: "We use your name and phone only to text you when your table is ready.",
    steps: [
      { title: "Your party", fields: [
        { label: "Name", type: "text", required: true, sensitive: false },
        { label: "Party size", type: "number", required: true, sensitive: false },
        { label: "Phone for table text", type: "tel", required: false, sensitive: true } ] },
      { title: "Order ahead", fields: [
        { label: "Starter", type: "select", required: false, sensitive: false, options: ["None", "Gyoza", "Edamame", "Spring rolls"] },
        { label: "Allergies", type: "text", required: false, sensitive: true } ] }
    ],
    done_message: "You're on the list. We'll text you when your table is ready.",
    notify: "Host stand", avg_service_minutes: 8, retention_days: 7
  },
  airport: {
    name: "Terminal Assistance Desk", business_type: "airport", brand_color: "#4338ca", ticket_prefix: "Y",
    welcome_title: "Need help with your trip?", welcome_subtitle: "Check in for bag drop or travel assistance.",
    consent_text: "Your details go only to the assistance desk and are deleted after 2 days.",
    steps: [
      { title: "Your flight", fields: [
        { label: "Last name", type: "text", required: true, sensitive: false },
        { label: "Flight number", type: "text", required: true, sensitive: false },
        { label: "Number of checked bags", type: "number", required: true, sensitive: false } ] },
      { title: "Assistance", fields: [
        { label: "Help needed", type: "select", required: true, sensitive: false, options: ["Bag drop only", "Wheelchair", "Rebooking", "Lost item", "Other"] },
        { label: "Anything we should know", type: "textarea", required: false, sensitive: false } ] }
    ],
    done_message: "You're checked in. An agent will call your number shortly.",
    notify: "Assistance desk", avg_service_minutes: 6, retention_days: 2
  }
};

export function pickTemplate(text) {
  const t = String(text).toLowerCase();
  if (/restaurant|cafe|food|table|waitlist|noodle|order/.test(t)) return TEMPLATES.restaurant;
  if (/airport|flight|bag|gate|airline|travel/.test(t)) return TEMPLATES.airport;
  return TEMPLATES.clinic;
}

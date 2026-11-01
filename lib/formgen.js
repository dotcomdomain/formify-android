// What makes a generated form feel real: trade knowledge going in, and a cleanup pass coming out.

const NAME = { label: "Full name", type: "text", required: true, match: /\bname\b/i };
const PHONE = { label: "Mobile phone", type: "tel", required: true, match: /phone|mobile|cell/i };
const EMAIL = { label: "Email", type: "email", required: true, match: /email/i };

// Each trade: the fields a real form needs (core), and how the visit runs.
const TRADES = [
  // Internal forms stay off the public page and search; new hires get a personal invite link.
  { id: "onboarding", test: /\b(staff onboarding|employee onboarding|onboarding form|new hires?|new employees?|new staff)\b/i, listed: false,
    never: /\b(sin|social insurance|bank|banking|transit|account number|void cheque|direct deposit|salary|wage|pay rate)\b/i,
    rule: "Never ask for a Social Insurance Number, banking details or pay.",
    title: "Welcome to the team", subtitle: "Please fill this in before your first day.", purpose: "set up your staff record and contact you",
    playbook: "signed_ahead", retention: 90, minutes: 10, core: [NAME, PHONE, EMAIL,
      { label: "Start date", type: "date", required: true, match: /start date|first day/i },
      { label: "Role", type: "text", required: true, match: /role|position|job title/i },
      { label: "Emergency contact name", type: "text", required: true, match: /emergency contact( name)?$/i },
      { label: "Emergency contact phone", type: "tel", required: true, match: /emergency.*(phone|number)/i },
      { label: "Certifications or licences", type: "textarea", required: false, match: /certif|licen[cs]e|qualif/i },
      { label: "I have read the staff handbook", type: "checkbox", required: true, match: /handbook/i }] },
  { id: "finance", test: /\b(banks?|credit union|mortgage|insurance broker|financial advis\w*|accountants?|bookkeep\w*)\b/i, listed: false,
    never: /\b(sin|social insurance|income|salary|account number|bank|banking|transit|credit score|net worth)\b/i,
    rule: "Never ask for a Social Insurance Number, account numbers, income or other financial details.",
    title: "Become a client", subtitle: "Tell us what you need and the right person will follow up.", purpose: "prepare for your conversation and contact you",
    playbook: "signed_ahead", retention: 30, minutes: 20, core: [NAME, PHONE, EMAIL,
      { label: "What do you need help with?", type: "select", required: true, options: ["New account", "Mortgage", "Loan", "Investing", "Insurance", "Something else"], match: /help with|need|account type|service/i },
      { label: "Best time to reach you", type: "select", required: false, options: ["Morning", "Afternoon", "Evening"], match: /best time|preferred time/i },
      { label: "Tell us more", type: "textarea", required: false, match: /tell us|details|notes|message/i }] },
  { id: "event", test: /\b(event registration|register for|gala|fundraiser|conference|workshop|festival|tournament)\b/i,
    title: "Register for the event", subtitle: "Save your spot in a couple of minutes.", purpose: "manage your registration and contact you about the event",
    playbook: "signed_ahead", retention: 60, minutes: 5, core: [NAME, EMAIL,
      { label: "Phone (optional)", type: "tel", required: false, match: /phone/i },
      { label: "Number of guests", type: "number", required: true, match: /guests|attendees|tickets/i },
      { label: "Dietary or access needs", type: "textarea", required: false, match: /dietary|access|allerg|special/i }] },
  { id: "adventure", test: /\b(tree ?tops?|zip ?line|adventure park|climbing|trampoline|paintball|go.?kart|rafting|waiver)\b/i,
    title: "Before your adventure", subtitle: "Sign in advance and walk straight in.", purpose: "keep you safe and keep your signed waiver",
    playbook: "signed_ahead", retention: 365, minutes: 5, core: [NAME, PHONE, EMAIL,
      { label: "Date of visit", type: "date", required: true, match: /date of visit|visit date/i },
      { label: "Emergency contact name", type: "text", required: true, match: /emergency contact( name)?$/i },
      { label: "Emergency contact phone", type: "tel", required: true, match: /emergency.*(phone|number)/i },
      { label: "Medical conditions we should know about", type: "textarea", required: false, match: /medical|health|condition/i },
      { label: "I have read and accept the waiver", type: "checkbox", required: true, match: /waiver|release/i }] },
  { id: "lodging", test: /\b(motel|hotel|inn|lodge|guest ?house|bed and breakfast|b&b|hostel)\b/i,
    title: "Check in for your stay", subtitle: "Finish this before you arrive and skip the desk paperwork.", purpose: "prepare your stay and contact you",
    playbook: "faster_mornings", retention: 30, minutes: 5, core: [NAME, PHONE, EMAIL,
      { label: "Arrival date", type: "date", required: true, match: /arrival|check.?in date/i },
      { label: "Departure date", type: "date", required: true, match: /departure|check.?out date/i },
      { label: "Number of guests", type: "number", required: true, match: /guests/i },
      { label: "Vehicle licence plate", type: "text", required: false, match: /licen[cs]e|plate/i },
      { label: "Special requests", type: "textarea", required: false, match: /special|requests|notes/i }] },
  { id: "auto", test: /\b(auto|car|cars|vehicle|garage|mechanic|tire|tyre|brake|brakes|oil change|muffler|collision|body shop)\b/i,
    title: "Drop off your vehicle", subtitle: "Tell us what's going on. We'll keep you posted and ask before extra work.", purpose: "work on your vehicle and keep you updated",
    playbook: "ready_on_time", retention: 90, minutes: 60, core: [NAME, PHONE,
      { label: "Year, make and model", type: "text", required: true, match: /make|model|year/i },
      { label: "Licence plate", type: "text", required: false, match: /licen[cs]e|plate/i },
      { label: "Mileage (km)", type: "number", required: false, match: /mileage|odometer|km\b/i },
      { label: "What do you need done?", type: "select", required: true, options: ["Oil change", "Brakes", "Tires", "Warning light", "Strange noise", "Something else"], match: /need done|service|reason|work needed|issue/i },
      { label: "Tell us more", type: "textarea", required: false, match: /tell us|describe|details|notes|instructions/i }] },
  { id: "device", test: /\b(phone repair|computer repair|laptop|tablet repair|iphone|appliance|electronics|screen repair)\b/i,
    title: "Drop off your device", subtitle: "Tell us what's wrong and we'll keep you updated.", purpose: "repair your device and keep you updated",
    playbook: "ready_on_time", retention: 60, minutes: 45, core: [NAME, PHONE,
      { label: "Device make and model", type: "text", required: true, match: /device|model/i },
      { label: "What's wrong?", type: "select", required: true, options: ["Cracked screen", "Battery", "Won't charge", "Water damage", "Software", "Something else"], match: /wrong|issue|problem/i },
      { label: "Tell us more", type: "textarea", required: false, match: /tell us|describe|details|notes/i }] },
  { id: "pets", test: /\b(dog|dogs|cat|cats|pet|pets|groom|groomer|grooming|kennel|boarding|vet|veterinary)\b/i,
    title: "Tell us about your pet", subtitle: "A few details so we can take great care of them.", purpose: "care for your pet and contact you",
    playbook: "regulars", retention: 180, minutes: 60, core: [
      { label: "Your name", type: "text", required: true, match: /^(your |full )?name$|your name|owner/i }, PHONE,
      { label: "Pet's name", type: "text", required: true, match: /pet.?s name|dog.?s name|cat.?s name/i },
      { label: "Breed and age", type: "text", required: false, match: /breed/i },
      { label: "Vaccinations up to date?", type: "select", required: true, options: ["Yes", "No", "Not sure"], match: /vaccin/i },
      { label: "Behaviour or health notes", type: "textarea", required: false, match: /behaviou?r|health|notes/i }] },
  { id: "health", test: /\b(physio|physiotherapy|chiro|chiropractic|massage therapy|clinic|dental|dentist|patient|medical|optometr)\w*\b/i,
    title: "New patient intake", subtitle: "Please complete this before your first visit.", purpose: "prepare for your visit and contact you",
    playbook: "no_empty_slots", retention: 30, minutes: 30, core: [NAME,
      { label: "Date of birth", type: "date", required: true, match: /birth|dob/i }, PHONE, EMAIL,
      { label: "Reason for your visit", type: "textarea", required: true, match: /reason|main concern|injury|complaint/i },
      { label: "When did this start?", type: "date", required: false, match: /when did|start|onset/i },
      { label: "Current medications", type: "textarea", required: false, match: /medication/i },
      { label: "Allergies", type: "textarea", required: false, match: /allerg/i },
      { label: "Emergency contact", type: "text", required: false, match: /emergency/i }] },
  { id: "inquiry", test: /\b(inquiry|enquiry|quote|photograph\w*|wedding|event planner|catering|contractor|renovation|landscap\w*|estimate request)\b/i,
    title: "Tell us about your project", subtitle: "Share a few details and we'll get back to you.", purpose: "reply to your inquiry",
    playbook: "signed_ahead", retention: 90, minutes: 10, core: [NAME, EMAIL,
      { label: "Phone (optional)", type: "tel", required: false, match: /phone/i },
      { label: "Tell us what you need", type: "textarea", required: true, match: /message|tell us|project|details|what you need/i }] },
  { id: "barber", test: /\b(barber|barbers|barbershop|salon|hair|stylist|nails?|lash|spa)\b/i,
    title: "Join the line", subtitle: "Tell us what you're after and we'll be ready.", purpose: "serve you and tell you when it's your turn",
    playbook: "fill_chair", retention: 30, minutes: 25, core: [NAME,
      { label: "Phone (optional)", type: "tel", required: false, match: /phone/i },
      { label: "Service", type: "select", required: true, options: ["Haircut", "Fade", "Beard trim", "Something else"], match: /service/i },
      { label: "Preferred staff member", type: "text", required: false, match: /prefer|barber|stylist/i }] }
];

export const tradeFor = (text) => TRADES.find((t) => t.test.test(String(text))) || null;

export function tradeGuide(trade) {
  if (!trade) return "";
  return `\nFor this trade, start from these fields, drop any that don't fit, and add anything the owner asked for:\n${trade.core.map((f) => `- ${f.label}${f.options ? ` (one of: ${f.options.join(", ")})` : ""}`).join("\n")}${trade.rule ? `\n${trade.rule}` : ""}`;
}

// Fields that only make sense to the model: the form's own buttons, or things the shop already knows.
const JUNK = /^(confirm(ation)?|notify|notification|submit|send|terms|agree|authorized work|signature|appointment (time|date)|payment( method| details| info(rmation)?)?|credit card.*|card number|.*therapist'?s? name|doctor'?s? name)$/i;
const PERSON_NAME = /^(your |full |first |last |owner'?s? )?name$/i;
const plain = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Keep a business name only if the owner actually said it; the model likes to make them up.
function ownerSaid(name, prompt) {
  const said = plain(prompt);
  const words = plain(name).split(" ").filter((w) => w.length > 2 && !/^(check|in|the|shop|form|inquiry|intake)$/.test(w));
  return words.length > 1 && words.every((w) => said.includes(w));
}

export function polishForm(raw, prompt, trade) {
  const c = { ...raw };
  const named = String(c.name || "").replace(/\s+((new|class|student|client)\s+)*(student|sign[- ]?up|intake|form)(\s+form)?$/i, "").trim();
  c.name = ownerSaid(named, prompt) ? named.replace(/(^|\s)[a-z]/g, (m) => m.toUpperCase()) : "Your business";
  c.business_type = String(c.business_type || "").replace(/[_-]+/g, " ").toLowerCase();

  const seen = new Set();
  const fields = [];
  for (const f of (c.steps || []).flatMap((s) => s.fields || [])) {
    const key = plain(f.label);
    if (!key || JUNK.test(f.label.trim()) || trade?.never?.test(f.label) || seen.has(key)) continue;
    seen.add(key);
    fields.push(PERSON_NAME.test(f.label.trim()) ? { ...f, sensitive: false } : f);
  }
  // A split first and last name already covers "Full name".
  for (const core of trade?.core || []) {
    const found = fields.filter((f) => core.match.test(f.label));
    // Optional in the trade stays optional, so the form stays quick.
    if (found.length) { if (!core.required) found.forEach((f) => { f.required = false; }); continue; }
    const { match, ...field } = core;
    fields.push({ sensitive: false, ...field });
  }

  // People first, then the job, one short screen at a time.
  const isContact = (f) => /name|phone|mobile|email/i.test(f.label) && !/pet|dog|cat/i.test(f.label);
  const contact = fields.filter(isContact);
  const rest = fields.filter((f) => !isContact(f));
  const chunks = [];
  for (let i = 0; i < rest.length; i += 5) chunks.push(rest.slice(i, i + 5));
  c.steps = [contact.length && { title: "Your details", fields: contact }, ...chunks.map((part, i) => ({ title: ["The details", "A bit more", "Almost done"][i] || "A bit more", fields: part }))].filter(Boolean);

  if (trade) Object.assign(c, { playbook: trade.playbook, retention_days: trade.retention, avg_service_minutes: trade.minutes, welcome_title: trade.title, welcome_subtitle: trade.subtitle });
  else {
    if (/[[\]]/.test(c.welcome_title)) c.welcome_title = "Welcome";
    if (c.name === "Your business" && !/\bcheck/i.test(c.welcome_title) && !trade) c.welcome_title = String(c.welcome_title).replace(/\b(to|at)\s+.*$/i, "").trim() || "Welcome";
  }
  if (trade?.listed === false) c.listed = false;
  // A walk-in clinic runs a line, not bookings.
  if (trade?.id === "health" && /walk-?\s?in/i.test(prompt)) Object.assign(c, { playbook: "fill_chair", welcome_title: "Check in", welcome_subtitle: "Tell us why you're here and we'll call you when it's your turn." });
  const days = c.retention_days;
  if (trade) c.consent_text = `We use these details to ${trade.purpose}. Only our staff can see them, and they're deleted after ${days} days.`;
  return c;
}

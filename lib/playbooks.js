// Playbooks: one per business goal. A playbook presets the flow and a handful of switches (levers);
// owners pick a goal, not a process. Deliberately small: no workflow builder.

export const PLAYBOOKS = {
  fill_chair: {
    name: "Fill the chair", goal: "Don't lose walk-ins", flow: "walk_in",
    for: "Barbers, salons, walk-in clinics",
    levers: { deposit_cents: 0, waitlist_offer: true, rebook_weeks: 0, now_serving: true, addons: [] },
    metric: "Walkaways avoided"
  },
  no_empty_slots: {
    name: "No empty slots", goal: "Make every booking show up", flow: "appointment",
    for: "Dentists, physio, salons, lessons",
    levers: { deposit_cents: 2000, waitlist_offer: true, rebook_weeks: 0, now_serving: false, addons: [] },
    metric: "No-show rate"
  },
  faster_mornings: {
    name: "Faster mornings", goal: "Get through the rush", flow: "appointment",
    for: "Ski and bike rentals, campus offices, service desks",
    levers: { deposit_cents: 0, waitlist_offer: false, rebook_weeks: 0, now_serving: true, addons: [] },
    metric: "Checked in ahead"
  },
  ready_on_time: {
    name: "Ready when promised", goal: "Hand work back on time", flow: "dropoff",
    for: "Auto shops, repairs, tailors",
    levers: { deposit_cents: 0, waitlist_offer: false, rebook_weeks: 0, now_serving: false, addons: [] },
    metric: "Average time to ready"
  },
  regulars: {
    name: "Regulars", goal: "Bring them back", flow: "walk_in",
    for: "Gyms, spas, groomers, tattoo studios",
    levers: { deposit_cents: 0, waitlist_offer: false, rebook_weeks: 4, now_serving: false, addons: [] },
    metric: "Rebook rate"
  },
  signed_ahead: {
    name: "Signed before arrival", goal: "Get the paperwork right", flow: "forms_only",
    for: "Climbing gyms, rentals, events",
    levers: { deposit_cents: 0, waitlist_offer: false, rebook_weeks: 0, now_serving: false, addons: [] },
    metric: "Forms done ahead"
  }
};
export const PLAYBOOK_IDS = Object.keys(PLAYBOOKS);

// Best guess from the owner's sentence (or business type) when the AI doesn't pick one.
export function guessPlaybook(text) {
  const t = String(text || "").toLowerCase();
  if (/waiver|sign-?up|release|consent form|registration/.test(t)) return "signed_ahead";
  if (/repair|auto|mechanic|tire|tailor|drop ?off|pick ?up/.test(t)) return "ready_on_time";
  if (/ski|snowboard|bike rental|rental|registrar|campus|office|service desk|rush/.test(t)) return "faster_mornings";
  if (/gym|spa|groom|tattoo|membership|regular|massage/.test(t)) return "regulars";
  if (/dentist|dental|physio|appointment|booking|lesson|optometr/.test(t)) return "no_empty_slots";
  return "fill_chair";
}

const cents = (v, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0; };

export function cleanLevers(raw, playbook) {
  const d = PLAYBOOKS[playbook].levers;
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    deposit_cents: r.deposit_cents === undefined ? d.deposit_cents : cents(r.deposit_cents, 50000),
    waitlist_offer: r.waitlist_offer === undefined ? d.waitlist_offer : !!r.waitlist_offer,
    rebook_weeks: r.rebook_weeks === undefined ? d.rebook_weeks : Math.min(52, Math.max(0, Math.round(Number(r.rebook_weeks) || 0))),
    now_serving: r.now_serving === undefined ? d.now_serving : !!r.now_serving,
    addons: (Array.isArray(r.addons) ? r.addons : d.addons).slice(0, 6)
      .map((a) => ({ name: String(a?.name || "").trim().slice(0, 40), price_cents: cents(a?.price_cents, 100000) }))
      .filter((a) => a.name && a.price_cents)
  };
}

// Older locations were saved before playbooks existed; derive one so every location has levers.
export function playbookOf(config) {
  const id = PLAYBOOK_IDS.includes(config?.playbook) ? config.playbook : guessPlaybook(`${config?.business_type} ${config?.name}`);
  return { id, ...PLAYBOOKS[id], levers: config?.levers ? cleanLevers(config.levers, id) : cleanLevers(undefined, id) };
}

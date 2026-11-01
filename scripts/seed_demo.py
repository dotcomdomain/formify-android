"""Fill the live site with clearly labelled, fictional demo businesses across the target markets.

Usage: python scripts/seed_demo.py
Writes logins to DEMO_ACCOUNTS.local.md (git-ignored). Stops if a demo account already exists.
"""
import http.cookiejar as cj
import json
import secrets
import urllib.request as u

BASE = "https://getformify.pages.dev"

DEMOS = [
    ("Canopy Ridge Adventure Park", "canopy-ridge", "adventure park", "Treetop adventure park waiver for visitors with emergency contact and medical notes.", "Waiver", "#0369a1", "Zip lines and treetop courses. Sign your waiver before you arrive."),
    ("Harbourlight Motel", "harbourlight-motel", "motel", "Small motel guest check-in before arrival.", "Guest check-in", "#1d4ed8", "Finish check-in before you arrive."),
    ("Bayfront Charity Gala", "bayfront-gala", "event", "Event registration for a charity gala with guests and dietary needs.", "Registration", "#1e40af", "Register for this year's gala in two minutes."),
    ("Escarpment Physio", "escarpment-physio", "physiotherapy clinic", "New patient intake for a physiotherapy clinic.", "New patient intake", "#0284c7", "Complete your intake before your first visit."),
    ("Westdale Paws Grooming", "westdale-paws", "dog grooming", "Dog grooming salon, need vaccination status and any behaviour issues.", "New pet form", "#2563eb", "Tell us about your dog before the appointment."),
    ("Steeltown Device Repair", "steeltown-device", "phone repair", "Phone repair shop. Customers drop off devices.", "Device drop-off", "#1e3a8a", "Drop off your device and follow the repair."),
    ("Locke Street Barbers", "locke-barbers", "barbershop", "Barbershop with walk-ins.", "Walk-in line", "#1f2937", "Join the line from your phone."),
    ("Cedar Street Credit Co-op", "cedar-coop", "credit union", "New client onboarding for a credit union.", "New client request", "#0f4c81", "Tell us what you need and the right advisor will follow up."),
]


def call(op, method, path, body=None):
    req = u.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                    headers={"content-type": "application/json", "user-agent": "kiosk-seed"})
    try:
        with op.open(req, timeout=90) as r:
            return json.loads(r.read() or b"{}")
    except u.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code} {e.read().decode()[:200]}")


lines = []
for name, slug, kind, prompt, label, color, tagline in DEMOS:
    op = u.build_opener(u.HTTPCookieProcessor(cj.CookieJar()))
    email = f"demo-{slug}@formify.test"
    pw = secrets.token_urlsafe(12)
    call(op, "POST", "/api/biz/signup", {"email": email, "password": pw, "name": name})
    lines.append(f"- {name}: {email} / {pw}  ·  page {BASE}/p/{slug}")
    cfg = call(op, "POST", "/api/generate", {"prompt": prompt})["config"]
    cfg.update({"name": name, "business_type": kind, "city": "Hamilton, ON", "brand_color": color, "form_label": label, "listed": True})
    kid = call(op, "POST", "/api/kiosks", {"config": cfg, "source": "ai"})["id"]
    profile = {"tagline": tagline, "about": "Demo business for the Formify prototype. This business is fictional.", "city": "Hamilton, ON", "brand_color": color, "links": {}}
    call(op, "POST", "/api/biz/page", {"name": name, "slug": slug, "profile": profile, "forms": [{"id": kid, "label": label, "listed": True}]})
    print(name, kid, [f["label"] for s in cfg["steps"] for f in s["fields"]][:5])

with open("DEMO_ACCOUNTS.local.md", "a", encoding="utf-8") as fh:
    fh.write("\n## Market demo businesses (scripts/seed_demo.py, all fictional)\n" + "\n".join(lines) + "\n")

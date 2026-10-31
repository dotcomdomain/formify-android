"""Create the fictional auto shop used in the pitch demo, with two jobs already in the shop.

Usage: python scripts/seed_auto.py
Writes the login to DEMO_ACCOUNTS.local.md (git-ignored). Stops if the demo account already exists.
"""
import json
import secrets
import urllib.request as u
import http.cookiejar as cj

BASE = "https://getformify.pages.dev"
NAME = "Ironbridge Auto Service"
SLUG = "ironbridge-auto"
EMAIL = f"demo-{SLUG}@formify.test"
BRAND = "#1d4ed8"


def session():
    return u.build_opener(u.HTTPCookieProcessor(cj.CookieJar()))


def call(op, method, path, body=None):
    req = u.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                    headers={"content-type": "application/json", "user-agent": "kiosk-seed"})
    try:
        with op.open(req, timeout=60) as r:
            return json.loads(r.read() or b"{}")
    except u.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code} {e.read().decode()[:200]}")


def f(label, type_="text", required=True, sensitive=False, options=None):
    d = {"label": label, "type": type_, "required": required, "sensitive": sensitive}
    if options:
        d["options"] = options
    return d


CONFIG = {
    "name": NAME, "business_type": "auto repair", "brand_color": BRAND, "ticket_prefix": "R", "city": "Hamilton, ON", "avg_service_minutes": 60,
    "retention_days": 90, "notify": "Service desk", "listed": True, "playbook": "ready_on_time", "levers": {}, "form_label": "Vehicle drop-off",
    "welcome_title": "Drop off your vehicle", "welcome_subtitle": "Tell us what's going on. We'll keep you posted and ask before doing extra work.",
    "consent_text": "We use these details to work on your vehicle and keep you updated. Deleted after 90 days.",
    "done_message": "Thanks! Leave your keys at the service desk. We'll update you here.",
    "steps": [
        {"title": "You", "fields": [f("Name"), f("Mobile phone", "tel", sensitive=True)]},
        {"title": "Your vehicle", "fields": [f("Year, make and model"), f("Licence plate", required=False),
                                             f("What do you need done?", "select", options=["Oil change", "Brakes", "Tires", "Check engine light", "Strange noise", "Something else"]),
                                             f("Tell us more", "textarea", required=False)]},
    ],
}
PROFILE = {"tagline": "Honest repairs, with your OK before any extra work", "about": "An independent neighbourhood garage. Drop off your vehicle, follow the work from your phone and approve anything extra before we start.",
           "address": "123 Example St, Hamilton, ON", "city": "Hamilton, ON", "phone": "905-555-0176", "hours": "Mon-Fri 7:30am-5:30pm\nSat 8am-1pm\nSun closed", "brand_color": BRAND,
           "links": {"google_reviews": "https://www.google.com/maps", "website": "example.com"}}

op = session()
pw = secrets.token_urlsafe(12)
call(op, "POST", "/api/biz/signup", {"email": EMAIL, "password": pw, "name": NAME})
with open("DEMO_ACCOUNTS.local.md", "a", encoding="utf-8") as fh:
    fh.write(f"\n## Pitch demo shop (scripts/seed_auto.py)\n- {NAME}: {EMAIL} / {pw}  ·  page {BASE}/p/{SLUG}\n")

kid = call(op, "POST", "/api/kiosks", {"config": CONFIG, "source": "template"})["id"]
call(op, "POST", "/api/biz/page", {"name": NAME, "slug": SLUG, "profile": PROFILE, "forms": [{"id": kid, "label": "Vehicle drop-off", "listed": True}]})

form = call(op, "GET", f"/api/kiosks/{kid}")["config"]
ids = {x["label"]: x["id"] for s in form["steps"] for x in s["fields"]}


def job(name, car, work, notes):
    answers = {ids["Name"]: name, ids["Mobile phone"]: "905-555-0100", ids["Year, make and model"]: car, ids["What do you need done?"]: work, ids["Tell us more"]: notes}
    return call(session(), "POST", f"/api/kiosks/{kid}/checkins", {"answers": answers, "consent": True, "channel": "kiosk"})


job("Priya S.", "2017 Honda Civic", "Oil change", "Also due for a tire rotation.")
job("Marcus T.", "2015 Ford Escape", "Check engine light", "Came on yesterday. Car runs fine.")
live = call(op, "GET", f"/api/kiosks/{kid}/checkins")
first, second = sorted((c for c in live["checkins"]), key=lambda c: c["id"])[:2]
call(op, "PATCH", f"/api/checkins/{first['id']}", {"status": "serving"})
call(op, "PATCH", f"/api/checkins/{first['id']}", {"status": "ready"})
call(op, "PATCH", f"/api/checkins/{second['id']}", {"status": "serving"})
print(f"{NAME}: {BASE}/p/{SLUG}, form {kid}, 2 jobs in the shop. Login saved to DEMO_ACCOUNTS.local.md")

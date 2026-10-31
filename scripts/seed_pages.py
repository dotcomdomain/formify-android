"""Give each demo location its own business account and public page, with extra forms.

Usage: python scripts/seed_pages.py
Creates fictional demo businesses, writes their logins to DEMO_ACCOUNTS.local.md (git-ignored),
reassigns the seeded kiosks to them, adds extra forms, and publishes each business page.
Social links are placeholders (example handles / example.com).
"""
import json
import secrets
import subprocess
import urllib.request as u
import http.cookiejar as cj

BASE = "https://getformify.pages.dev"


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


def form(base, **over):
    c = dict(base)
    c.update(over)
    return c


BARBER = {"name": "Corner Chair Barbershop", "business_type": "barber", "brand_color": "#1f2937", "ticket_prefix": "N", "city": "Hamilton, ON",
          "avg_service_minutes": 20, "retention_days": 30, "notify": "Barbers", "listed": True}
SKI = {"name": "Northline Ski Rentals", "business_type": "ski rental", "brand_color": "#0369a1", "ticket_prefix": "L", "city": "Collingwood, ON",
       "avg_service_minutes": 5, "retention_days": 30, "notify": "Rental counter", "listed": True}

BUSINESSES = [
    {"kiosk": "98f4a07b", "slug": "cornerchair", "name": "Corner Chair Barbershop",
     "profile": {"tagline": "Fades, beard trims and walk-ins, six days a week", "about": "A neighbourhood barbershop near campus. Join the line from your phone and come in when your chair is almost ready.",
                 "address": "123 Example St, Hamilton, ON", "city": "Hamilton, ON", "phone": "905-555-0142", "hours": "Mon-Fri 10am-7pm\nSat 9am-5pm\nSun closed", "brand_color": "#1f2937",
                 "links": {"instagram": "@example", "tiktok": "@example", "google_reviews": "https://www.google.com/maps", "website": "example.com"}},
     "labels": {"98f4a07b": "Walk-in line"},
     "extra": [
         ("New client consultation", form(BARBER, ticket_prefix="C", welcome_title="New client consultation", welcome_subtitle="First time here? Tell us what you're after so your barber is ready.",
             consent_text="We keep your style notes and phone so your barber can prepare. Deleted after 30 days.", done_message="Thanks! We'll see you soon.",
             steps=[{"title": "About you", "fields": [f("Name"), f("Phone for a text when it's your turn", "tel", required=False, sensitive=True)]},
                    {"title": "Your style", "fields": [f("What are you looking for?", "select", options=["Fade", "Taper", "Scissor cut", "Buzz", "Beard shape-up", "Not sure yet"]),
                                                       f("Hair or scalp sensitivities", "text", required=False, sensitive=True), f("Anything else your barber should know", "textarea", required=False)]}])),
         ("Kids cut", form(BARBER, ticket_prefix="K", avg_service_minutes=15, welcome_title="Kids cut", welcome_subtitle="Ages 12 and under. A parent or guardian fills this in.",
             consent_text="We use the parent's name and phone only to call you up. Deleted after 30 days.", done_message="You're in line. Bring them in when it's almost your turn.",
             steps=[{"title": "Kids cut", "fields": [f("Parent or guardian name"), f("Child's first name"), f("Child's age", "number"),
                                                     f("Phone for a text when it's your turn", "tel", required=False, sensitive=True)]}])),
     ]},
    {"kiosk": "bc9d851c", "slug": "northline-ski", "name": "Northline Ski Rentals",
     "profile": {"tagline": "Skis, boards and lessons. Skip the rental line.", "about": "Fill in your rental and lesson forms the night before, then walk straight to the express counter.",
                 "address": "1 Example Rd, Collingwood, ON", "city": "Collingwood, ON", "phone": "705-555-0187", "hours": "Daily 8am-5pm in season", "brand_color": "#0369a1",
                 "links": {"instagram": "@example", "facebook": "https://www.facebook.com/", "google_reviews": "https://www.google.com/maps", "website": "example.com"}},
     "labels": {"bc9d851c": "Ski & snowboard rental"},
     "extra": [
         ("Lesson sign-up", form(SKI, ticket_prefix="S", avg_service_minutes=6, welcome_title="Lesson sign-up", welcome_subtitle="Group and private lessons for every level.",
             consent_text="We use these details to place you in the right lesson group. Deleted after 30 days.", done_message="You're signed up. Meet your instructor at the lesson bell.",
             steps=[{"title": "Lesson", "fields": [f("Full name"), f("Age", "number"), f("Lesson type", "select", options=["Group lesson", "Private lesson", "Kids camp"]),
                                                   f("Ability", "select", options=["First time", "Beginner", "Intermediate", "Advanced"]), f("Emergency contact phone", "tel", sensitive=True)]}])),
         ("Rental waiver", form(SKI, ticket_prefix="W", avg_service_minutes=2, welcome_title="Rental waiver", welcome_subtitle="Sign the release before you pick up your gear.",
             consent_text="We keep your signed waiver for the season as required for rentals.", done_message="Waiver signed. You're good to go.",
             steps=[{"title": "Waiver", "fields": [f("Full name"), f("Date of birth", "date", sensitive=True),
                                                   f("I understand skiing and snowboarding involve risk of injury", "checkbox"), f("I accept the rental agreement and release", "checkbox")]}])),
     ]},
    {"kiosk": "b953a2f2", "slug": "maplelane-clinic", "name": "Maple Lane Family Clinic",
     "profile": {"tagline": "Family doctors and walk-in care", "about": "Check in from home and we'll text you when it's almost your turn.", "city": "Hamilton, ON", "hours": "Mon-Fri 8am-6pm\nSat 9am-1pm", "brand_color": "#0f766e",
                 "links": {"website": "example.com"}}, "labels": {"b953a2f2": "Walk-in and appointment check-in"}, "extra": []},
    {"kiosk": "303ac7a4", "slug": "lantern-noodle", "name": "Lantern Noodle Bar",
     "profile": {"tagline": "Hand-pulled noodles. Join the waitlist from anywhere.", "city": "Hamilton, ON", "hours": "Tue-Sun 11:30am-10pm", "brand_color": "#c2410c",
                 "links": {"instagram": "@example"}}, "labels": {"303ac7a4": "Join the waitlist"}, "extra": []},
    {"kiosk": "d3394301", "slug": "terminal-desk", "name": "Terminal Assistance Desk",
     "profile": {"tagline": "Bag drop and travel help", "city": "Hamilton, ON", "brand_color": "#4338ca", "links": {}}, "labels": {"d3394301": "Assistance check-in"}, "extra": []},
]

lines = []
for b in BUSINESSES:
    op = session()
    email = f"demo-{b['slug']}@formify.test"
    pw = secrets.token_urlsafe(12)
    call(op, "POST", "/api/biz/signup", {"email": email, "password": pw, "name": b["name"]})
    me = call(op, "GET", "/api/biz/me")
    bid = me["business"]["id"]
    # Move the existing demo kiosk to this business (no API for transfers, so straight to D1).
    subprocess.run(["npx", "wrangler", "d1", "execute", "kiosk-setup", "--remote", "-y", "--command",
                    f"UPDATE kiosks SET owner_id = '{bid}' WHERE id = '{b['kiosk']}'"], check=True, capture_output=True, shell=True)
    labels = dict(b["labels"])
    for label, cfg in b["extra"]:
        kid = call(op, "POST", "/api/kiosks", {"config": cfg, "source": "template"})["id"]
        labels[kid] = label
    page = call(op, "GET", "/api/biz/page")
    order = [b["kiosk"]] + [fid for fid in labels if fid != b["kiosk"]]
    forms = [{"id": fid, "label": labels.get(fid, ""), "listed": True} for fid in order if any(x["id"] == fid for x in page["forms"])]
    call(op, "POST", "/api/biz/page", {"name": b["name"], "slug": b["slug"], "profile": b["profile"], "forms": forms})
    lines.append(f"- {b['name']}: {email} / {pw}  ·  page {BASE}/p/{b['slug']}  ·  {len(forms)} forms")
    print(f"{b['name']}: page {BASE}/p/{b['slug']} with {len(forms)} forms")

with open("DEMO_ACCOUNTS.local.md", "a", encoding="utf-8") as fh:
    fh.write("\n## One account per demo business (scripts/seed_pages.py)\nSign in at " + BASE + "/business.html. Each owns its own page and forms.\n" + "\n".join(lines) + "\n")

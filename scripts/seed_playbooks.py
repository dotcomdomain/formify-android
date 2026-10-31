"""Give each demo location a playbook and switches (run after seed_pages.py).

Usage: python scripts/seed_playbooks.py
Reads the demo logins from DEMO_ACCOUNTS.local.md (git-ignored).
"""
import json
import re
import urllib.request as u
import http.cookiejar as cj

BASE = "https://getformify.pages.dev"
CREDS = open("DEMO_ACCOUNTS.local.md", encoding="utf-8").read()

# business name -> {form label: (playbook, levers overrides)}
PLAN = {
    "Corner Chair Barbershop": {
        "Walk-in line": ("fill_chair", {"addons": [{"name": "Hot towel finish", "price_cents": 800}]}),
        "New client consultation": ("regulars", {"rebook_weeks": 4}),
        "Kids cut": ("fill_chair", {}),
    },
    "Northline Ski Rentals": {
        "Ski & snowboard rental": ("faster_mornings", {"addons": [{"name": "Helmet", "price_cents": 1500}, {"name": "Goggles", "price_cents": 1000}]}),
        "Lesson sign-up": ("no_empty_slots", {"deposit_cents": 2000}),
        "Rental waiver": ("signed_ahead", {}),
    },
    "Maple Lane Family Clinic": {"*": ("fill_chair", {})},
    "Lantern Noodle Bar": {"*": ("fill_chair", {"waitlist_offer": True})},
    "Terminal Assistance Desk": {"*": ("faster_mornings", {})},
}


def session():
    return u.build_opener(u.HTTPCookieProcessor(cj.CookieJar()))


def call(op, method, path, body=None):
    req = u.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                    headers={"content-type": "application/json", "user-agent": "kiosk-seed"})
    with op.open(req, timeout=60) as r:
        return json.loads(r.read() or b"{}")


for biz, forms in PLAN.items():
    m = re.search(re.escape(biz) + r": (\S+) / (\S+)", CREDS)
    op = session()
    call(op, "POST", "/api/biz/login", {"email": m.group(1), "password": m.group(2)})
    page = call(op, "GET", "/api/biz/page")
    for f in page["forms"]:
        label = f["label"] or f["fallback"]
        pb, levers = forms.get(label) or forms.get("*")
        cfg = call(op, "GET", f"/api/kiosks/{f['id']}")["config"]
        # The ski template's old helmet checkbox becomes a real add-on.
        for st in cfg["steps"]:
            st["fields"] = [x for x in st["fields"] if not x["label"].lower().startswith("add a helmet")]
        cfg["steps"] = [st for st in cfg["steps"] if st["fields"]]
        cfg["playbook"] = pb
        cfg.pop("flow", None)
        cfg["levers"] = levers
        call(op, "PUT", f"/api/kiosks/{f['id']}", {"config": cfg})
        print(f"{biz} / {label}: {pb} {levers or ''}")

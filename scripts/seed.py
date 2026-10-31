"""Seed demo businesses for the finder and run each through a real visit + rating.

Usage: python scripts/seed.py [base_url] [name filters...]
Every business is fictional. Ratings come from test visits made by this script.
"""
import json
import sys
import urllib.request as u

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://kiosk-setup.pages.dev"


def call(method, path, body=None):
    req = u.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                    headers={"content-type": "application/json", "user-agent": "kiosk-seed"})
    with u.urlopen(req, timeout=60) as r:
        return json.load(r)


def f(label, type_="text", required=True, sensitive=False, options=None):
    d = {"label": label, "type": type_, "required": required, "sensitive": sensitive}
    if options:
        d["options"] = options
    return d


BUSINESSES = [
    {
        "config": {
            "name": "Maple Lane Family Clinic", "business_type": "clinic", "brand_color": "#0f766e", "ticket_prefix": "C",
            "city": "Hamilton, ON", "welcome_title": "Welcome to Maple Lane Family Clinic",
            "welcome_subtitle": "Check in for your appointment in under a minute.",
            "consent_text": "Your answers go only to the clinic's front desk to prepare for your visit. They are deleted after 30 days.",
            "steps": [
                {"title": "About you", "fields": [f("Full name"), f("Date of birth", "date", sensitive=True), f("Health card number", sensitive=True)]},
                {"title": "Your visit", "fields": [f("Appointment type", "select", options=["Booked appointment", "Walk-in", "Prescription renewal", "Lab results"]),
                                                   f("Main reason for your visit", "textarea", required=False, sensitive=True)]},
            ],
            "done_message": "You're checked in. Please take a seat and we'll call your number.", "notify": "Front desk",
            "avg_service_minutes": 12, "retention_days": 30, "website": "example.com",
        },
        "answers": {"full_name": "Test Visitor", "date_of_birth": "2001-04-02", "health_card_number": "0000-000-000-XX",
                    "appointment_type": "Walk-in", "main_reason_for_your_visit": "Prescription question"},
        "ratings": [5, 4, 5],
    },
    {
        "config": {
            "name": "Lantern Noodle Bar", "business_type": "restaurant", "brand_color": "#c2410c", "ticket_prefix": "R",
            "city": "Hamilton, ON", "welcome_title": "Join the waitlist", "welcome_subtitle": "Order ahead while you wait for a table.",
            "consent_text": "We use your name and phone only to text you when your table is ready. Deleted after 7 days.",
            "steps": [
                {"title": "Your party", "fields": [f("Name"), f("Party size", "number"), f("Phone for table text", "tel", required=False, sensitive=True)]},
                {"title": "Order ahead", "fields": [f("Starter", "select", required=False, options=["None", "Gyoza", "Edamame", "Spring rolls"])]},
            ],
            "done_message": "You're on the list. We'll text you when your table is ready.", "notify": "Host stand",
            "avg_service_minutes": 8, "retention_days": 7, "instagram": "@example",
        },
        "answers": {"name": "Test Visitor", "party_size": "3", "starter": "Gyoza"},
        "ratings": [4, 3],
    },
    {
        "config": {
            "name": "Terminal Assistance Desk", "business_type": "airport", "brand_color": "#4338ca", "ticket_prefix": "T",
            "city": "Hamilton, ON", "welcome_title": "Need help with your trip?", "welcome_subtitle": "Check in for bag drop or travel assistance.",
            "consent_text": "Your details go only to the assistance desk and are deleted after 2 days.",
            "steps": [
                {"title": "Your flight", "fields": [f("Last name"), f("Flight number"), f("Number of checked bags", "number")]},
                {"title": "Assistance", "fields": [f("Help needed", "select", options=["Bag drop only", "Wheelchair", "Rebooking", "Lost item", "Other"])]},
            ],
            "done_message": "You're checked in. An agent will call your number shortly.", "notify": "Assistance desk",
            "avg_service_minutes": 6, "retention_days": 2,
        },
        "answers": {"last_name": "Visitor", "flight_number": "XX123", "number_of_checked_bags": "1", "help_needed": "Wheelchair"},
        "ratings": [5],
    },
]

BUSINESSES += [
    {
        "config": {
            "name": "Northline Ski Rentals", "business_type": "ski rental", "brand_color": "#0369a1", "ticket_prefix": "S",
            "city": "Collingwood, ON", "welcome_title": "Skip the rental line",
            "welcome_subtitle": "Fill in your ski or snowboard rental tonight and walk straight to the express counter.",
            "consent_text": "We use your height, weight and skier type only to fit and set your equipment. Deleted after 30 days.",
            "steps": [
                {"title": "About you", "fields": [f("Full name"), f("Height (cm)", "number"), f("Weight (kg)", "number", sensitive=True),
                                                  f("Boot size (US)", "number")]},
                {"title": "Your rental", "fields": [f("Rental package", "select", options=["Ski package", "Snowboard package", "Skis only", "Boots only"]),
                                                    f("Skier type", "select", options=["Type 1: cautious", "Type 2: moderate", "Type 3: aggressive"]),
                                                    f("Add a helmet ($15)", "checkbox", required=False),
                                                    f("I accept the rental waiver", "checkbox")]},
            ],
            "done_message": "You're set. Head to the express counter and show your number.", "notify": "Rental counter",
            "avg_service_minutes": 4, "retention_days": 30, "website": "example.com",
        },
        "answers": {"full_name": "Test Visitor", "height_cm": "178", "weight_kg": "75", "boot_size_us": "10",
                    "rental_package": "Ski package", "skier_type": "Type 2: moderate", "add_a_helmet_15": True, "i_accept_the_rental_waiver": True},
        "ratings": [5, 5, 4, 5],
        "amount": 89,
    },
    {
        "config": {
            "name": "Corner Chair Barbershop", "business_type": "barber", "brand_color": "#1f2937", "ticket_prefix": "B",
            "city": "Hamilton, ON", "welcome_title": "Grab a spot in line", "welcome_subtitle": "Join the line from your phone and come in when it's almost your turn.",
            "consent_text": "We use your name and phone only to text you when your chair is ready. Deleted after 7 days.",
            "steps": [
                {"title": "Your cut", "fields": [f("Name"), f("Service", "select", options=["Haircut", "Fade", "Beard trim", "Haircut + beard"]),
                                                 f("Preferred barber", "select", options=["First available", "Sam", "Alex"]),
                                                 f("Phone for a text when it's your turn", "tel", required=False, sensitive=True)]},
            ],
            "done_message": "You're in line. We'll text you when your chair is almost ready.", "notify": "Barbers",
            "avg_service_minutes": 25, "retention_days": 7, "instagram": "@example",
        },
        "answers": {"name": "Test Visitor", "service": "Fade", "preferred_barber": "First available"},
        "ratings": [5, 4],
        "amount": 35,
    },
]

only = [a for a in sys.argv[2:]]
for b in BUSINESSES:
    if only and not any(o.lower() in b["config"]["name"].lower() for o in only):
        continue
    kid = call("POST", "/api/kiosks", {"config": b["config"], "source": "template"})["id"]
    for score in b["ratings"]:
        visit = call("POST", f"/api/kiosks/{kid}/checkins", {"answers": b["answers"], "consent": True, "channel": "phone", "language": "en"})
        call("POST", f"/api/visit/{visit['token']}")
        cid = next(c["id"] for c in call("GET", f"/api/kiosks/{kid}/checkins")["checkins"] if c["ticket"] == visit["ticket"])
        if b.get("amount"):
            call("PATCH", f"/api/checkins/{cid}", {"status": "payment", "amount": b["amount"]})
            call("POST", f"/api/visit/{visit['token']}/pay")
        else:
            call("PATCH", f"/api/checkins/{cid}", {"status": "done"})
        call("POST", f"/api/visit/{visit['token']}/rate", {"score": score, "comment": "Seed test visit"})
    print(f"{b['config']['name']}: id={kid}  kiosk={BASE}/kiosk.html?id={kid}  dash={BASE}/dash.html?id={kid}  page={BASE}/b.html?id={kid}")

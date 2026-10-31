# Universal Kiosk Setup (P2P Hacks 2026)

A business fills out one form (what the kiosk is for, branding, fields, hardware) and gets a working kiosk: a locked-down web app on a tablet or screen, plus an admin dashboard.

## Who buys it
Small and mid-size businesses that need a front-desk or self-serve screen but have no IT team: clinics, gyms, offices, dealerships, campus services, event venues.

## Use cases (templates)
- Visitor / patient check-in
- Self-order or queue ticket
- Feedback / survey
- Info / wayfinding display

## Validation notes (GitHub, 2026-10-30)
| Repo | Stars | What it shows |
|---|---|---|
| RushB-fr/freekiosk | ~700 | Strong demand for tablet lockdown. It only locks the device; you still have to build the app. |
| debloper/xiosk | ~350 | Raspberry Pi kiosk setup with a web UI. Shows web pages only, nothing interactive. |
| NemesisRE/kiosk-mode | ~800 | People want to turn existing dashboards into kiosks. |
| sinmb79/22B-Kiosk | ~16 | Self-order kiosk builder, restaurants only. |
| TheSwanFactory/self-service-kiosk | ~2 | Pitched as the "WordPress.com of kiosk software", inactive since 2024. Same idea, never shipped. |
| Visitor management apps (several) | 20-45 | Each one is single-purpose and built from scratch. |

Takeaway: the lockdown layer (FreeKiosk, Fully Kiosk Browser) and single-purpose apps already exist. What's missing is the "form in, configured kiosk out" step that a non-technical business can do on its own.

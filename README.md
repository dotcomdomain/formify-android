# Formify (P2P Hacks 2026)

**Fortify your business with Formify.** From searching to filling to the front desk to the cashier: one simple pipeline between businesses and their customers.

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

## Live
- For businesses (builder): https://getformify.pages.dev
- For customers (form finder): https://getformify.pages.dev/find.html
- My info (wallet, stored on the phone only): https://getformify.pages.dev/me.html
- Demo businesses (fictional, seeded by `scripts/seed.py`):
  - Maple Lane Family Clinic: kiosk `/kiosk.html?id=b953a2f2`, dashboard `/dash.html?id=b953a2f2`, page `/b.html?id=b953a2f2`
  - Lantern Noodle Bar: `303ac7a4`
  - Terminal Assistance Desk: `d3394301`

## Platform
Two sides. Businesses create a check-in page from one sentence and pay per location. Customers are free: they find a business, check in from their phone before arriving, keep their details in a wallet on their own phone, and rate how easy the visit was (Ease Score).

| Tier | Price (to validate) | Includes |
|---|---|---|
| Free | $0 | 1 form, QR code, finder listing |
| Pro | ~$49 / location / month | Kiosk, AI voice + card scan, dashboard, handoff notes |
| Insights | ~$149 / location / month | Anonymised benchmarks vs. similar businesses, staffing forecast, review tools |

We never sell customer data. Insights are aggregated and anonymised; each business only sees its own visitors.

## How it works
- `public/index.html`: owner describes the business, AI drafts the kiosk, owner edits (incl. public page links) and approves.
- `public/kiosk.html`: tablet check-in with a "Skip the line" QR code and arrival-code entry.
- `public/go.html` + `visit.html`: phone check-in, live place in line, "I'm here", post-visit Ease rating. Review links are shown to every visitor regardless of score (no review gating).
- `public/find.html`, `b.html`, `me.html`: form finder, business page, customer wallet.
- `public/dash.html`: queue with AI handoff notes and flags, Ease Score + private feedback, check-ins by hour, audit log.
- AI (Workers AI): Llama 3.3 70B (generator, voice-to-form, handoff note), Whisper large v3 turbo (speech, any language), Llama 4 Scout (card scan, photo never stored), Deepgram Aura-2 (spoken replies).
- D1 database `kiosk-setup`: `schema.sql`, then `migrations_002.sql`, `migrations_003.sql`.

## The pipeline
Search ("ski", "haircut") -> business page -> fill in on your phone (form, AI assistant, voice, card scan, saved info) -> arrival code / "I'm here" -> front desk queue with AI handoff note -> staff alerts ("Need help", emergencies the assistant detects) -> cashier sends the total -> customer pays on their phone (demo, no card charged) -> Ease rating.

## MCP server (AI agents can check people in)
Endpoint: `https://getformify.pages.dev/mcp` (Streamable HTTP, JSON responses). Tools: `search_businesses`, `get_checkin_form`, `check_in` (requires `user_confirmed: true`), `get_visit_status`.

```
claude mcp add --transport http formify https://getformify.pages.dev/mcp
```
Then ask Claude: "Find a ski rental on Formify and check me in for tomorrow."

## Deploy
```
npx wrangler pages deploy --branch main            # getformify.pages.dev
npx wrangler pages deploy --branch main --project-name kiosk-setup   # old URL, keeps existing links working
```
Schema changes: `npx wrangler d1 execute kiosk-setup --remote --file schema.sql`

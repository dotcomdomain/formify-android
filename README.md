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
- **Formify** (customers): https://getformify.pages.dev — tabs: Search, Assistant, You
- **Formify for Business**: https://getformify.pages.dev/business.html — sign in, then Live, Forms, Insights, Settings
- Kiosk for a tablet: `/kiosk.html?id=<location>` · phone link / QR target: `/go.html?id=<location>` · visitor status: `/visit.html#<token>`
- Demo business login: see `DEMO_ACCOUNTS.local.md` (git-ignored, local only). It owns the seeded demo locations.

## Accounts and privacy
- Businesses sign in (PBKDF2 password hashing, HttpOnly session cookie). Queue, alerts, payments, edits and publishing are owner-only.
- Customers don't need an account: their info stays on the device. An optional account syncs it across devices, encrypted with AES-GCM (key in the `PROFILE_KEY` Pages secret). "Delete my account" removes it and unlinks past visits.
- Business logins are members with roles: owner (everything + People), manager (forms + insights), staff (live front desk). Sensitive-data reveals and money actions are logged with the member's name.
- Payments: Stripe Checkout in test mode when `STRIPE_SECRET_KEY` (an `sk_test_` key) is set as a Pages secret; the server confirms with Stripe before marking a ticket paid. Live keys are refused. Without a key the phone Pay button is a demo.
- Themes: warm (default) and blue, per device; `?theme=blue` on any link switches it.
- Customer data is never sold. Insights are per business, own visitors only.

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

## Live CRM insights

Business > Insights reads live D1 records for the selected location, refreshes every
30 seconds while visible, and supports 7-, 30- and 90-day windows. It shows visit
volume and completion, identified customer cohorts, wait times, payment records,
no-shows, private feedback, check-in channels and anonymous form activity. Follow-up
cards and a ticket list highlight unread messages, deletion requests, unpaid visits,
low ratings and pickups ready to complete. Actions open Live for staff to review;
no customer messages are sent automatically.

`GET /api/kiosks/:id/insights?days=30` requires an owner or manager of that business.
Queries exclude expired and future visit records, keep data isolated by location,
and aggregate customer IDs without returning form answers. Charts use UTC and
include partial days. Repeat customers are signed-in accounts with multiple visit
records in retained history; anonymous visits are not counted as distinct customers.
Previous-period comparisons appear only when the full previous period is within
retention and the location already existed. Missing averages show no value rather
than a fabricated zero.

Payments are CAD amounts recorded against visits created in the selected period,
including counter entries and demo/test transactions. Deposits are separate from
final totals. Anonymous event counts are not presented as a session conversion
rate, and rebook clicks are not confirmed bookings. CSV export now honors both
the selected period and the form's retention setting.

No new analytics migration is needed beyond the existing schema through migration
009. Document import separately requires migration 010 below. SQL tests execute
the production queries against SQLite with migrated fixtures covering period
boundaries, business isolation, customer cohorts and follow-up counts.

## Deploy

### Document import

In Business > Forms > New form, choose **Import a document**. Recreate an existing
form or generate questions based on a document. Owners and managers can import
PDF, DOCX, PNG, JPEG, WebP, UTF-8 TXT/Markdown/CSV, XLSX and ODT files up to 5 MiB.
Text-based imports are limited to 30,000 extracted characters. The existing form
format supports five sections, eight questions per section and twelve choices per
select. Oversized or incomplete conversion results return errors instead of
silently truncating questions. Unsupported signatures, attachments and conditional
logic are called out in review notes; they are not implemented by this importer.

The importer uses the existing Workers AI binding: Markdown conversion for rich
documents, Llama 4 Scout directly for images, and the text model for extracted
content. It returns a draft to the existing editor, including editable section and
question instructions, choice options and review notes. Publishing requires the
owner to confirm they checked the draft. Imports default to forms-only mode with
no deposits or add-ons. Scans and handwriting need careful review; encrypted PDFs
and legacy `.doc` files should be exported to a supported format first.

Formify does not persist uploaded originals or extracted text. Files are sent to
Cloudflare AI for conversion, and only approved form configuration is saved at
publish time. `migrations_010.sql` adds an atomic per-business limit of five import
attempts per ten-minute window. Apply it **before deploying this feature**:

```sh
npx wrangler d1 execute kiosk-setup --remote --file migrations_010.sql
```

Local contract tests use mocked AI responses; they do not measure live extraction
quality. Run them with Node 22+ and Python 3:

```sh
node --test tests/*.test.mjs
python -m unittest discover -s tests -p "*_test.py"
```

### Publish

```
npx wrangler pages deploy --branch main            # getformify.pages.dev
npx wrangler pages deploy --branch main --project-name kiosk-setup   # old URL, keeps existing links working
```
Schema changes: `npx wrangler d1 execute kiosk-setup --remote --file schema.sql`

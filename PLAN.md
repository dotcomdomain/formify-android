# Weekend plan

## Pitch in one line
A business describes its front desk in one sentence; AI builds the check-in kiosk, and it runs on any tablet within minutes.

## Scope
- Demo vertical: clinic check-in (full flow).
- Show restaurants and airports as templates generated live, to prove "universal". Restaurants are crowded (Square, Toast) and airports buy from big vendors, so both stay on the roadmap slide.

## What we build
1. **Generator (AI):** sentence in, kiosk config JSON out (steps, fields, language, branding, what happens after check-in). Owner edits before publishing.
2. **Kiosk app:** full-screen web app that renders any config. Runs on a tablet or laptop; device lockdown via FreeKiosk / Fully Kiosk.
3. **Admin dashboard:** live queue, wait time, check-ins per hour, export.
4. **Guardrails:** consent screen, minimal data collected, audit log of config changes, data retention setting.

## Who does what
- Eng 1: generator + config schema
- Eng 2: kiosk renderer + tablet setup
- Eng 3: dashboard + deploy
- MBA 1: customer calls (3+ clinics/businesses), market sizing, pricing
- MBA 2: deck, story, competitor slide, pitch rehearsal

## Timeline
| When | Eng | MBA |
|---|---|---|
| Fri 9-11pm | Lock scope, config schema, deploy hello-world | Problem statement, competitor list, call list |
| Sat 9:30-12:30 | Generator + kiosk renderer working end to end | Call clinics/restaurants, collect quotes and numbers |
| Sat 1:30-5 | Dashboard, guardrails, restaurant + airport templates | Pricing, market size, GTM. 3pm pitching workshop |
| Sat 6-9:30 | Polish, record backup demo, freeze features at 8pm | Deck done, two full rehearsals with the demo |
| Sun 9:45 | Submit deck + demo | |

## Pitch (5 min pitch + 2 min demo + 3 min Q&A)
1. Problem: front desk staff time spent on check-in, with a real quote/number from a call
2. Customer + market: independent clinics first, then other front desks
3. Solution + where AI is central
4. Demo: sentence -> kiosk -> check in on tablet -> dashboard updates -> generate restaurant kiosk in 10s
5. Business model: per kiosk per month, free pilot
6. GTM: 3 pilots (one on campus), then clinic associations / IT resellers
7. Guardrails: privacy, consent, audit trail
8. Team + ask

## Q&A prep
- How is this different from Jotform kiosk mode / Envoy / Square kiosks?
- What patient data do you store, and where?
- What if the AI generates a wrong or risky form?
- Who installs the tablet?
- What does a clinic pay today for the same job?

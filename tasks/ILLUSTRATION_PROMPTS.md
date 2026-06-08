# Repulabs — Illustration generation prompts (for GPT/DALL·E, bulk)

Paste the **STYLE BLOCK** first, then append one **SUBJECT** line per image. Generate one at a time.
Existing kit lives in `public/assets/repulabs/illustrations/` (24 already done — don't redo those).

## STYLE BLOCK (prepend to every prompt — keeps them cohesive)
> Modern, clean **flat-vector SaaS illustration** in a single consistent brand style: minimal flat
> shapes with **subtle depth** (soft long shadows, gentle gradients), rounded geometry, thin 2px line
> accents — premium and friendly, like Stripe / Linear / Notion marketing art. NOT cartoonish, NOT a
> 3D render, NOT photorealistic, NO people's faces in detail.
> **Palette (strict):** hero **signal-blue `#2563eb`** (tints `#eff6ff`, `#dbeafe`, deep `#1d4ed8`),
> cool-slate neutrals (`#0f172a`, `#475569`, `#64748b`, `#cbd5e1`), white / very-light surfaces
> (`#ffffff`, `#f7f8fb`); sparing accents of green `#16a34a` and amber `#f59e0b`. Blue is the hero.
> **Background:** flat very-light off-white `#f8fafc` (or transparent), no busy scene backdrop.
> **Composition:** ONE clear focal subject, centered, lots of negative space, ~3:2 landscape,
> **absolutely no text/letters/words** in the image, no browser/UI window frames.
> **Output:** high-res PNG ~1200×800.

## SUBJECTS — generate these (save as the filename shown, into `public/assets/repulabs/illustrations/`)

### A. Marketing home (highest impact — the premium public page)
1. `home-hero.png` — a friendly local storefront with a glowing 5-star review card floating above it and a phone showing a rising rating chart; sense of reputation growing.
2. `feat-reviews.png` — a stack of review cards with stars, one being replied to with a small AI sparkle.
3. `feat-ai-phone.png` — a phone/handset with soundwave + a small AI spark, an appointment calendar chip nearby (AI phone receptionist).
4. `feat-qr-nfc.png` — a QR plaque and an NFC card on a table, a phone tapping the card, a star floating up.
5. `feat-inbox.png` — a unified inbox: chat bubbles from Facebook/Instagram/SMS/Google merging into one column.
6. `feat-surveys.png` — a survey card with rating faces + a coupon ticket reward.
7. `feat-analytics.png` — a clean dashboard with a line chart trending up, a gauge, and a map pin (local SEO).
8. `feat-autopilot.png` — a friendly minimal robot/auto-pilot dial orchestrating small task icons in orbit.

### B. Module hero / spot art
9. `kb-brain.png` — a softly glowing brain made of connected nodes + a document feeding into it (AI knowledge base, trained).
10. `autopilot-hero.png` — same robot motif as #8 but wider, calmly managing loops (reply, request, post).
11. `seo-hero.png` — a local map with a 3-pack pin podium (#1/#2/#3) and an upward rank arrow.
12. `voice-review.png` — a phone call turning into a 5-star review (call bubble → star).

### C. Missing empty-states (match the existing *-empty kit)
13. `comments-empty.png` — a single social comment bubble, calm/empty.
14. `livechat-empty.png` — a website chat widget bubble at rest.
15. `automations-empty.png` — a simple rule/flow diagram (trigger → action) at rest.
16. `calendar-empty.png` — an empty content calendar grid with a small + add chip.

> **Naming/format note:** save as **`.png`** with the exact names above. If your tool can export
> **transparent** PNGs, do that (cleaner on cards); otherwise the `#f8fafc` background is fine. Once
> they're in the folder, tell me and I'll wire them into the marketing/module pages + (since the kit
> is currently `.svg`) flip the loader to accept `.png` for these names.

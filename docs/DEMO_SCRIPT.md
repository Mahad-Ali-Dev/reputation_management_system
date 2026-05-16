# Repulabs — 5-Minute Demo Script

Target audience: a local-business owner who's never seen the product. Goal: get them to "wow" 4 times in 5 minutes.

**Pre-record checklist:**
- [ ] Production deploy is green: `https://repuboost.io/api/health` returns `{"status":"ok"}`
- [ ] Stripe in test mode (or live, if KYC done)
- [ ] At least one seeded mock review on the demo org (use `npm run test:mock-review`)
- [ ] Google OAuth client has redirect URIs for both `app.repuboost.io/api/auth/callback/google` and `app.repuboost.io/api/connections/google/callback`
- [ ] One physical Review Stand on the desk (or printed QR + NFC sticker for the camera)
- [ ] Loom set to 1080p, mic check, second monitor for the customer-facing site

---

## Act 1 — The Hook (0:00 – 0:45)

**Screen:** `repuboost.io` marketing landing page.

> "Every local business owner I talk to has the same problem. They get great reviews — they
> just never reply to them. Or worse, they get a bad one and they don't know what to say.
> Repulabs is the AI sidekick that does both — and a few other things that turn out to matter
> just as much."

Click **Start free trial**. Magic-link login (use a pre-warmed email so it arrives instantly).

---

## Act 2 — The Onboarding Banner (0:45 – 1:15)

**Screen:** `/dashboard`. The OnboardingBanner is showing "Add your first establishment".

> "First time you sign in, it tells you exactly what to do next. No tour, no checklist with 19 items —
> just one card, one button. Once we add an establishment, it'll automatically move to the next step."

Click **Add establishment**. Fill in: "Acme Coffee", "Cafe", "Springfield, IL". Save.

Back on `/dashboard`, the banner now reads **Connect Google Business Profile**.

---

## Act 3 — The Review Reply Money Shot (1:15 – 2:45)

**Screen:** `/reviews` — pre-seeded with one 5-star and one 1-star review.

> "Here's where I usually pause the demo and ask people what they'd reply to that 1-star.
> Most people freeze. So let's see what Claude wrote in our brand voice."

Click the 1-star review. The drawer opens with the AI-drafted reply.

> "Notice three things. One, it doesn't argue. Two, it offers a path off the public review and
> into a private conversation. Three, it sounds like a human — not a corporate apology generator."

Click **Edit** if you want to tweak a word, then **Publish to Google**.

> "That just round-tripped to Google's API. Refresh the listing on the right monitor — done."

(Optional, if you have a real GBP connection): open the second monitor showing the live Google
business listing. The reply now appears under the review.

---

## Act 4 — The Physical Stand (2:45 – 3:30)

**Screen:** `/hardware`. Order page with the Review Stand product card.

> "AI on the screen is half the loop. The other half is the customers who already left happy.
> They're not coming back to your site to leave a review. So we ship them this."

Hold up the physical stand. Tap your phone on the NFC tag.

> "Tap — and they're at the Google review form for this specific location. No app, no install,
> no QR scanner, no friction. Each stand is signed cryptographically, so even if someone copies
> the URL off the sticker and tries to point it somewhere else, the redirect refuses."

(If demoing the activation flow): open `/activate`, paste the 8-character activation code from the
packaging, watch the stand bind to the establishment.

---

## Act 5 — The Chatbot + Analytics Closer (3:30 – 4:30)

**Screen:** `/ai`. Show the knowledge-base upload form.

> "Last piece. Your website probably gets people asking about hours, pricing, parking. You don't
> have time to answer those. So we built a chatbot that knows your business specifically."

Click **Open test page**. The widget loads in the bottom-right.

Ask it: "What are your hours?" — it answers from the seeded FAQ document.

Ask it: "What's the meaning of life?" — it gracefully says it doesn't know and offers to escalate.

> "It's retrieval-augmented, which is the boring engineer way of saying it can only use facts you
> uploaded. It can't make stuff up. That matters when it's your business name on the line."

**Screen:** `/analytics`. Show the 4 KPI tiles + reviews-per-day trend.

> "And everything you just saw — replies, scans, NPS, chatbot conversations — rolls up here.
> You glance at this once a week."

---

## Act 6 — The Close (4:30 – 5:00)

> "Trial is 7 days, no credit card. If you're good with hardware, those ship the same week.
> If you have one Google location, you're looking at $49 a month. Questions? Email me back."

End screen: `repuboost.io` with a clear CTA.

---

## Demo failure modes (and recovery)

| Thing that breaks | Recovery |
|---|---|
| Magic link doesn't arrive | Pre-warm a session in a different incognito window; switch tabs |
| Google OAuth fails | Use the mock-review pre-seeded org; skip the OAuth click, jump straight to `/reviews` |
| Anthropic API is down | The replies are already drafted in `review_replies` table; show the existing drafts |
| Production is down | Demo on `localhost:3000` instead. Most viewers won't notice — emphasize "this is the same code that's deployed" |
| Stripe checkout 500s | Skip the Pro upgrade click. The product is in trial mode anyway |

---

## Smoke-test script (run before recording)

```bash
# 1. Health
curl -sf https://repuboost.io/api/health | jq '.status'  # expect "ok"

# 2. Marketing renders
curl -sI https://repuboost.io | head -1  # expect "HTTP/2 200"

# 3. Security headers present
curl -sI https://app.repuboost.io/dashboard | grep -iE 'content-security-policy|x-frame-options'

# 4. Login page loads
curl -sI https://app.repuboost.io/login | head -1  # expect 200

# 5. Widget bundle loads
curl -sI https://app.repuboost.io/widget?key=test | head -1  # expect 200
```

All five green = ship the demo.

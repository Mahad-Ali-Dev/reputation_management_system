# Google OAuth verification — submission pack (repulabs.com)

Goal: get the "Connect your Google Business Profile" flow out of **Testing** so
any customer can connect and we can fetch reviews.

Two **separate** approvals are needed. Start both today — they queue independently.

| # | Approval | Where | Typical wait |
|---|---|---|---|
| 1 | **OAuth app verification** (sensitive scope) | Cloud Console → OAuth consent screen | 2–6 weeks |
| 2 | **Business Profile API access** | GBP API access request form | 1–4 weeks (start first) |

Without #2 the APIs return `PERMISSION_DENIED` even with a verified OAuth app.

---

## 0. Before you submit — the tier trap

Google verifies **per OAuth client**, and the tier follows the most privileged
scope that client requests:

| Scope | Tier | Cost |
|---|---|---|
| `business.manage` | Sensitive | Verification only |
| `gmail.readonly`, `gmail.send` | **Restricted** | Verification **+ CASA security assessment** (paid, months) |

**Action:** the main client must request `business.manage` + `openid/email/profile`
ONLY. Gmail moves to its own Cloud project via `GMAIL_OAUTH_CLIENT_ID` /
`GMAIL_OAUTH_CLIENT_SECRET` (see `lib/gmail/oauth-client.ts`).

- [ ] Gmail scopes **removed** from the main project's consent screen
- [ ] Second Cloud project created for Gmail; its client id/secret set in env

If Gmail scopes stay on the main consent screen, the whole app goes to the
restricted track and the business-connect launch stalls for months.

---

## 1. Consent screen fields

| Field | Value |
|---|---|
| App name | `Repulabs` |
| User support email | `info@reviewboostcard.com` *(use a repulabs.com address if you have one — reviewers prefer a matching domain)* |
| App logo | 120×120 PNG, no rounded corners baked in |
| Application home page | `https://repulabs.com` |
| Privacy policy | `https://repulabs.com/legal/privacy` |
| Terms of service | `https://repulabs.com/legal/terms` |
| Authorized domain | `repulabs.com` |
| Developer contact | your email |

**Prerequisite:** `repulabs.com` must be verified in Search Console under the
same Google account — OAuth verification checks domain ownership.

---

## 2. Scope justification (paste into the "why do you need this scope" box)

> **Scope requested:** `https://www.googleapis.com/auth/business.manage`
>
> Repulabs is a reputation-management tool for local businesses. After a business
> owner connects their own Google Business Profile, we use this scope to:
>
> 1. **List the accounts and locations** the user manages, so they can pick which
>    of their own locations to connect.
> 2. **Read reviews** for those locations. A background job polls every 15
>    minutes and stores each review so the owner sees all reviews in one
>    dashboard, gets notified of new ones, and can track rating trends.
> 3. **Post replies to reviews** on the owner's behalf. The owner writes or
>    approves a reply in Repulabs (optionally AI-drafted in their brand voice)
>    and we publish it with `PUT mybusiness.googleapis.com/v4/{review}/reply`.
>    Nothing is published without the owner's action or an explicit rule they
>    configured.
> 4. **Read profile performance/insights** to show the owner how their listing
>    is performing over time.
>
> We only ever access locations the authenticated user already manages. We do not
> access other businesses' data, and we do not resell, transfer or use this data
> for advertising or model training.
>
> **Why no narrower scope:** Google publishes a single scope for the Business
> Profile APIs — `business.manage`. There is no read-only or reviews-only
> alternative, so this is the minimum scope that supports reading and replying to
> the user's own reviews.

**Data-handling answers** (asked separately):
- Stored: review text, rating, reviewer display name, review timestamps, location
  ids, and OAuth tokens.
- Tokens are **envelope-encrypted at rest** (`lib/crypto/envelope`).
- Retention: deleted when the user disconnects the integration or deletes their
  account.
- Sharing: not sold, not shared with third parties, not used for ads.

> ⚠️ Verify each of those claims against your live privacy policy before
> submitting — the reviewer cross-checks the policy text against these answers,
> and a mismatch is a common rejection.

---

## 3. Demo video (the #1 reason apps get bounced)

Unlisted **YouTube** link. No narration required, but on-screen it must show:

**Shot list**
1. The **browser address bar showing `repulabs.com`** — proves the app matches
   the registered domain.
2. Sign in, then click **Connect Google Business Profile**.
3. The **OAuth consent screen, with the app name "Repulabs" visible**, and the
   `business.manage` permission clearly readable. Do not cut this — reviewers
   look for the app name on the consent screen specifically.
4. Grant consent, land back in Repulabs.
5. **Show each use of the data:**
   - the connected location appearing,
   - the reviews list populated from Google,
   - writing/approving a reply and it posting,
   - the insights/performance view.
6. Show **disconnect**, so the reviewer sees the user can revoke.

**Rules:** one continuous take per flow, no edits that skip the consent screen,
no dev/localhost URLs anywhere, English UI.

---

## 4. Business Profile API access request (do this FIRST)

Separate from OAuth verification, and the longest queue. Nothing returns review
data until this is approved — the APIs answer `PERMISSION_DENIED` even with a
fully verified OAuth app.

**Project:** number `767930797763`
(from client id `767930797763-qaakrcssrt7ebvlkc8r21r1g3rr5its3.apps.googleusercontent.com`)

### 4a. Enable the APIs first

Cloud Console → **APIs & Services → Library** → enable all of these on that project:

- [ ] **My Business Account Management API** — lists the accounts/locations the user manages
- [ ] **My Business Business Information API** — location details
- [ ] **Google My Business API** (`mybusiness.googleapis.com`) — reviews + replies (the v4 endpoints we call)
- [ ] **My Business Notifications API** — only if you later want push instead of polling

The access form is rejected if the APIs aren't enabled on the project you name.

### 4b. Form answers — paste these

> **Which APIs do you need access to?**
> Google My Business API (reviews + replies), My Business Account Management API,
> My Business Business Information API.

> **How will you use the API?**
> Repulabs is a reputation-management product for local businesses (cafés,
> clinics, salons, trades). A business owner connects their own Google Business
> Profile with OAuth, and we then:
> 1. list the accounts and locations that user manages so they can choose which
>    of their own locations to connect;
> 2. read reviews for those locations on a 15-minute poll, so the owner sees all
>    reviews in one dashboard with notifications and rating trends;
> 3. publish replies the owner has written or approved (optionally AI-drafted in
>    their brand voice) back to the review;
> 4. read location performance/insights to report on how the listing is doing.
> We only ever access locations the authenticated user already manages.

> **Are you managing your own locations, or acting on behalf of others?**
> On behalf of others. Each customer authenticates with their own Google account
> and grants access to their own Business Profile. We never add, claim, verify or
> modify listings on anyone's behalf — we read reviews and publish replies the
> owner has approved.

> **Expected request volume**
> Low. One reviews poll per connected location every 15 minutes (≈96 requests per
> location per day), plus a reply publish only when an owner sends one. At launch
> this is tens of locations, so well under a request per second.

> **Do you resell or redistribute Google data?**
> No. Review data is shown only to the business that owns it, inside their own
> workspace. It is not sold, shared with third parties, or used for advertising
> or model training.

> **Website / product URL:** https://repulabs.com
> **Privacy policy:** https://repulabs.com/legal/privacy
> **Terms:** https://repulabs.com/legal/terms

- [ ] Submitted — record the date here: ____________
- [ ] Approval email received: ____________

---

## 4c. Demo video script (OAuth verification)

Unlisted YouTube, 2–3 minutes, one continuous screen recording. No editing that
cuts the consent screen. Narration optional — on-screen actions are what count.

| # | Show | Why the reviewer needs it |
|---|---|---|
| 1 | Browser address bar on **https://repulabs.com** | Proves the app matches the registered domain |
| 2 | Sign in, land in the app | Establishes it's a real product, not a shell |
| 3 | Click **Connect Google Business Profile** on `/connections` | Shows where consent starts |
| 4 | **The Google consent screen — full, uncut, with "Repulabs" as the app name and `business.manage` readable** | The single most-checked frame. Do not crop or speed up |
| 5 | Grant consent → redirected back into Repulabs | Completes the flow |
| 6 | The connected location appears | Shows scope → data linkage |
| 7 | `/reviews` populated with real Google reviews | Demonstrates use (1): reading reviews |
| 8 | Write/approve a reply and publish it | Demonstrates use (2): posting replies |
| 9 | Insights/performance view | Demonstrates use (3): reading insights |
| 10 | Disconnect the integration | Shows the user can revoke |

**Rules that get videos rejected:** private (not unlisted) link; consent screen
cut or sped past; localhost or a staging URL visible; app name on the consent
screen not matching the site branding; a non-English UI.

- [ ] Recorded
- [ ] Uploaded as **unlisted** and the link pasted into the verification form

---

## 5. While you wait — keep testing

Consent screen → **Test users** → add your address. Up to 100 testers.

⚠️ Refresh tokens issued in **Testing** expire after **7 days**, so test
connections break weekly. That's expected — it disappears once published.

---

## 6. Rejection checklist

- [x] ~~Privacy policy mentions Google user data + how it's handled~~ —
      **checked 2026-07-17**: `app/legal/privacy/page.tsx` covers Google, OAuth,
      Business Profile, Retention and "delete your data". Reachable at
      `https://repulabs.com/legal/privacy`.
- [x] ~~Homepage explains what the app does~~ — **checked 2026-07-23**: live,
      HTTP 200, real landing content (“Repulabs — Run your reputation like a
      system.”), not a placeholder.
- [x] ~~Domain verified in Search Console~~ — **checked 2026-07-23**: both a
      `repulabs.com` Domain property and a URL-prefix property exist. Verify the
      Search Console account is the SAME Google account submitting for
      verification, or Google won't count it.
- [x] ~~Terms + privacy reachable on the domain~~ —
      `/legal/privacy` and `/legal/terms`, both live.
- [ ] **No Gmail/restricted scopes left on this client** — check
      Cloud Console → OAuth consent screen → **Data access**. The connect request
      itself is already clean (`openid`, `userinfo.email`, `userinfo.profile`,
      `business.manage`), but the tier is decided by what the CONSENT SCREEN
      declares. This is the one that costs months if missed.
- [ ] Consent-screen app name == the name in the demo video == the site branding
- [ ] Demo video is unlisted (not private)
- [ ] App switched from **Testing** to **In production** before submitting

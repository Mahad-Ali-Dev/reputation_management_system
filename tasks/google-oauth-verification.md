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

Separate from OAuth. Submit the Google Business Profile API access request form
for the **same Cloud project**.

- [ ] Enable in the project: **My Business Account Management API**,
      **My Business Business Information API**, and the reviews-serving API
      (`mybusiness.googleapis.com` v4)
- [ ] Submit the access form (business details, use case, the same summary as §2)
- [ ] Wait for the approval email before expecting review data

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
- [ ] Homepage explains what the app does (no placeholder/coming-soon)
- [ ] Consent-screen app name == the name in the demo video == the site branding
- [ ] Domain verified in Search Console under the submitting account
- [ ] No Gmail/restricted scopes left on this client
- [ ] Demo video is public or unlisted (not private)

# Service Level Objectives — RepuBoost

> What "good" means in numbers. Every SLO drives an alert at 2% (fast) and 10% (slow) burn rate.

---

## 1. Availability SLOs

| Service | SLI | Target | Window | Error Budget |
|---|---|---|---|---|
| `app.repuboost.io` (tenant API) | HTTP 200/300 success ratio | 99.9% | 30d rolling | 43m / mo |
| `r.repuboost.io` (edge redirect) | Edge worker success ratio | 99.95% | 30d rolling | 21m / mo |
| `chat.repuboost.io` (chatbot widget) | API success ratio | 99.9% | 30d rolling | 43m / mo |
| `admin.repuboost.io` | Internal — best effort | 99.5% | 30d rolling | 3.6h / mo |

---

## 2. Latency SLOs

| SLI | Target | Window |
|---|---|---|
| API p95 latency (read endpoints) | < 300 ms | 30d rolling |
| API p95 latency (write endpoints) | < 500 ms | 30d rolling |
| Edge redirect p95 (`r.repuboost.io`) | < 50 ms | 30d rolling |
| Edge redirect p99 | < 200 ms | 30d rolling |
| AI review reply generation p95 | < 3 s | 30d rolling |
| Chatbot first-token p95 | < 1 s | 30d rolling |
| AI Phone receptionist response audio p95 | < 800 ms | 30d rolling |
| Inbox WS message delivery p95 | < 1 s | 30d rolling |
| OAuth callback p95 | < 1 s | 30d rolling |

---

## 3. Freshness / Correctness SLOs

| SLI | Target | Window |
|---|---|---|
| Reviews ingested within 30 min of Google posting | 99% | 7d rolling |
| Inbox messages ingested within 5 min | 99.5% | 7d rolling |
| Stripe webhooks processed within 5 min | 99.95% | 30d rolling |
| Job queue lag p95 | < 60 s | 7d rolling |
| Job queue oldest waiting | < 5 min | continuous |
| Scheduled social posts published within 30s of `scheduled_for` | 99.9% | 30d rolling |
| Backups verified daily | 100% | 30d rolling |

---

## 4. AI Quality SLIs

Driven by [AI_STRATEGY.md](architecture/AI_STRATEGY.md) §7 eval pipeline. Track but not page on:

| SLI | Target | Window |
|---|---|---|
| Safety classifier — false negatives (production sample) | < 0.5% | 7d rolling |
| Brand voice mean (judge score) | ≥ 4.0 / 5.0 | 14d rolling |
| Factuality pass rate (factual chatbot intents) | ≥ 99% | 14d rolling |
| Jailbreak refusal rate | 100% | 7d rolling |
| Reply edit-distance median (AI draft → published) | < 100 chars | 30d rolling |
| AI cost per tenant p95 | < $4/mo | 30d rolling |

---

## 5. Security SLIs

| SLI | Target | Window |
|---|---|---|
| Critical CVE patch time | < 24 h | continuous |
| Secret rotation compliance | 100% within target cadence | 30d rolling |
| Failed admin login alert response | < 5 min | continuous |
| RLS test suite pass rate (CI) | 100% | continuous |
| TLS cert renewal successes | 100% | continuous |
| Bug bounty critical triage | < 24 h | continuous |
| Bug bounty high triage | < 72 h | continuous |

---

## 6. Error Budget Policy

**When error budget remaining > 50%**: Move fast. Ship features. Take calculated risks.

**When error budget < 50%**:
- All on-call engineers focus on reliability work
- Feature deploys gated by tech-lead approval
- Post-incident review for every burn

**When error budget exhausted**:
- Feature freeze (config + bug fixes only)
- Incident post-mortem with root cause + corrective actions filed
- SRE-led architecture review before resuming feature work

---

## 7. Burn Rate Alerts (PagerDuty)

For each SLO, two alerts:

| Alert | Burn rate | Window | Action |
|---|---|---|---|
| Fast burn | 2% of monthly budget in 1h | 1h | Page on-call (P1) |
| Slow burn | 10% of monthly budget in 6h | 6h | Page on-call (P2) |

For 99.9% availability over 30d (43m budget): fast burn = ~52s of downtime in 1h sliding window triggers page.

---

## 8. SLI Implementation

| SLI source | Implementation |
|---|---|
| HTTP success | Vercel + Fly.io access logs → Grafana Cloud (Prom) |
| API latency | OpenTelemetry → Grafana Tempo |
| Edge redirect | Cloudflare Analytics + Worker logs → Grafana Cloud |
| Reviews freshness | `(reviews.fetched_at - reviews.posted_at)` histogram per minute |
| Webhook freshness | `(webhook_deliveries.processed_at - received_at)` |
| AI quality | nightly judge run → ClickHouse → Grafana |
| Job queue lag | BullMQ metrics → Prom exporter |
| Backups | post-job CloudWatch event |

---

## 9. Reporting

- Internal SLO dashboard updated in realtime (Grafana)
- Weekly SLO review (Monday) — discuss any breach or burn
- Monthly external "trust" page at `repuboost.io/trust` — public uptime + incident history

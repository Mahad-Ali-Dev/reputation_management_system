# Runbook Index

> Operational runbooks. Each runbook is its own file with detection signals, immediate steps, root-cause investigation, and follow-up. Stubs created in Phase 0; expanded as features ship.

| # | Runbook | Phase added | Page severity |
|---|---|---|---|
| 1 | [postgres-failover.md](postgres-failover.md) | Phase 0 | P1 |
| 2 | [anthropic-outage.md](anthropic-outage.md) | Phase 1 | P1 |
| 3 | [twilio-outage.md](twilio-outage.md) | Phase 2 | P1 |
| 4 | [oauth-bulk-revocation.md](oauth-bulk-revocation.md) | Phase 1 | P2 |
| 5 | [stripe-webhook-outage.md](stripe-webhook-outage.md) | Phase 1 | P1 |
| 6 | [mass-email-recall.md](mass-email-recall.md) | Phase 2 | P2 |
| 7 | [breach-response.md](breach-response.md) | Phase 0 | P0 |
| 8 | [hardware-fulfillment-outage.md](hardware-fulfillment-outage.md) | Phase 2 | P2 |
| 9 | [rollback.md](rollback.md) | Phase 0 | P1 |
| 10 | [kv-rebuild.md](kv-rebuild.md) | Phase 2 | P1 |
| 11 | [aurora-acu-saturation.md](aurora-acu-saturation.md) | Phase 0 | P1 |
| 12 | [logical-corruption-recovery.md](logical-corruption-recovery.md) | Phase 0 | P0 |
| 13 | [eu-failover.md](eu-failover.md) | Phase 4+ | P1 |
| 14 | [ai-cost-runaway.md](ai-cost-runaway.md) | Phase 1 | P2 |
| 15 | [secrets-break-glass.md](secrets-break-glass.md) | Phase 0 | P1 |
| 16 | [drift-remediation.md](drift-remediation.md) | Phase 0 | P3 |
| 17 | [dek-rotation.md](dek-rotation.md) | Phase 0 | P2 |
| 18 | [cross-tenant-leak.md](cross-tenant-leak.md) | Phase 0 | P0 |
| 19 | [cloudflare-kv-compromise.md](cloudflare-kv-compromise.md) | Phase 2 | P0 |

---

## Page severity levels

| Level | Meaning | Response time |
|---|---|---|
| P0 | Customer data integrity / breach | Immediate, all hands |
| P1 | Customer-facing outage | < 15 min ack |
| P2 | Degraded experience | < 30 min ack |
| P3 | Internal / non-urgent | Next business day |

---

## Runbook authoring template

Each runbook follows this structure:

```markdown
# Runbook — <Title>

**Severity**: P0 | P1 | P2 | P3
**Owner**: @platform | @ai | @security
**Last drilled**: YYYY-MM-DD

## Detection signals
- Specific Grafana alert
- Specific Sentry trigger
- Specific user-report pattern

## Immediate response (first 15 min)
1. Confirm scope
2. Mitigation step 1
3. Mitigation step 2
4. Status page update

## Root cause investigation
- Logs to check
- Queries to run
- Common causes

## Resolution
- Steps to fully restore
- Verification

## Follow-up
- Customer comms (if applicable)
- Post-mortem requirement
- Preventive PRs to file
```

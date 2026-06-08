import { PrismaClient } from "@prisma/client";
/**
 * RLS cross-tenant attack test — Day 1 ACCEPTANCE GATE.
 *
 * For every tenant-scoped table, with two seeded orgs A and B:
 *   1. SELECT from A's context returns only A's rows (no leak)
 *   2. INSERT with B's org_id from A's context fails (RLS WITH CHECK blocks)
 *   3. UPDATE B's row from A's context returns 0 affected rows
 *   4. DELETE B's row from A's context returns 0 affected rows
 *   5. Without setting org_id, every query returns 0 rows
 *
 * REQUIRES: live Postgres with migrations applied. Set TEST_DATABASE_URL.
 *   pnpm db:migrate:deploy   # against the test DB first
 *   pnpm test:rls
 *
 * If you add a new tenant-scoped table, add a test case here. CI fails the build otherwise.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Prefer DIRECT_URL — pooled connections (PgBouncer) drop SET LOCAL ROLE/GUCs between
// statements in some transaction-pooling modes, and cold-start aborts are more aggressive.
const url =
  process.env.TEST_DATABASE_URL ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error("TEST_DATABASE_URL, DIRECT_URL, or DATABASE_URL required for RLS tests");
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

// Wake the compute before tests run. Neon scales to zero when idle, and a cold connection
// can timeout if the first transaction is also slow.
async function wakeCompute(retries = 5): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

const ORG_A = "00000000-0000-4000-8000-00000000000a";
const ORG_B = "00000000-0000-4000-8000-00000000000b";
const USER_A = "00000000-0000-4000-8000-0000000000aa";
const USER_B = "00000000-0000-4000-8000-0000000000bb";

async function setOrg(
  tx: { $executeRawUnsafe: (sql: string) => Promise<unknown> },
  orgId: string | null,
) {
  // Switch to NOBYPASSRLS role so RLS policies are actually enforced.
  // Neon's neondb_owner has BYPASSRLS, which silently disables every policy.
  await tx.$executeRawUnsafe("SET LOCAL ROLE app_tenant_user");
  if (orgId) {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_org_id = '${orgId}'`);
  } else {
    await tx.$executeRawUnsafe("RESET app.current_org_id");
  }
}

describe("RLS cross-tenant isolation", () => {
  beforeAll(async () => {
    // Wake the Neon compute first — cold starts can otherwise blow past tx timeout.
    await wakeCompute();

    // Seed two orgs + members. We do each context-block as its own short transaction so
    // Neon's cold-start latency doesn't blow past Prisma's interactive-transaction timeout.

    // Org A — explicitly set updated_at because @updatedAt is client-managed (no DB default).
    await prisma.$transaction(
      async (tx) => {
        await setOrg(tx, ORG_A);
        await tx.$executeRawUnsafe(`
          INSERT INTO organizations (id, name, slug, plan, updated_at)
          VALUES ('${ORG_A}', 'Org A', 'org-a-${Date.now()}', 'trial', now())
          ON CONFLICT (id) DO NOTHING
        `);
      },
      { timeout: 30000, maxWait: 10000 },
    );

    // Org B
    await prisma.$transaction(
      async (tx) => {
        await setOrg(tx, ORG_B);
        await tx.$executeRawUnsafe(`
          INSERT INTO organizations (id, name, slug, plan, updated_at)
          VALUES ('${ORG_B}', 'Org B', 'org-b-${Date.now()}', 'trial', now())
          ON CONFLICT (id) DO NOTHING
        `);
      },
      { timeout: 30000, maxWait: 10000 },
    );

    // Users are NOT tenant-scoped (auth-tier table) — insert as owner role, no role switch.
    // App-tenant-user intentionally has no INSERT on `users`; only Auth.js (owner role) writes here.
    await prisma.$executeRawUnsafe(`
      INSERT INTO users (id, email)
      VALUES
        ('${USER_A}', 'a-${Date.now()}@test.local'),
        ('${USER_B}', 'b-${Date.now()}@test.local')
      ON CONFLICT (id) DO NOTHING
    `);

    // Memberships — one per tenant context
    await prisma.$transaction(
      async (tx) => {
        await setOrg(tx, ORG_A);
        await tx.$executeRawUnsafe(`
          INSERT INTO memberships (organization_id, user_id, role)
          VALUES ('${ORG_A}', '${USER_A}', 'owner')
          ON CONFLICT (organization_id, user_id) DO NOTHING
        `);
      },
      { timeout: 30000, maxWait: 10000 },
    );

    await prisma.$transaction(
      async (tx) => {
        await setOrg(tx, ORG_B);
        await tx.$executeRawUnsafe(`
          INSERT INTO memberships (organization_id, user_id, role)
          VALUES ('${ORG_B}', '${USER_B}', 'owner')
          ON CONFLICT (organization_id, user_id) DO NOTHING
        `);
      },
      { timeout: 30000, maxWait: 10000 },
    );
  }, 60000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("memberships: SELECT from A sees only A's rows", async () => {
    const rows = (await prisma.$transaction(async (tx) => {
      await setOrg(tx, ORG_A);
      return tx.$queryRawUnsafe<{ organization_id: string }[]>(
        "SELECT organization_id FROM memberships",
      );
    })) as { organization_id: string }[];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.organization_id).toBe(ORG_A);
    }
  });

  it("memberships: with no org context, SELECT returns 0 rows", async () => {
    const rows = await prisma.$transaction(async (tx) => {
      await setOrg(tx, null);
      return tx.$queryRawUnsafe<unknown[]>("SELECT * FROM memberships");
    });
    expect(rows).toEqual([]);
  });

  it("memberships: INSERT with cross-tenant org_id from A's context is BLOCKED", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await setOrg(tx, ORG_A);
        await tx.$executeRawUnsafe(`
          INSERT INTO memberships (organization_id, user_id, role)
          VALUES ('${ORG_B}', '${USER_A}', 'owner')
        `);
      }),
    ).rejects.toThrow();
  });

  it("memberships: UPDATE another org's row from A returns 0 affected rows", async () => {
    const affected = await prisma.$transaction(async (tx) => {
      await setOrg(tx, ORG_A);
      return tx.$executeRawUnsafe(
        `UPDATE memberships SET role = 'admin' WHERE organization_id = '${ORG_B}'`,
      );
    });
    expect(affected).toBe(0);
  });

  it("memberships: DELETE another org's row from A returns 0 affected rows", async () => {
    const affected = await prisma.$transaction(async (tx) => {
      await setOrg(tx, ORG_A);
      return tx.$executeRawUnsafe(`DELETE FROM memberships WHERE organization_id = '${ORG_B}'`);
    });
    expect(affected).toBe(0);
  });

  it("organizations: SELECT only returns the matching org", async () => {
    const rows = (await prisma.$transaction(async (tx) => {
      await setOrg(tx, ORG_A);
      return tx.$queryRawUnsafe<{ id: string }[]>("SELECT id FROM organizations");
    })) as { id: string }[];
    expect(rows.map((r) => r.id)).toEqual([ORG_A]);
  });

  it("audit_log: INSERT with mismatching org_id from A is BLOCKED", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await setOrg(tx, ORG_A);
        await tx.$executeRawUnsafe(`
          INSERT INTO audit_log (organization_id, actor_type, actor_id, action)
          VALUES ('${ORG_B}', 'user', '${USER_A}', 'test.action')
        `);
      }),
    ).rejects.toThrow();
  });

  it("audit_log: UPDATE/DELETE forbidden by trigger (append-only)", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await setOrg(tx, ORG_A);
        await tx.$executeRawUnsafe(`
          INSERT INTO audit_log (organization_id, actor_type, actor_id, action)
          VALUES ('${ORG_A}', 'user', '${USER_A}', 'test.action.1')
        `);
        await tx.$executeRawUnsafe(
          `UPDATE audit_log SET action = 'tampered' WHERE actor_id = '${USER_A}'`,
        );
      }),
    ).rejects.toThrow(/append-only/);
  });

  // ── Module 15 (differentiators) tenant tables ──
  // autopilot_configs · autopilot_actions · roi_settings · autopilot_digest_runs.
  // Deny-by-default: no org context → 0 rows; cross-tenant INSERT is blocked by
  // the tenant_isolation WITH CHECK.

  it("autopilot_configs: with no org context, SELECT returns 0 rows", async () => {
    const rows = await prisma.$transaction(async (tx) => {
      await setOrg(tx, null);
      return tx.$queryRawUnsafe<unknown[]>("SELECT * FROM autopilot_configs");
    });
    expect(rows).toEqual([]);
  });

  it("autopilot_configs: INSERT with cross-tenant org_id from A is BLOCKED", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await setOrg(tx, ORG_A);
        await tx.$executeRawUnsafe(`
          INSERT INTO autopilot_configs (organization_id) VALUES ('${ORG_B}')
        `);
      }),
    ).rejects.toThrow();
  });

  it("autopilot_actions: with no org context, SELECT returns 0 rows", async () => {
    const rows = await prisma.$transaction(async (tx) => {
      await setOrg(tx, null);
      return tx.$queryRawUnsafe<unknown[]>("SELECT * FROM autopilot_actions");
    });
    expect(rows).toEqual([]);
  });

  it("autopilot_actions: INSERT with cross-tenant org_id from A is BLOCKED", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await setOrg(tx, ORG_A);
        await tx.$executeRawUnsafe(`
          INSERT INTO autopilot_actions (organization_id, loop, action)
          VALUES ('${ORG_B}', 'auto_reply', 'published')
        `);
      }),
    ).rejects.toThrow();
  });

  it("roi_settings: with no org context, SELECT returns 0 rows", async () => {
    const rows = await prisma.$transaction(async (tx) => {
      await setOrg(tx, null);
      return tx.$queryRawUnsafe<unknown[]>("SELECT * FROM roi_settings");
    });
    expect(rows).toEqual([]);
  });

  it("roi_settings: INSERT with cross-tenant org_id from A is BLOCKED", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await setOrg(tx, ORG_A);
        await tx.$executeRawUnsafe(`
          INSERT INTO roi_settings (organization_id, establishment_id)
          VALUES ('${ORG_B}', '${ORG_B}')
        `);
      }),
    ).rejects.toThrow();
  });

  it("autopilot_digest_runs: with no org context, SELECT returns 0 rows", async () => {
    const rows = await prisma.$transaction(async (tx) => {
      await setOrg(tx, null);
      return tx.$queryRawUnsafe<unknown[]>("SELECT * FROM autopilot_digest_runs");
    });
    expect(rows).toEqual([]);
  });

  it("autopilot_digest_runs: INSERT with cross-tenant org_id from A is BLOCKED", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await setOrg(tx, ORG_A);
        await tx.$executeRawUnsafe(`
          INSERT INTO autopilot_digest_runs (organization_id, week_start)
          VALUES ('${ORG_B}', now())
        `);
      }),
    ).rejects.toThrow();
  });
});

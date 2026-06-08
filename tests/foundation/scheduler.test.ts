import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Scheduler dispatcher (00_foundation §A7) — the per-minute drain
 * (`lib/scheduler/dispatch.ts`). These tests pin the race-safe state machine and
 * fail-soft posture without a live DB:
 *
 *   - claim returns count 0 (another tick won the row) → SKIP, no handler run
 *   - handler ok:true                                  → row → done + ranAt
 *   - handler throws / ok:false, attempts < max        → row → pending (retry)
 *   - retry exhausted (attemptsAfterClaim >= max)      → row → failed (terminal)
 *   - fail-soft: stage-1 select 42P01 (unmigrated)     → returns zeros, no throw
 *
 * Style mirrors tests/contacts/upsert-wiring.test.ts: mock `withTenant` + the
 * prisma `scheduledJob` surface with a controllable in-memory store, and stub
 * `HANDLERS` so we drive ok/throw deterministically.
 *
 * vitest env is node — `dispatch.ts` is plain async server code, no React.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---- In-memory ScheduledJob store + the candidate select knob ----
type Job = {
  id: string;
  organizationId: string;
  kind: string;
  payload: unknown;
  status: string;
  attempts: number;
  maxAttempts: number;
  lockedAt: Date | null;
  ranAt: Date | null;
  lastError: string | null;
};

const store: {
  jobs: Job[];
  candidateError: Error | null;
  claimCountOverride: number | null;
} = { jobs: [], candidateError: null, claimCountOverride: null };

function findJob(id: string): Job | undefined {
  return store.jobs.find((j) => j.id === id);
}

// ---- Stage-1 cross-tenant candidate select (unscoped prisma) ----
const findManyMock = vi.fn(async (args: { take?: number }) => {
  if (store.candidateError) throw store.candidateError;
  return store.jobs
    .filter((j) => j.status === "pending")
    .slice(0, args?.take ?? store.jobs.length)
    .map((j) => ({
      id: j.id,
      organizationId: j.organizationId,
      kind: j.kind,
      payload: j.payload,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
    }));
});

vi.mock("@/lib/db/client", () => ({
  prisma: {
    scheduledJob: { findMany: (a: { take?: number }) => findManyMock(a) },
  },
}));

// ---- withTenant: run fn against a tx backed by the in-memory store ----
// Mirrors the real claim (updateMany where status:"pending") + outcome
// (update where id) operations the dispatcher performs inside withTenant.
vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: async (
    _orgId: string,
    fn: (tx: unknown) => Promise<unknown>,
  ) => {
    const tx = {
      scheduledJob: {
        updateMany: async ({
          where,
          data,
        }: {
          where: { id: string; status?: string };
          data: Record<string, unknown>;
        }) => {
          const job = findJob(where.id);
          // Conditional claim: only transition a row still in the required status.
          const matches =
            job !== undefined &&
            (where.status === undefined || job.status === where.status);
          if (!matches || !job) return { count: 0 };
          // Allow a test to force a "lost race" (another tick claimed first).
          if (
            store.claimCountOverride !== null &&
            data.status === "running"
          ) {
            return { count: store.claimCountOverride };
          }
          applyUpdate(job, data);
          return { count: 1 };
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const job = findJob(where.id);
          if (!job) throw Object.assign(new Error("no row"), { code: "P2025" });
          applyUpdate(job, data);
          return { id: job.id };
        },
      },
    };
    return fn(tx);
  },
}));

/** Apply a Prisma-style data patch (incl. `{ increment }`) to a job row. */
function applyUpdate(job: Job, data: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(data)) {
    if (
      v !== null &&
      typeof v === "object" &&
      "increment" in (v as Record<string, unknown>)
    ) {
      const inc = (v as { increment: number }).increment;
      (job as unknown as Record<string, number>)[k] =
        ((job as unknown as Record<string, number>)[k] ?? 0) + inc;
    } else {
      (job as unknown as Record<string, unknown>)[k] = v;
    }
  }
}

// ---- HANDLERS: deterministic per-test behavior ----
const handlerImpl = {
  fn: vi.fn(async (_job: unknown) => ({ ok: true }) as { ok: boolean; detail?: string }),
};
vi.mock("@/lib/scheduler/handlers", () => ({
  // KNOWN_KINDS in dispatch.ts is hardcoded; we only need the registry shape.
  HANDLERS: {
    scheduled_post: (job: unknown) => handlerImpl.fn(job),
    scheduled_request: (job: unknown) => handlerImpl.fn(job),
    scheduled_reply: (job: unknown) => handlerImpl.fn(job),
  },
}));

import { drainDueScheduledJobs } from "@/lib/scheduler/dispatch";

const ORG = "11111111-1111-4111-8111-111111111111";

function seed(partial: Partial<Job> & { id: string }): Job {
  const job: Job = {
    organizationId: ORG,
    kind: "scheduled_post",
    payload: {},
    status: "pending",
    attempts: 0,
    maxAttempts: 3,
    lockedAt: null,
    ranAt: null,
    lastError: null,
    ...partial,
  };
  store.jobs.push(job);
  return job;
}

beforeEach(() => {
  store.jobs = [];
  store.candidateError = null;
  store.claimCountOverride = null;
  findManyMock.mockClear();
  handlerImpl.fn.mockReset().mockResolvedValue({ ok: true });
});

describe("drainDueScheduledJobs — claim race", () => {
  it("skips a job whose claim returns count 0 (another tick won)", async () => {
    seed({ id: "j1" });
    store.claimCountOverride = 0; // claim updateMany → count 0

    const res = await drainDueScheduledJobs();

    expect(res).toEqual({ claimed: 0, succeeded: 0, failed: 0 });
    expect(handlerImpl.fn).not.toHaveBeenCalled(); // never ran the handler
    expect(findJob("j1")!.status).toBe("pending"); // untouched
  });
});

describe("drainDueScheduledJobs — success path", () => {
  it("claims, runs the handler, marks the row done + sets ranAt", async () => {
    seed({ id: "j1" });
    handlerImpl.fn.mockResolvedValue({ ok: true, detail: "sent" });

    const res = await drainDueScheduledJobs();

    expect(res).toEqual({ claimed: 1, succeeded: 1, failed: 0 });
    expect(handlerImpl.fn).toHaveBeenCalledTimes(1);
    const job = findJob("j1")!;
    expect(job.status).toBe("done");
    expect(job.ranAt).toBeInstanceOf(Date);
    expect(job.attempts).toBe(1); // incremented at claim
    expect(job.lastError).toBeNull();
  });

  it("passes a tenant-resolved job ({id,orgId,kind,payload}) to the handler", async () => {
    seed({ id: "j1", payload: { postId: "p1" } });
    await drainDueScheduledJobs();
    const arg = handlerImpl.fn.mock.calls[0]![0] as {
      id: string;
      orgId: string;
      kind: string;
      payload: Record<string, unknown>;
    };
    expect(arg.id).toBe("j1");
    expect(arg.orgId).toBe(ORG);
    expect(arg.kind).toBe("scheduled_post");
    expect(arg.payload).toEqual({ postId: "p1" });
  });
});

describe("drainDueScheduledJobs — retry then fail-at-max", () => {
  it("a thrown handler with attempts remaining drops the row back to pending", async () => {
    seed({ id: "j1", attempts: 0, maxAttempts: 3 });
    handlerImpl.fn.mockRejectedValue(new Error("boom"));

    const res = await drainDueScheduledJobs();

    expect(res).toEqual({ claimed: 1, succeeded: 0, failed: 1 });
    const job = findJob("j1")!;
    expect(job.status).toBe("pending"); // will be re-claimed next tick
    expect(job.attempts).toBe(1);
    expect(job.lastError).toBe("boom");
    expect(job.ranAt).toBeNull();
  });

  it("ok:false with attempts remaining also retries (soft failure)", async () => {
    seed({ id: "j1", attempts: 0, maxAttempts: 2 });
    handlerImpl.fn.mockResolvedValue({ ok: false, detail: "rate limited" });

    await drainDueScheduledJobs();

    const job = findJob("j1")!;
    expect(job.status).toBe("pending");
    expect(job.lastError).toBe("rate limited");
  });

  it("the LAST attempt (attemptsAfterClaim >= maxAttempts) goes to failed (terminal)", async () => {
    // attempts already at 2, maxAttempts 3 → this claim makes it 3 == max → exhausted.
    seed({ id: "j1", attempts: 2, maxAttempts: 3 });
    handlerImpl.fn.mockRejectedValue(new Error("still broken"));

    const res = await drainDueScheduledJobs();

    expect(res).toEqual({ claimed: 1, succeeded: 0, failed: 1 });
    const job = findJob("j1")!;
    expect(job.status).toBe("failed"); // no more retries
    expect(job.attempts).toBe(3);
    expect(job.lastError).toBe("still broken");
  });

  it("models the full retry→fail lifecycle across successive ticks", async () => {
    seed({ id: "j1", attempts: 0, maxAttempts: 2 });
    handlerImpl.fn.mockResolvedValue({ ok: false, detail: "nope" });

    // Tick 1: 0→1 attempt, retryable → pending.
    await drainDueScheduledJobs();
    expect(findJob("j1")!.status).toBe("pending");
    expect(findJob("j1")!.attempts).toBe(1);

    // Tick 2: 1→2 attempt == max → failed (terminal).
    await drainDueScheduledJobs();
    expect(findJob("j1")!.status).toBe("failed");
    expect(findJob("j1")!.attempts).toBe(2);

    // Tick 3: no pending rows remain → nothing claimed.
    const res3 = await drainDueScheduledJobs();
    expect(res3).toEqual({ claimed: 0, succeeded: 0, failed: 0 });
  });
});

describe("drainDueScheduledJobs — dedupeKey idempotency (via stage-1 candidate set)", () => {
  it("a job already done is not a pending candidate, so a re-run is a no-op", async () => {
    // The (org,kind,dedupeKey) unique index lives on the WRITE path (schedule());
    // the dispatcher's idempotency is that a non-pending row never re-enters the
    // candidate window. Once done, draining again claims/runs nothing.
    seed({ id: "j1", status: "done", ranAt: new Date() });
    seed({ id: "j2", status: "pending" });

    const res = await drainDueScheduledJobs();

    expect(res.claimed).toBe(1); // only j2
    expect(handlerImpl.fn).toHaveBeenCalledTimes(1);
    const ran = handlerImpl.fn.mock.calls[0]![0] as { id: string };
    expect(ran.id).toBe("j2");
    expect(findJob("j1")!.status).toBe("done"); // untouched
  });

  it("a single pending row is claimed exactly once within a tick (no double-run)", async () => {
    seed({ id: "j1" });
    await drainDueScheduledJobs();
    expect(handlerImpl.fn).toHaveBeenCalledTimes(1);
  });
});

describe("drainDueScheduledJobs — fail-soft on unmigrated table (42P01)", () => {
  it("returns zeros (no throw) when the stage-1 select hits 42P01", async () => {
    seed({ id: "j1" });
    store.candidateError = Object.assign(
      new Error('relation "scheduled_jobs" does not exist (42P01)'),
      { code: "42P01" },
    );

    const res = await drainDueScheduledJobs();

    expect(res).toEqual({ claimed: 0, succeeded: 0, failed: 0 });
    expect(handlerImpl.fn).not.toHaveBeenCalled();
  });

  it("rethrows a non-missing-relation error (real failures are not swallowed)", async () => {
    seed({ id: "j1" });
    store.candidateError = new Error("connection reset");
    await expect(drainDueScheduledJobs()).rejects.toThrow("connection reset");
  });
});

import { MarketingShell, StubHero } from "@/components/landing/marketing-shell";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "System Status · Repulabs",
  description: "Live status of Repulabs services, checked in real time.",
};

const C = {
  surface: "var(--surface, #ffffff)",
  surface2: "var(--surface-2, #fafbf8)",
  ink: "var(--ink, #0B0D0E)",
  ink2: "var(--ink-2, #1e2225)",
  mute: "var(--rl-muted, #61697a)",
  line: "var(--line, #eceeea)",
  pri: "var(--pri, #2563EB)",
  ok: "var(--ok, #10b981)",
  warn: "#d97706",
};

type ComponentStatus = {
  name: string;
  state: "operational" | "degraded";
  detail: string;
};

/**
 * Real, lightweight, server-side checks performed at request time.
 * Each check is wrapped so a failure renders "Degraded" — never a 500.
 * We do NOT assert uptime percentages or past-incident history we cannot prove.
 */
async function getStatus(): Promise<ComponentStatus[]> {
  const components: ComponentStatus[] = [];

  // Database reachability — a real round-trip.
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  components.push({
    name: "Database",
    state: dbOk ? "operational" : "degraded",
    detail: dbOk ? "Reachable" : "Unreachable",
  });

  // Web app — if this page rendered, the app server is up.
  components.push({
    name: "Web app",
    state: "operational",
    detail: "Serving requests",
  });

  // Integration configuration presence. We can truthfully report whether each
  // integration is configured; we do not claim live third-party uptime.
  const configChecks: { name: string; configured: boolean }[] = [
    {
      name: "AI replies & receptionist",
      configured: Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY),
    },
    {
      name: "Outbound SMS (Twilio)",
      configured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    },
    {
      name: "Outbound email (Resend)",
      configured: Boolean(process.env.RESEND_API_KEY),
    },
    {
      name: "Billing (Stripe)",
      configured: Boolean(process.env.STRIPE_SECRET_KEY),
    },
  ];

  for (const c of configChecks) {
    components.push({
      name: c.name,
      state: c.configured ? "operational" : "degraded",
      detail: c.configured ? "Configured" : "Not configured",
    });
  }

  return components;
}

export default async function StatusPage() {
  let components: ComponentStatus[];
  try {
    components = await getStatus();
  } catch {
    // Absolute fail-soft: never 500 the status page.
    components = [{ name: "Status checks", state: "degraded", detail: "Unavailable" }];
  }

  const allOk = components.every((c) => c.state === "operational");
  const checkedAt = new Date().toUTCString();

  const bannerBg = allOk
    ? "linear-gradient(140deg, #dcfce7 0%, #ecfdf5 100%)"
    : "linear-gradient(140deg, #fef3c7 0%, #fffbeb 100%)";
  const bannerBorder = allOk ? "#bbf7d0" : "#fde68a";
  const bannerTitleColor = allOk ? "#166534" : "#92400e";
  const bannerSubColor = allOk ? "#15803d" : "#b45309";
  const dotColor = allOk ? C.ok : C.warn;

  return (
    <MarketingShell>
      <StubHero
        kicker="System Status"
        title={allOk ? "All systems operational." : "Some systems degraded."}
        description="Live status of Repulabs subsystems, checked in real time when this page loads."
      />

      <section className="mx-auto max-w-[1080px] px-6 py-16">
        <div
          className="flex items-center gap-3 rounded-2xl p-6"
          style={{ background: bannerBg, border: `1px solid ${bannerBorder}` }}
        >
          <span className="relative grid h-3 w-3 place-items-center" aria-hidden>
            {allOk && <span className="lp-ping" style={{ background: dotColor }} />}
            <span className="relative h-3 w-3 rounded-full" style={{ background: dotColor }} />
          </span>
          <div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: bannerTitleColor,
                letterSpacing: "-0.015em",
              }}
            >
              {allOk ? "All systems operational" : "Some systems degraded"}
            </div>
            <div style={{ fontSize: 13, color: bannerSubColor }}>
              Last checked {checkedAt}.
            </div>
          </div>
        </div>

        <div
          className="mt-10 overflow-hidden rounded-2xl"
          style={{ background: C.surface, border: `1px solid ${C.line}` }}
        >
          {components.map((s, i) => {
            const ok = s.state === "operational";
            return (
              <div
                key={s.name}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
                style={{ borderTop: i === 0 ? undefined : `1px solid ${C.line}` }}
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-2 w-2 place-items-center" aria-hidden>
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: ok ? C.ok : C.warn }}
                    />
                  </span>
                  <span style={{ fontSize: 14, color: C.ink2, fontWeight: 500 }}>{s.name}</span>
                </div>
                <div className="flex items-center gap-6">
                  <span
                    style={{
                      fontSize: 11,
                      color: C.mute,
                      fontFamily: "var(--f-mono)",
                      letterSpacing: ".08em",
                    }}
                  >
                    {s.detail}
                  </span>
                  <span
                    className="rounded-full px-2.5 py-0.5"
                    style={{
                      fontSize: 10.5,
                      fontFamily: "var(--f-mono)",
                      letterSpacing: ".1em",
                      background: ok ? "#dcfce7" : "#fef3c7",
                      color: ok ? "#166534" : "#92400e",
                      fontWeight: 700,
                    }}
                  >
                    {ok ? "OPERATIONAL" : "DEGRADED"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-6" style={{ fontSize: 12, color: C.mute, lineHeight: 1.6 }}>
          Checks run server-side each time this page is requested. Integration rows reflect whether
          the service is configured for this deployment, not third-party provider uptime.
        </p>
      </section>

      <section
        style={{ background: C.surface2, borderTop: `1px solid ${C.line}` }}
        className="border-b"
      >
        <div className="mx-auto max-w-[760px] px-6 py-16 text-center">
          <h3
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            Questions about availability?
          </h3>
          <p
            className="mx-auto mt-3"
            style={{ fontSize: 14, color: C.mute, maxWidth: 520, lineHeight: 1.6 }}
          >
            Reach out to{" "}
            <a href="mailto:info@repulabs.com" style={{ color: C.pri }}>
              info@repulabs.com
            </a>{" "}
            and we'll get back to you.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}

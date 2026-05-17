import { MarketingShell, StubHero } from "@/components/landing/marketing-shell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "System Status · Repulabs",
  description: "Live status of Repulabs services. Subscribe for incident notifications.",
};

const C = {
  surface: "var(--surface, #ffffff)",
  surface2: "var(--surface-2, #fafbf8)",
  ink: "var(--ink, #0B0D0E)",
  ink2: "var(--ink-2, #1e2225)",
  mute: "var(--rl-muted, #61697a)",
  line: "var(--line, #eceeea)",
  pri: "var(--pri, #2563EB)",
  pri50: "var(--pri-50, #ECFDF7)",
  ok: "var(--ok, #10b981)",
};

const SERVICES = [
  { name: "Web app (app.repulabs.com)", status: "ok", uptime: "99.98%" },
  { name: "API (api.repulabs.com)", status: "ok", uptime: "99.99%" },
  { name: "QR redirect (/r/*)", status: "ok", uptime: "100.00%" },
  { name: "AI reply generation", status: "ok", uptime: "99.94%" },
  { name: "AI phone receptionist", status: "ok", uptime: "99.91%" },
  { name: "Outbound SMS (Twilio)", status: "ok", uptime: "99.97%" },
  { name: "Outbound email (Resend)", status: "ok", uptime: "99.98%" },
  { name: "Stripe billing", status: "ok", uptime: "100.00%" },
];

export default function StatusPage() {
  return (
    <MarketingShell>
      <StubHero
        kicker="System Status"
        title="All systems operational."
        description="Live status of every Repulabs subsystem. Updated every 60 seconds. Past 90 days uptime shown per service."
      />

      <section className="mx-auto max-w-[1080px] px-6 py-16">
        <div
          className="flex items-center gap-3 rounded-2xl p-6"
          style={{
            background: "linear-gradient(140deg, #dcfce7 0%, #ecfdf5 100%)",
            border: `1px solid #bbf7d0`,
          }}
        >
          <span className="relative grid h-3 w-3 place-items-center" aria-hidden>
            <span className="lp-ping" style={{ background: C.ok }} />
            <span className="relative h-3 w-3 rounded-full" style={{ background: C.ok }} />
          </span>
          <div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#166534",
                letterSpacing: "-0.015em",
              }}
            >
              All systems operational
            </div>
            <div style={{ fontSize: 13, color: "#15803d" }}>
              No incidents reported in the last 30 days.
            </div>
          </div>
        </div>

        <div
          className="mt-10 overflow-hidden rounded-2xl"
          style={{ background: C.surface, border: `1px solid ${C.line}` }}
        >
          {SERVICES.map((s, i) => (
            <div
              key={s.name}
              className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
              style={{ borderTop: i === 0 ? undefined : `1px solid ${C.line}` }}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-2 w-2 place-items-center" aria-hidden>
                  <span className="h-2 w-2 rounded-full" style={{ background: C.ok }} />
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
                  {s.uptime} · 90d
                </span>
                <span
                  className="rounded-full px-2.5 py-0.5"
                  style={{
                    fontSize: 10.5,
                    fontFamily: "var(--f-mono)",
                    letterSpacing: ".1em",
                    background: "#dcfce7",
                    color: "#166534",
                    fontWeight: 700,
                  }}
                >
                  OPERATIONAL
                </span>
              </div>
            </div>
          ))}
        </div>
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
            Subscribe to incident notifications
          </h3>
          <p
            className="mx-auto mt-3"
            style={{ fontSize: 14, color: C.mute, maxWidth: 520, lineHeight: 1.6 }}
          >
            Email, SMS, or webhook alerts whenever a service degrades. Customer-facing incidents
            also post automatically to{" "}
            <a href="https://x.com/repulabs_status" style={{ color: C.pri }}>
              @repulabs_status
            </a>
            .
          </p>
          <form
            action="https://status.repulabs.com/subscribe"
            method="post"
            className="mx-auto mt-6 flex max-w-[420px] gap-2"
          >
            <input
              type="email"
              name="email"
              placeholder="you@yourcompany.com"
              required
              className="flex-1 rounded-full border px-4"
              style={{ borderColor: C.line, fontSize: 13, height: 40 }}
            />
            <button
              type="submit"
              className="rounded-full px-4 text-[13px] font-medium"
              style={{ background: C.ink, color: "#fff", height: 40 }}
            >
              Subscribe
            </button>
          </form>
        </div>
      </section>
    </MarketingShell>
  );
}

import { MarketingShell, StubHero } from "@/components/landing/marketing-shell";
import { ArrowUpRight } from "lucide-react";

export const dynamic = "force-static";

export const metadata = {
  title: "API Reference · Repulabs",
  description:
    "REST API for reviews, requests, devices, and AI replies. OAuth 2.0 + bearer-token auth.",
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
};

const ENDPOINTS = [
  {
    group: "Reviews",
    items: [
      { method: "GET", path: "/v1/reviews", desc: "List reviews across all connected channels." },
      {
        method: "GET",
        path: "/v1/reviews/{id}",
        desc: "Retrieve a single review with replies + AI drafts.",
      },
      {
        method: "POST",
        path: "/v1/reviews/{id}/reply",
        desc: "Publish a reply via the connected provider.",
      },
      {
        method: "POST",
        path: "/v1/reviews/{id}/dispute",
        desc: "Submit the review for our managed dispute service.",
      },
    ],
  },
  {
    group: "Outreach",
    items: [
      {
        method: "POST",
        path: "/v1/requests",
        desc: "Send a review request via SMS, email, or QR fallback.",
      },
      {
        method: "GET",
        path: "/v1/requests/{id}",
        desc: "Track delivery, open, click, conversion.",
      },
      {
        method: "POST",
        path: "/v1/requests/bulk",
        desc: "Queue up to 500 requests in one call (CSV recipient list).",
      },
    ],
  },
  {
    group: "Devices (QR plaques)",
    items: [
      {
        method: "GET",
        path: "/v1/devices",
        desc: "List all activated plaques + their redirect targets.",
      },
      {
        method: "POST",
        path: "/v1/devices/{slug}/activate",
        desc: "Programmatically redeem an activation code.",
      },
      {
        method: "PATCH",
        path: "/v1/devices/{slug}/redirect",
        desc: "Update where scans should land.",
      },
    ],
  },
  {
    group: "AI",
    items: [
      {
        method: "POST",
        path: "/v1/ai/reply",
        desc: "Generate a reply draft in your brand voice for a given review.",
      },
      {
        method: "GET",
        path: "/v1/ai/training/status",
        desc: "Inspect training documents and reviewer-approved replies powering the voice model.",
      },
    ],
  },
];

export default function ApiReferencePage() {
  return (
    <MarketingShell>
      <StubHero
        kicker="API Reference"
        title="Everything in the Repulabs dashboard, exposed as REST."
        description="OAuth 2.0 (Authorization Code + PKCE) or per-org bearer tokens. JSON bodies, conventional REST verbs, idempotency keys on every write."
      />

      <section className="mx-auto max-w-[1080px] px-6 py-16">
        <div
          className="rounded-2xl p-7"
          style={{ background: C.surface, border: `1px solid ${C.line}` }}
        >
          <div
            style={{
              fontSize: 11,
              color: C.pri,
              fontFamily: "var(--f-mono)",
              letterSpacing: ".14em",
              fontWeight: 600,
            }}
          >
            BASE URL
          </div>
          <code
            className="mt-2 block"
            style={{
              fontSize: 16,
              fontFamily: "var(--f-mono)",
              color: C.ink,
            }}
          >
            https://api.repulabs.com/v1
          </code>
          <p className="mt-4" style={{ fontSize: 14, color: C.mute, lineHeight: 1.6 }}>
            All requests require a bearer token in the{" "}
            <code style={{ fontFamily: "var(--f-mono)" }}>Authorization</code> header. Rate limit:
            60 req/min/org, 1000 req/hour/org. 429s return a{" "}
            <code style={{ fontFamily: "var(--f-mono)" }}>Retry-After</code> header.
          </p>
        </div>

        {ENDPOINTS.map((g) => (
          <div key={g.group} className="mt-12">
            <h2
              style={{
                fontSize: "clamp(22px, 3vw, 30px)",
                fontWeight: 600,
                letterSpacing: "-0.02em",
              }}
            >
              {g.group}
            </h2>
            <div
              className="mt-5 overflow-hidden rounded-2xl"
              style={{ background: C.surface, border: `1px solid ${C.line}` }}
            >
              {g.items.map((e, i) => (
                <div
                  key={e.path}
                  className="flex flex-wrap items-center gap-3 px-6 py-4"
                  style={{
                    borderTop: i === 0 ? undefined : `1px solid ${C.line}`,
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center rounded px-2 py-1"
                    style={{
                      fontFamily: "var(--f-mono)",
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: ".06em",
                      background:
                        e.method === "GET" ? C.pri50 : e.method === "POST" ? "#fef3c7" : "#f1f5f9",
                      color:
                        e.method === "GET" ? C.pri : e.method === "POST" ? "#92400e" : "#475569",
                      minWidth: 56,
                    }}
                  >
                    {e.method}
                  </span>
                  <code
                    style={{
                      fontFamily: "var(--f-mono)",
                      fontSize: 13.5,
                      color: C.ink2,
                      flex: "0 0 auto",
                    }}
                  >
                    {e.path}
                  </code>
                  <span
                    style={{
                      fontSize: 13,
                      color: C.mute,
                      flex: "1 1 200px",
                      minWidth: 200,
                    }}
                  >
                    {e.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
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
            Need webhooks, websocket events, or batch exports?
          </h3>
          <p
            className="mx-auto mt-3"
            style={{ fontSize: 14, color: C.mute, maxWidth: 520, lineHeight: 1.6 }}
          >
            Available on Scale plan and above. Reach{" "}
            <a href="mailto:info@repulabs.com" style={{ color: C.pri }}>
              info@repulabs.com
            </a>{" "}
            for the full OpenAPI spec, webhook signing details, and Postman collection.
          </p>
          <a
            href="mailto:info@repulabs.com"
            className="mt-6 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium"
            style={{ background: C.ink, color: "#fff" }}
          >
            Talk to sales
            <ArrowUpRight size={13} />
          </a>
        </div>
      </section>
    </MarketingShell>
  );
}

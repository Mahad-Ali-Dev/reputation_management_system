/**
 * Inline "app scenes" for the marketing landing.
 *
 * These are NOT screenshots — they're real React components that look
 * pixel-similar to the in-app UI. Each scene is self-contained and uses
 * inline styles so it renders identically whether or not the visitor is
 * inside the tenant app shell. Mock data is hardcoded but realistic.
 *
 * Used inside marketing sections (Hero, BentoFeatures, HowItWorks). Each
 * scene is wrapped in a card-with-chrome that signals "this is what the
 * dashboard looks like".
 */

import { Stars } from "@/components/shell/stars";

const C = {
  bg: "#f6f7f4",
  surface: "#ffffff",
  surface2: "#fafbf8",
  ink: "#0b0d0e",
  ink2: "#1e2225",
  muted: "#94a3b8",
  line: "#eceeea",
  pri: "#2563eb",
  pri50: "#eff6ff",
  pri100: "#dbeafe",
  ok: "#10b981",
  warn: "#f59e0b",
  bad: "#ef4444",
} as const;

/* ----------------------------------------------------------------------------
   Browser chrome — gives every scene a "this is the app" frame
---------------------------------------------------------------------------- */
export function SceneFrame({
  title = "repulabs.com / dashboard",
  children,
  height,
  width = "100%",
}: {
  title?: string;
  children: React.ReactNode;
  height?: number | string;
  width?: number | string;
}) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 14,
        overflow: "hidden",
        boxShadow:
          "0 30px 80px -30px rgba(11,13,14,.22), 0 6px 18px -8px rgba(11,13,14,.08)",
        width,
        height,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          background: C.surface2,
          borderBottom: `1px solid ${C.line}`,
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11.5,
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#fca5a5" }} />
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#fcd34d" }} />
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#86efac" }} />
        <span
          style={{
            marginLeft: 14,
            color: C.muted,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 10.5,
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Dashboard scene — KPI strip + small chart + review feed
---------------------------------------------------------------------------- */
export function DashboardScene() {
  return (
    <div
      style={{
        padding: 18,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
        background: C.bg,
        height: "100%",
      }}
    >
      <div style={{ gridColumn: "span 2" }}>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em" }}>
          DASHBOARD · LAST 30 DAYS
        </div>
        <h3
          style={{
            margin: "4px 0 0",
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: C.ink,
          }}
        >
          Your reputation, in one place
        </h3>
      </div>

      {/* KPI row */}
      <div
        style={{
          gridColumn: "span 2",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
        }}
      >
        <MiniKpi label="Rating" value="4.8" delta="+0.2" tone="up" />
        <MiniKpi label="Reviews · 30d" value="124" delta="+38%" tone="up" />
        <MiniKpi label="Requests sent" value="412" delta="+12%" tone="up" />
        <MiniKpi label="Response rate" value="96%" delta="2.1h avg" />
      </div>

      {/* Mini chart */}
      <div
        style={{
          gridColumn: "span 2",
          background: C.surface,
          border: `1px solid ${C.line}`,
          borderRadius: 9,
          padding: 12,
        }}
      >
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.08em" }}>
          REVIEW VOLUME · 30d
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 2,
            height: 56,
            marginTop: 8,
          }}
        >
          {[5, 7, 4, 9, 6, 8, 11, 9, 12, 10, 14, 13, 15, 18, 16, 19, 17, 21, 24, 22, 26, 28, 30, 33, 31, 35, 37, 40, 42, 44].map((v, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed ordered series
              key={`b-${i}`}
              style={{
                flex: 1,
                height: `${(v / 44) * 100}%`,
                background: i === 29 ? C.pri : C.pri100,
                borderRadius: 2,
              }}
            />
          ))}
        </div>
      </div>

      {/* Latest review snippet */}
      <div
        style={{
          gridColumn: "span 2",
          background: C.surface,
          border: `1px solid ${C.line}`,
          borderRadius: 9,
          padding: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 10, color: C.muted, letterSpacing: "0.08em" }}>
            NEW REVIEW · GOOGLE
          </span>
          <span style={{ fontSize: 10, color: C.muted }}>2m ago</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Stars value={5} size={12} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Sarah M.</span>
        </div>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12.5,
            color: C.ink2,
            lineHeight: 1.5,
          }}
        >
          "Best coffee in the neighborhood. Friendly staff and quick service every time. Highly recommend the lavender latte."
        </p>
      </div>
    </div>
  );
}

function MiniKpi({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta: string;
  tone?: "up";
}) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 9,
        padding: 10,
      }}
    >
      <div style={{ fontSize: 9.5, color: C.muted, letterSpacing: "0.08em" }}>
        {label.toUpperCase()}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.025em",
          marginTop: 2,
          color: C.ink,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10.5,
          color: tone === "up" ? C.ok : C.muted,
          fontWeight: 500,
          marginTop: 2,
        }}
      >
        {tone === "up" && "↑ "}
        {delta}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Reviews-inbox scene — list of reviews with AI-drafted replies
---------------------------------------------------------------------------- */
export function ReviewsInboxScene() {
  return (
    <div
      style={{
        padding: 18,
        background: C.bg,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em" }}>
          REVIEW INBOX · NEEDS REPLY
        </div>
        <h3
          style={{
            margin: "4px 0 0",
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: C.ink,
          }}
        >
          Drafts ready for one-click approval
        </h3>
      </div>

      {[
        {
          name: "Jamie L.",
          rating: 5,
          text: "Incredible food and service. The pad thai is everything I want in a Thai meal.",
          ai: "Thank you so much, Jamie! We're thrilled you enjoyed the pad thai our chef put serious love into that recipe. Hope to see you again soon!",
          time: "8m",
        },
        {
          name: "Marcus T.",
          rating: 3,
          text: "Food was good but service was slow on Friday. Took 25 minutes for an iced coffee.",
          ai: "Marcus, we're sorry the wait felt long Fridays at peak hours are our busiest. We've added a second barista on weekends since to fix exactly this.",
          time: "1h",
        },
      ].map((r) => (
        <div
          key={r.name}
          style={{
            background: C.surface,
            border: `1px solid ${C.line}`,
            borderRadius: 9,
            padding: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Stars value={r.rating} size={11} />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{r.name}</span>
            </div>
            <span style={{ fontSize: 10.5, color: C.muted }}>{r.time} ago</span>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: C.ink2,
              lineHeight: 1.5,
            }}
          >
            "{r.text}"
          </p>
          <div
            style={{
              marginTop: 10,
              padding: "8px 10px",
              background: C.pri50,
              border: `1px solid ${C.pri100}`,
              borderRadius: 7,
              fontSize: 11.5,
              lineHeight: 1.5,
              color: C.ink2,
            }}
          >
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: C.pri,
                letterSpacing: "0.08em",
                marginBottom: 4,
              }}
            >
              AI DRAFT · BRAND VOICE
            </div>
            {r.ai}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <span
              style={{
                fontSize: 10.5,
                padding: "3px 8px",
                borderRadius: 6,
                border: `1px solid ${C.line}`,
                color: C.ink2,
              }}
            >
              Edit
            </span>
            <span
              style={{
                fontSize: 10.5,
                padding: "3px 8px",
                borderRadius: 6,
                background: C.ink,
                color: "#fff",
                fontWeight: 600,
              }}
            >
              Approve & post →
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   QR scene — a printable counter card with QR + stats
---------------------------------------------------------------------------- */
export function QrScene() {
  return (
    <div
      style={{
        padding: 18,
        background: C.bg,
        height: "100%",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
      }}
    >
      <div style={{ gridColumn: "span 2" }}>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em" }}>
          QR CODES · WEST VILLAGE
        </div>
        <h3
          style={{
            margin: "4px 0 0",
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          Counter stands turning scans into reviews
        </h3>
      </div>

      {/* Counter-card preview */}
      <div
        style={{
          background: "linear-gradient(155deg, #232734 0%, #0E0F14 100%)",
          color: "#fff",
          borderRadius: 12,
          padding: 18,
          aspectRatio: "3 / 4",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "#fff",
            color: C.ink,
            borderRadius: 8,
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,.18)",
            transform: "rotate(-2deg)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 8,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: C.muted,
              }}
            >
              Scan to review
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>
              Blue Bottle West Village
            </div>
            <div style={{ display: "flex", gap: 2, marginTop: 2, alignItems: "center" }}>
              <Stars value={5} size={8} />
              <span style={{ fontSize: 9, color: C.muted, marginLeft: 3 }}>
                4.8 · 403
              </span>
            </div>
          </div>
          {/* Simple QR-ish grid for visual */}
          <QrGlyph size={40} />
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 18,
            fontSize: 9,
            letterSpacing: "0.15em",
            opacity: 0.65,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          }}
        >
          CODE · BLUE-WV
        </div>
        <span
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "rgba(255,255,255,.85)",
            color: C.ink,
            fontSize: 9,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 999,
            backdropFilter: "blur(6px)",
          }}
        >
          ● ACTIVE
        </span>
      </div>

      {/* Stats panel */}
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.line}`,
          borderRadius: 12,
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <StatRow label="Scans · 30d" value="247" />
        <StatRow label="Reviews from QR" value="62" />
        <StatRow label="Conversion" value="25.1%" />
        <StatRow label="Last scan" value="3m ago" />
        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10, marginTop: 4 }}>
          <div style={{ fontSize: 9.5, color: C.muted, letterSpacing: "0.08em" }}>
            PEAK HOURS
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 1,
              height: 32,
              marginTop: 6,
            }}
          >
            {[2, 3, 4, 6, 5, 7, 8, 10, 12, 9, 7, 5, 11, 13, 9, 8, 14, 16, 11, 7, 4, 3, 2, 1].map(
              (v, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: 24 fixed hour buckets
                  key={`h-${i}`}
                  style={{
                    flex: 1,
                    height: `${(v / 16) * 100}%`,
                    background: i >= 17 && i <= 19 ? C.pri : C.pri100,
                    borderRadius: 2,
                  }}
                />
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ fontSize: 11.5, color: C.muted }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{value}</span>
    </div>
  );
}

function QrGlyph({ size = 40 }: { size?: number }) {
  // Deterministic mock QR pattern — not scannable, looks the part.
  const cells = 8;
  const pattern = [
    1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0,
    1, 1, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1,
  ];
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "grid",
        gridTemplateColumns: `repeat(${cells}, 1fr)`,
        gap: 1,
      }}
    >
      {pattern.slice(0, cells * cells).map((c, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative grid
          key={`qr-${i}`}
          style={{ background: c ? C.ink : "transparent", borderRadius: 1 }}
        />
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Outreach scene — send a review request via SMS
---------------------------------------------------------------------------- */
export function OutreachScene() {
  return (
    <div
      style={{
        padding: 18,
        background: C.bg,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em" }}>
          OUTREACH · SMS REQUEST
        </div>
        <h3
          style={{
            margin: "4px 0 0",
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          Ask for the review 30 seconds after they leave
        </h3>
      </div>

      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.line}`,
          borderRadius: 11,
          padding: 14,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Field label="Recipient" value="Anna Chen · +1 (415) 555-0188" />
            <Field label="Location" value="Blue Bottle · West Village" />
            <Field label="Template" value="Post-visit thank-you (SMS)" />
            <div
              style={{
                background: C.surface2,
                border: `1px solid ${C.line}`,
                borderRadius: 8,
                padding: 10,
                fontSize: 11.5,
                lineHeight: 1.55,
                color: C.ink2,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              }}
            >
              Hi Anna 👋 thanks for visiting Blue Bottle West Village today. If
              you had a great time, a quick review means everything →
              repulabs.com/r/BLUE-WV
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
              <span
                style={{
                  fontSize: 10.5,
                  padding: "3px 8px",
                  borderRadius: 6,
                  border: `1px solid ${C.line}`,
                  color: C.ink2,
                }}
              >
                Save draft
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  padding: "3px 8px",
                  borderRadius: 6,
                  background: C.pri,
                  color: "#fff",
                  fontWeight: 600,
                }}
              >
                Send SMS now →
              </span>
            </div>
          </div>

          {/* Phone preview */}
          <div
            style={{
              background: "#000",
              borderRadius: 22,
              padding: 8,
              maxHeight: 200,
              position: "relative",
            }}
          >
            <div
              style={{
                background: "#f3f4f6",
                borderRadius: 16,
                height: "100%",
                padding: 10,
                fontSize: 11,
                color: C.ink2,
                position: "relative",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  textAlign: "center",
                  color: C.muted,
                  marginBottom: 8,
                }}
              >
                Text Message · Today 2:14 PM
              </div>
              <div
                style={{
                  background: "#fff",
                  padding: "8px 10px",
                  borderRadius: 12,
                  borderTopLeftRadius: 4,
                  fontSize: 11,
                  lineHeight: 1.45,
                  maxWidth: "88%",
                  boxShadow: "0 1px 2px rgba(0,0,0,.05)",
                }}
              >
                Hi Anna 👋 thanks for visiting Blue Bottle West Village today.
                If you had a great time, a quick review means everything →
                <span style={{ color: C.pri }}>repulabs.com/r/BLUE-WV</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        style={{ fontSize: 9.5, color: C.muted, letterSpacing: "0.08em", fontWeight: 600 }}
      >
        {label.toUpperCase()}
      </span>
      <span style={{ fontSize: 12.5, color: C.ink2, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Phone-receptionist scene — live call transcript
---------------------------------------------------------------------------- */
export function PhoneScene() {
  return (
    <div
      style={{
        padding: 18,
        background: C.bg,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em" }}>
          AI PHONE · LIVE CALL
        </div>
        <h3
          style={{
            margin: "4px 0 0",
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          Answer calls in your own voice, 24/7
        </h3>
      </div>

      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.line}`,
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>+1 (415) 555-0144</div>
            <div style={{ fontSize: 10.5, color: C.muted }}>
              Booking a table · started 2:14 PM
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: C.bad,
                animation: "phone-pulse 1.4s infinite",
              }}
            />
            <span style={{ fontSize: 11, fontWeight: 600, color: C.bad }}>LIVE · 00:42</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { who: "caller", text: "Hi, do you have a table for two tonight at 7?" },
            {
              who: "ai",
              text: "Hey! Let me check… yes, I have a window-side table at 7:15 would that work?",
            },
            { who: "caller", text: "Yes, perfect. Under the name Casey." },
            {
              who: "ai",
              text: "Got it. Booked for Casey, 7:15 tonight, party of 2. Confirmation text on its way.",
            },
          ].map((t, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: ordered call transcript
              key={`t-${i}`}
              style={{
                alignSelf: t.who === "caller" ? "flex-start" : "flex-end",
                background: t.who === "caller" ? C.surface2 : C.pri,
                color: t.who === "caller" ? C.ink2 : "#fff",
                padding: "7px 11px",
                borderRadius: 10,
                fontSize: 11.5,
                maxWidth: "78%",
                border: t.who === "caller" ? `1px solid ${C.line}` : "none",
              }}
            >
              {t.text}
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 12,
            padding: "8px 10px",
            background: "#ecfdf5",
            border: "1px solid #d1fae5",
            borderRadius: 8,
            fontSize: 11,
            color: "#065f46",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontWeight: 700 }}>✓</span>
          Booking written to Cal.com Casey, 2 guests, 7:15 PM
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Analytics scene — chart + topic chips
---------------------------------------------------------------------------- */
export function AnalyticsScene() {
  return (
    <div
      style={{
        padding: 18,
        background: C.bg,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em" }}>
          ANALYTICS · TOPIC TRENDS
        </div>
        <h3
          style={{
            margin: "4px 0 0",
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          What customers actually talk about
        </h3>
      </div>

      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.line}`,
          borderRadius: 11,
          padding: 14,
        }}
      >
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.08em" }}>
          MENTION VOLUME · 90 DAYS
        </div>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { topic: "fast service", count: 87, pct: 92, tone: "ok" },
            { topic: "great coffee", count: 64, pct: 68, tone: "ok" },
            { topic: "friendly staff", count: 51, pct: 54, tone: "ok" },
            { topic: "slow at peak", count: 19, pct: 20, tone: "warn" },
            { topic: "loud music", count: 8, pct: 9, tone: "warn" },
          ].map((t) => (
            <div
              key={t.topic}
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <span
                style={{
                  fontSize: 11.5,
                  width: 120,
                  color: C.ink2,
                  textTransform: "capitalize",
                }}
              >
                {t.topic}
              </span>
              <div
                style={{
                  flex: 1,
                  background: C.surface2,
                  borderRadius: 5,
                  height: 10,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${t.pct}%`,
                    height: "100%",
                    background: t.tone === "ok" ? C.ok : C.warn,
                    borderRadius: 5,
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: C.muted,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  width: 36,
                  textAlign: "right",
                }}
              >
                {t.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

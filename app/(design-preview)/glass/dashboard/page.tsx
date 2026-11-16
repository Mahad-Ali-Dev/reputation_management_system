"use client";

import {
  GlassButton,
  GlassCard,
  GlassChip,
  GlassDivider,
  type GlassMode,
  GlassStat,
} from "@/components/repulabs-ui/glass";
import { AreaTrend, SentimentSplit, SourceDonut } from "@/components/repulabs-ui/glass-charts";
import { GlassShell } from "@/components/repulabs-ui/glass-shell";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  Mail,
  MessageSquare,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import * as React from "react";

/* ── Mock data only (design spec §10) ── */
const stats = [
  { label: "Avg rating", value: "4.7", delta: "0.2", deltaTone: "up" as const },
  { label: "Reviews", value: "1,284", delta: "8.1%", deltaTone: "up" as const },
  { label: "Response rate", value: "92%", delta: "3%", deltaTone: "up" as const },
  { label: "NPS", value: "68", delta: "1", deltaTone: "down" as const },
];

const trend = [4.3, 4.35, 4.4, 4.38, 4.46, 4.5, 4.52, 4.49, 4.58, 4.62, 4.66, 4.7];
const trendLabels = ["Apr", "", "Jun", "", "Aug", "", "Oct", "", "Dec", "", "Feb", ""];

const sources = [
  { label: "Google", value: 742, color: "var(--glass-accent)" },
  { label: "Yelp", value: 312, color: "#12b998" },
  { label: "Facebook", value: 230, color: "#8b5cf6" },
];

const reviews = [
  {
    name: "Jordan Avery",
    initials: "JA",
    source: "Google",
    rating: 5,
    text: "Front desk was incredibly helpful and the cleaning was painless.",
    time: "2h ago",
    needsReply: true,
  },
  {
    name: "Priya Nair",
    initials: "PN",
    source: "Yelp",
    rating: 4,
    text: "Easy to book, friendly staff. Parking was a little tight.",
    time: "5h ago",
    needsReply: true,
  },
  {
    name: "Marcus Lee",
    initials: "ML",
    source: "Facebook",
    rating: 5,
    text: "Dr. Okafor explained everything clearly. Highly recommend.",
    time: "Yesterday",
    needsReply: false,
  },
  {
    name: "Hannah Cole",
    initials: "HC",
    source: "Google",
    rating: 5,
    text: "Cleanest office I've been to. In and out in 30 minutes.",
    time: "Yesterday",
    needsReply: false,
  },
  {
    name: "Diego Ramos",
    initials: "DR",
    source: "Google",
    rating: 3,
    text: "Good care but the wait was longer than expected.",
    time: "Mar 13",
    needsReply: true,
  },
  {
    name: "Aisha Khan",
    initials: "AK",
    source: "Yelp",
    rating: 5,
    text: "The whole team is lovely. Already booked my next visit.",
    time: "Mar 12",
    needsReply: false,
  },
];

const campaigns = [
  {
    name: "March review drive",
    channels: ["SMS", "Email"],
    status: "Active",
    sent: "820",
    opened: "61%",
    converted: "148",
  },
  {
    name: "Post-visit follow-up",
    channels: ["SMS"],
    status: "Active",
    sent: "1,240",
    opened: "54%",
    converted: "203",
  },
  {
    name: "Win-back — lapsed",
    channels: ["Email"],
    status: "Draft",
    sent: "—",
    opened: "—",
    converted: "—",
  },
];

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className="h-3.5 w-3.5"
          strokeWidth={1.75}
          style={{ color: s <= rating ? "#f5a623" : "var(--glass-text-subtle)" }}
          fill={s <= rating ? "#f5a623" : "none"}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function SectionTitle({
  children,
  action,
}: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[18px] font-semibold text-[var(--glass-text)]">{children}</h2>
      {action}
    </div>
  );
}

export default function GlassDashboardPage() {
  const [mode, setMode] = React.useState<GlassMode>("light");

  return (
    <GlassShell active="dashboard" mode={mode} onModeChange={setMode}>
      {/* Page header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--glass-text)] md:text-[30px]">
            Good morning, Summit Dental
          </h1>
          <p className="mt-1 glass-muted">
            Here's how your reputation is trending across all locations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <GlassButton leftIcon={CalendarDays} rightIcon={ChevronDown}>
            Mar 1 – Mar 31
          </GlassButton>
          <GlassButton variant="primary" leftIcon={Send}>
            Request reviews
          </GlassButton>
        </div>
      </header>

      {/* KPI row */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Key metrics">
        {stats.map((s) => (
          <GlassStat key={s.label} {...s} />
        ))}
      </section>

      {/* Main split */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Left: charts */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <GlassCard elevation="raised">
            <SectionTitle
              action={
                <span className="flex items-center gap-2">
                  <GlassChip accent icon={ArrowUpRight}>
                    +0.2 this month
                  </GlassChip>
                </span>
              }
            >
              Rating trend
            </SectionTitle>
            <AreaTrend
              data={trend}
              labels={trendLabels}
              ariaLabel="Average rating trend, rising from 4.3 to 4.7 over 12 months"
            />
          </GlassCard>

          <div className="grid gap-6 md:grid-cols-2">
            <GlassCard>
              <SectionTitle>Volume by source</SectionTitle>
              <SourceDonut segments={sources} />
            </GlassCard>
            <GlassCard>
              <SectionTitle>Sentiment split</SectionTitle>
              <div className="flex h-full flex-col justify-center gap-5">
                <div className="flex items-end gap-2">
                  <span className="text-[34px] font-semibold leading-none text-[var(--glass-text)] [font-variant-numeric:tabular-nums]">
                    84%
                  </span>
                  <span className="pb-1 text-[13px] glass-muted">positive overall</span>
                </div>
                <SentimentSplit positive={84} neutral={11} negative={5} />
              </div>
            </GlassCard>
          </div>
        </div>

        {/* Right: recent reviews */}
        <GlassCard elevation="raised" className="flex flex-col">
          <SectionTitle
            action={
              <button
                type="button"
                className="text-[13px] font-medium text-[var(--glass-accent)] hover:underline"
              >
                View all
              </button>
            }
          >
            Recent reviews
          </SectionTitle>
          <div className="-mr-1 flex max-h-[460px] flex-col gap-3 overflow-y-auto pr-1">
            {reviews.map((r, i) => (
              <React.Fragment key={r.name}>
                {i > 0 ? <GlassDivider /> : null}
                <article className="flex items-start gap-3">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-semibold"
                    style={{ background: "var(--glass-accent-soft)", color: "var(--glass-accent)" }}
                  >
                    {r.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium text-[var(--glass-text)]">
                        {r.name}
                      </span>
                      <GlassChip>{r.source}</GlassChip>
                      <span className="ml-auto whitespace-nowrap text-[12px] glass-subtle">
                        {r.time}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Stars rating={r.rating} />
                      {r.needsReply ? (
                        <span className="text-[11px] font-medium text-[var(--glass-accent)]">
                          Needs reply
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-1 text-[13px] glass-muted">{r.text}</p>
                  </div>
                </article>
              </React.Fragment>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Active campaigns */}
      <GlassCard className="mt-6" elevation="raised">
        <SectionTitle
          action={
            <button
              type="button"
              className="text-[13px] font-medium text-[var(--glass-accent)] hover:underline"
            >
              Manage campaigns
            </button>
          }
        >
          Active campaigns
        </SectionTitle>
        <div className="flex flex-col">
          {campaigns.map((c, i) => (
            <React.Fragment key={c.name}>
              {i > 0 ? <GlassDivider /> : null}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-3">
                <div className="flex min-w-[180px] flex-1 items-center gap-3">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                    style={{ background: "var(--glass-accent-soft)", color: "var(--glass-accent)" }}
                  >
                    {c.channels.includes("Email") ? (
                      <Mail className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <MessageSquare className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </span>
                  <div>
                    <p className="text-[14px] font-medium text-[var(--glass-text)]">{c.name}</p>
                    <div className="mt-1 flex gap-1.5">
                      {c.channels.map((ch) => (
                        <GlassChip key={ch}>{ch}</GlassChip>
                      ))}
                    </div>
                  </div>
                </div>
                <Metric label="Sent" value={c.sent} />
                <Metric label="Open" value={c.opened} />
                <Metric label="Reviews" value={c.converted} />
                <span
                  className="rounded-full px-2.5 py-1 text-[12px] font-medium"
                  style={
                    c.status === "Active"
                      ? { background: "rgba(16,185,129,0.14)", color: "#10b981" }
                      : { background: "var(--glass-fill-subtle)", color: "var(--glass-text-muted)" }
                  }
                >
                  {c.status}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </GlassCard>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-[12px] glass-subtle">
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        Glassmorphism preview · mock data
      </p>
    </GlassShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[64px]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] glass-subtle">{label}</p>
      <p className="text-[15px] font-semibold text-[var(--glass-text)] [font-variant-numeric:tabular-nums]">
        {value}
      </p>
    </div>
  );
}

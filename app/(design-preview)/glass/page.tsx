"use client";

import {
  GlassBar,
  GlassButton,
  GlassCanvas,
  GlassCard,
  GlassChip,
  GlassDivider,
  GlassInput,
  type GlassMode,
  GlassModeToggle,
  GlassStat,
  GlassSurface,
} from "@/components/repulabs-ui/glass";
import { ArrowUpRight, Bell, MessageSquare, Search, Send, Sparkles, Star } from "lucide-react";
import * as React from "react";

/* Mock data only — design spec §10. No live DB, no network. */
const stats = [
  { label: "Avg rating", value: "4.7", delta: "0.2", deltaTone: "up" as const },
  { label: "Reviews", value: "1,284", delta: "8.1%", deltaTone: "up" as const },
  { label: "Response rate", value: "92%", delta: "3%", deltaTone: "up" as const },
  { label: "NPS", value: "68", delta: "1", deltaTone: "down" as const },
];

const reviews = [
  {
    name: "Jordan Avery",
    initials: "JA",
    source: "Google",
    rating: 5,
    text: "Front desk was incredibly helpful and the cleaning was painless.",
    time: "2h ago",
  },
  {
    name: "Priya Nair",
    initials: "PN",
    source: "Yelp",
    rating: 4,
    text: "Easy to book, friendly staff. Parking was a little tight.",
    time: "Yesterday",
  },
  {
    name: "Marcus Lee",
    initials: "ML",
    source: "Facebook",
    rating: 5,
    text: "Dr. Okafor explained everything clearly. Highly recommend.",
    time: "Mar 14",
  },
];

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className="h-4 w-4"
          strokeWidth={1.75}
          style={{ color: s <= rating ? "#f5a623" : "var(--glass-text-subtle)" }}
          fill={s <= rating ? "#f5a623" : "none"}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export default function GlassFoundationPage() {
  const [mode, setMode] = React.useState<GlassMode>("light");

  return (
    <GlassCanvas mode={mode}>
      {/* Top bar */}
      <GlassBar>
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-4 px-4 md:px-8">
          <div className="flex items-center gap-2 font-semibold text-[var(--glass-text)]">
            <span
              className="grid h-8 w-8 place-items-center rounded-xl text-[var(--glass-accent-contrast)]"
              style={{ background: "var(--glass-accent)" }}
            >
              <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </span>
            Repulabs
          </div>
          <div className="relative ml-2 hidden flex-1 md:block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--glass-text-subtle)]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <input className="glass-input pl-9" placeholder="Search reviews, campaigns…" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <GlassModeToggle mode={mode} onChange={setMode} />
            <GlassButton aria-label="Notifications" className="h-10 w-10 px-0">
              <Bell aria-hidden="true" />
            </GlassButton>
          </div>
        </div>
      </GlassBar>

      {/* Body */}
      <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-8 md:py-10">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--glass-accent)]">
              Glassmorphism · Foundation
            </p>
            <h1 className="mt-2 text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[var(--glass-text)]">
              Good morning, Summit Dental Studio
            </h1>
            <p className="mt-1 glass-muted">
              Adaptive frosted ({""}
              <span className="font-medium text-[var(--glass-text)]">light</span>) + aurora (
              <span className="font-medium text-[var(--glass-text)]">dark</span>) — toggle it up
              top.
            </p>
          </div>
          <div className="flex gap-2">
            <GlassButton variant="ghost">View all</GlassButton>
            <GlassButton variant="primary" leftIcon={Send}>
              Request reviews
            </GlassButton>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <GlassStat key={s.label} {...s} />
          ))}
        </div>

        {/* Two-column: recent reviews + components showcase */}
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {/* Recent reviews */}
          <GlassCard className="lg:col-span-2" elevation="raised">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-[var(--glass-text)]">Recent reviews</h2>
              <GlassChip accent icon={Sparkles}>
                8 AI drafts ready
              </GlassChip>
            </div>
            <div className="flex flex-col gap-3">
              {reviews.map((r, i) => (
                <React.Fragment key={r.name}>
                  {i > 0 ? <GlassDivider /> : null}
                  <div className="flex items-start gap-3">
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold"
                      style={{
                        background: "var(--glass-accent-soft)",
                        color: "var(--glass-accent)",
                      }}
                    >
                      {r.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--glass-text)]">{r.name}</span>
                        <GlassChip>{r.source}</GlassChip>
                        <span className="ml-auto text-[12px] glass-subtle">{r.time}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Stars rating={r.rating} />
                      </div>
                      <p className="mt-1 truncate glass-muted">{r.text}</p>
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </GlassCard>

          {/* Component showcase */}
          <div className="flex flex-col gap-6">
            <GlassCard>
              <h2 className="mb-3 text-[18px] font-semibold text-[var(--glass-text)]">
                Reply composer
              </h2>
              <div className="grid gap-3">
                <GlassInput label="Reviewer" defaultValue="Jordan Avery" readOnly />
                <label className="grid gap-1.5">
                  <span className="text-[13px] font-medium text-[var(--glass-text)]">Draft</span>
                  <textarea
                    className="glass-input"
                    rows={3}
                    defaultValue="Thanks so much, Jordan — we're glad the visit was smooth!"
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <GlassButton size="sm" variant="ghost" leftIcon={MessageSquare}>
                    Regenerate
                  </GlassButton>
                  <GlassButton size="sm" variant="primary" leftIcon={Send}>
                    Send
                  </GlassButton>
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <h2 className="mb-3 text-[18px] font-semibold text-[var(--glass-text)]">Buttons</h2>
              <div className="flex flex-wrap gap-2">
                <GlassButton variant="primary">Primary</GlassButton>
                <GlassButton>Default</GlassButton>
                <GlassButton variant="ghost">Ghost</GlassButton>
                <GlassButton variant="primary" rightIcon={ArrowUpRight}>
                  Upgrade
                </GlassButton>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <GlassChip>Google</GlassChip>
                <GlassChip accent icon={Star}>
                  4.7 avg
                </GlassChip>
                <GlassChip>Needs reply</GlassChip>
              </div>
            </GlassCard>
          </div>
        </div>

        {/* Nested layering demo */}
        <GlassSurface className="mt-8 p-6" elevation="subtle">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-[18px] font-semibold text-[var(--glass-text)]">Layered depth</h2>
              <p className="glass-muted">
                Glass on glass on aurora — the frost refracts the canvas.
              </p>
            </div>
            <GlassCard className="w-full max-w-sm" elevation="raised" hover>
              <div className="flex items-center gap-3">
                <span
                  className="grid h-10 w-10 place-items-center rounded-xl text-[var(--glass-accent-contrast)]"
                  style={{ background: "var(--glass-accent)" }}
                >
                  <Sparkles className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                </span>
                <div>
                  <p className="font-medium text-[var(--glass-text)]">Raised + hover card</p>
                  <p className="text-[12px] glass-subtle">Hover to lift</p>
                </div>
              </div>
            </GlassCard>
          </div>
        </GlassSurface>
      </main>
    </GlassCanvas>
  );
}

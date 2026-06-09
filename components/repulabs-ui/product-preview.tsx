"use client";

import Link from "next/link";
import * as React from "react";
import {
  AlertCircle,
  Archive,
  BarChart3,
  Bell,
  Bot,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Flag,
  Globe2,
  Home,
  Inbox,
  LayoutGrid,
  LineChart,
  Link2,
  Lock,
  Mail,
  MapPin,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import {
  Avatar,
  AvatarGroup,
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  DateRangePicker,
  Drawer,
  DropdownMenu,
  EmptyState,
  Input,
  Modal,
  Pagination,
  ProgressMeter,
  Select,
  Skeleton,
  SourcePill,
  StarRating,
  StatCard,
  Tabs,
  Textarea,
  Toast,
} from "@/components/repulabs-ui";
import { cn } from "@/lib/utils";

const navItems: Array<{ href: string; icon: LucideIcon; label: string; value: ScreenSlug }> = [
  { href: "/design-preview/dashboard", icon: Home, label: "Dashboard", value: "dashboard" },
  { href: "/design-preview/reviews-inbox", icon: Inbox, label: "Reviews", value: "reviews-inbox" },
  { href: "/design-preview/campaigns", icon: Send, label: "Campaigns", value: "campaigns" },
  { href: "/design-preview/sentiment", icon: Sparkles, label: "Sentiment", value: "sentiment" },
  { href: "/design-preview/analytics", icon: BarChart3, label: "Analytics", value: "analytics" },
  { href: "/design-preview/widgets", icon: LayoutGrid, label: "Widgets", value: "widgets" },
  { href: "/design-preview/locations", icon: MapPin, label: "Locations", value: "locations" },
  {
    href: "/design-preview/integrations",
    icon: Link2,
    label: "Integrations",
    value: "integrations",
  },
  { href: "/design-preview/team", icon: Users, label: "Team", value: "team" },
  { href: "/design-preview/settings", icon: Settings, label: "Settings", value: "settings" },
  { href: "/design-preview/billing", icon: CircleDollarSign, label: "Billing", value: "billing" },
];

const reviews = [
  {
    initials: "MP",
    name: "Maya Patel",
    rating: 5,
    source: "Google" as const,
    status: "Needs reply",
    text: "Front desk was incredibly helpful and the cleaning was painless.",
    time: "2h ago",
  },
  {
    initials: "LG",
    name: "Leo Grant",
    rating: 4,
    source: "Yelp" as const,
    status: "Replied",
    text: "The visit started late, but Dr. Ames took time to explain every step.",
    time: "Yesterday",
  },
  {
    initials: "AC",
    name: "Ari Chen",
    rating: 5,
    source: "Facebook" as const,
    status: "Published",
    text: "Clean studio, kind team, and easy scheduling for my family.",
    time: "Mar 14",
  },
];

const campaignRows = [
  ["Spring cleaning follow-up", "SMS + Email", "Active", "426", "392", "41%", "28", "Mar 14"],
  ["New patient welcome", "Email", "Scheduled", "312", "0", "-", "-", "Mar 18"],
  ["Six month recall", "SMS", "Completed", "718", "701", "34%", "61", "Mar 04"],
];

const locations = [
  ["Downtown", "124 Market St", "Active", "4.8", "684", "94%"],
  ["Westside", "808 Pine Ave", "Needs attention", "4.5", "392", "86%"],
  ["Northgate", "42 Cedar Rd", "Pending", "4.7", "208", "91%"],
];

export const screenOrder = [
  "auth",
  "onboarding",
  "dashboard",
  "reviews-inbox",
  "campaigns",
  "sentiment",
  "analytics",
  "widgets",
  "locations",
  "team",
  "integrations",
  "settings",
  "billing",
  "system",
] as const;

export type ScreenSlug = (typeof screenOrder)[number];

export const screenTitles: Record<ScreenSlug, string> = {
  analytics: "Analytics & Reports",
  auth: "Authentication",
  billing: "Billing",
  campaigns: "Campaigns",
  dashboard: "Dashboard",
  integrations: "Integrations",
  locations: "Locations",
  onboarding: "Onboarding",
  "reviews-inbox": "Reviews Inbox",
  sentiment: "Sentiment",
  settings: "Settings",
  system: "System States",
  team: "Team & Roles",
  widgets: "Widgets",
};

function PreviewMark() {
  return (
    <div className="flex items-center gap-[10px]">
      <div className="grid h-9 w-9 place-items-center rounded-rl-control bg-rl-pri text-[14px] font-semibold text-white">
        R
      </div>
      <div>
        <p className="rl-body-strong leading-4">RepuLabs</p>
        <p className="rl-caption">Summit Dental Studio</p>
      </div>
    </div>
  );
}

function AppShell({
  active,
  actions,
  children,
  subtitle,
  title,
}: {
  active: ScreenSlug;
  actions?: React.ReactNode;
  children: React.ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <main className="rl-theme min-h-screen bg-rl-bg text-rl-text md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen border-r border-rl-border bg-rl-surface p-[20px] md:flex md:flex-col">
        <PreviewMark />
        <nav className="mt-[32px] grid gap-[4px]" aria-label="Design preview">
          <p className="rl-overline mb-[8px] px-[8px]">Product</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const selected = item.value === active;
            return (
              <Link
                className={cn(
                  "rl-focus-ring flex h-10 items-center gap-[10px] rounded-rl-control px-[12px] rl-label text-rl-text-muted transition-colors hover:bg-rl-surface-3 hover:text-rl-text",
                  selected && "bg-rl-pri-50 font-medium text-rl-pri",
                )}
                href={item.href}
                key={item.value}
              >
                <Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-rl-card border border-rl-border bg-rl-surface-2 p-[12px]">
          <div className="flex items-center gap-[10px]">
            <Avatar alt="Nora Shah" initials="NS" />
            <div>
              <p className="rl-body-strong">Nora Shah</p>
              <p className="rl-caption">Owner</p>
            </div>
          </div>
        </div>
      </aside>
      <section className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-[16px] border-b border-rl-border bg-rl-surface px-[16px] md:px-[24px] xl:px-[32px]">
          <Button aria-label="Open navigation" iconOnly leftIcon={Menu} variant="ghost" />
          <div className="hidden h-10 min-w-[280px] max-w-[440px] flex-1 items-center gap-[10px] rounded-rl-pill border border-rl-border bg-rl-surface-2 px-[14px] md:flex">
            <Search aria-hidden="true" className="h-4 w-4 text-rl-text-subtle" strokeWidth={1.75} />
            <span className="rl-body text-rl-text-subtle">Search reviews, contacts, locations</span>
            <span className="ml-auto rounded-[6px] border border-rl-border bg-rl-surface px-[6px] py-[2px] text-[11px] text-rl-text-subtle">
              Ctrl K
            </span>
          </div>
          <div className="ml-auto flex items-center gap-[8px]">
            <DateRangePicker />
            <Button aria-label="Notifications" iconOnly leftIcon={Bell} variant="secondary" />
            <Avatar alt="Nora Shah" initials="NS" />
          </div>
        </header>
        <div className="mx-auto max-w-[1280px] px-[16px] py-[32px] md:px-[24px] xl:px-[32px]">
          <div className="mb-[32px] flex flex-col gap-[16px] lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="rl-overline text-rl-pri">Design preview</p>
              <h1 className="rl-h1 mt-[6px]">{title}</h1>
              <p className="rl-body-lg mt-[6px]">{subtitle}</p>
            </div>
            {actions ? <div className="flex flex-wrap gap-[12px]">{actions}</div> : null}
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="grid gap-[16px]">
      <h2 className="rl-h2">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ children, cols = "lg:grid-cols-3" }: { children: React.ReactNode; cols?: string }) {
  return <div className={cn("grid gap-[16px]", cols)}>{children}</div>;
}

function SimpleTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Array<React.ReactNode>>;
}) {
  return (
    <div className="overflow-hidden rounded-rl-card border border-rl-border bg-rl-surface">
      <table className="w-full border-collapse">
        <thead className="bg-rl-surface-2">
          <tr>
            {columns.map((column) => (
              <th className="rl-overline px-[16px] py-[12px] text-left" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr className="border-t border-rl-border hover:bg-rl-surface-3" key={`${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td
                  className="px-[16px] py-[14px] rl-body text-rl-text"
                  key={`${rowIndex}-${cellIndex}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniChart({
  bars = [45, 70, 52, 86, 64, 92, 78],
  height = 180,
  mode = "line",
}: {
  bars?: number[];
  height?: number;
  mode?: "bar" | "line" | "area";
}) {
  const points = bars
    .map((value, index) => {
      const x = (index / Math.max(bars.length - 1, 1)) * 100;
      const y = 100 - value;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div
      aria-label="Preview chart"
      className="relative overflow-hidden rounded-rl-control bg-rl-surface-2"
      role="img"
      style={{ height }}
    >
      <div className="absolute inset-0 grid grid-rows-4">
        {[0, 1, 2, 3].map((line) => (
          <div className="border-b border-rl-border" key={line} />
        ))}
      </div>
      {mode === "bar" ? (
        <div className="absolute inset-[20px] flex items-end gap-[10px]">
          {bars.map((value, index) => (
            <div
              className="flex-1 rounded-t-[6px] bg-rl-pri"
              key={`${value}-${index}`}
              style={{ height: `${value}%`, opacity: 0.25 + index * 0.08 }}
            />
          ))}
        </div>
      ) : (
        <svg
          className="absolute inset-[18px] h-[calc(100%-36px)] w-[calc(100%-36px)] overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {mode === "area" ? (
            <polygon fill="var(--pri-100)" points={`0,100 ${points} 100,100`} opacity="0.8" />
          ) : null}
          <polyline
            fill="none"
            points={points}
            stroke="var(--pri)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  );
}

function SplitBar({
  parts,
}: { parts: Array<{ className: string; label: string; value: number }> }) {
  return (
    <div className="grid gap-[10px]">
      <div className="flex h-3 overflow-hidden rounded-rl-pill bg-rl-surface-3">
        {parts.map((part) => (
          <div className={part.className} key={part.label} style={{ width: `${part.value}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-[8px]">
        {parts.map((part) => (
          <Badge key={part.label}>
            {part.label} {part.value}%
          </Badge>
        ))}
      </div>
    </div>
  );
}

function ReviewItem({
  review,
  selected = false,
}: { review?: (typeof reviews)[number]; selected?: boolean }) {
  const item = review ?? reviews[0];
  if (!item) return null;

  return (
    <div
      className={cn(
        "flex min-w-0 gap-[12px] overflow-hidden rounded-rl-card border border-rl-border bg-rl-surface p-[14px]",
        selected && "border-l-2 border-l-rl-pri bg-rl-pri-50",
      )}
    >
      <Avatar alt={item.name} initials={item.initials} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-[8px]">
          <p className="rl-body-strong">{item.name}</p>
          <span className="shrink-0">
            <SourcePill source={item.source} />
          </span>
          <span className="shrink-0">
            <StarRating rating={item.rating} />
          </span>
        </div>
        <p className="mt-[6px] truncate rl-body">{item.text}</p>
        <div className="mt-[8px] flex items-center gap-[8px]">
          <span className="rl-caption">{item.time}</span>
          <Badge variant={item.status === "Needs reply" ? "warning" : "success"}>
            {item.status}
          </Badge>
        </div>
      </div>
    </div>
  );
}

function PhonePreview() {
  return (
    <div className="mx-auto w-[236px] rounded-[28px] border-[10px] border-rl-text bg-rl-surface p-[14px] shadow-rl-md">
      <div className="mx-auto mb-[12px] h-[5px] w-[64px] rounded-rl-pill bg-rl-surface-3" />
      <div className="rounded-rl-layer bg-rl-pri-50 p-[12px]">
        <p className="rl-caption text-rl-pri-700">SMS preview</p>
        <p className="rl-body-strong mt-[8px]">
          Hi Maya, thanks for visiting Summit Dental Studio. Would you share a quick review?
        </p>
        <Button className="mt-[16px] w-full" size="sm">
          Leave a review
        </Button>
      </div>
    </div>
  );
}

function IntegrationGlyph({ label }: { label: string }) {
  return (
    <div className="grid h-10 w-10 place-items-center rounded-rl-card bg-rl-surface-3 text-[13px] font-semibold text-rl-text">
      {label.slice(0, 1)}
    </div>
  );
}

function PageNote({ children }: { children: React.ReactNode }) {
  return <p className="rl-caption rounded-rl-card bg-rl-surface-2 p-[12px]">{children}</p>;
}

export function ProductPreviewIndex() {
  return (
    <main className="rl-theme min-h-screen bg-rl-bg px-[16px] py-[48px] md:px-[32px]">
      <div className="mx-auto max-w-[1100px]">
        <PreviewMark />
        <div className="mt-[32px]">
          <p className="rl-overline text-rl-pri">Complete product UI</p>
          <h1 className="rl-display mt-[8px]">RepuLabs preview map</h1>
          <p className="rl-body-lg mt-[12px] max-w-[70ch]">
            Full product surface generated from the ordered prompt pack, isolated from production
            routes.
          </p>
        </div>
        <div className="mt-[32px] grid gap-[12px] md:grid-cols-2 lg:grid-cols-3">
          {screenOrder.map((slug, index) => (
            <Link
              className="rl-focus-ring rounded-rl-card border border-rl-border bg-rl-surface p-[20px] shadow-rl-sm transition-shadow hover:shadow-rl-md"
              href={`/design-preview/${slug}`}
              key={slug}
            >
              <p className="rl-caption rl-tabular">{String(index + 1).padStart(2, "0")}</p>
              <h2 className="rl-h3 mt-[8px]">{screenTitles[slug]}</h2>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

export function AuthPreview() {
  return (
    <main className="rl-theme min-h-screen bg-rl-bg-2 px-[16px] py-[48px]">
      <div className="mx-auto grid max-w-[1180px] gap-[24px] lg:grid-cols-[0.9fr_1.1fr]">
        <section className="hidden rounded-rl-layer bg-rl-pri-900 p-[32px] text-white shadow-rl-lg lg:flex lg:flex-col lg:justify-between">
          <PreviewMark />
          <div>
            <StarRating rating={5} />
            <p className="mt-[24px] text-[30px] font-semibold leading-[36px] tracking-[-0.02em]">
              "RepuLabs helped our team answer every review before lunch."
            </p>
            <div className="mt-[24px] flex items-center gap-[12px]">
              <Avatar alt="Nora Shah" initials="NS" />
              <div>
                <p className="rl-body-strong text-white">Nora Shah</p>
                <p className="rl-caption text-white/70">Owner, Summit Dental Studio</p>
              </div>
            </div>
          </div>
        </section>
        <section className="grid gap-[16px] md:grid-cols-3 lg:grid-cols-1">
          <AuthCard title="Sign in" description="Continue to Summit Dental Studio.">
            <Input label="Email" placeholder="nora@summitdental.co" />
            <Input label="Password" placeholder="Enter password" type="password" />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-[8px] rl-caption text-rl-text-muted">
                <input className="accent-rl-pri" type="checkbox" defaultChecked /> Remember me
              </label>
              <Link className="rl-caption text-rl-pri" href="/design-preview/auth">
                Forgot password?
              </Link>
            </div>
            <Button className="w-full">Sign in</Button>
            <Button className="w-full" variant="secondary">
              Continue with Google
            </Button>
          </AuthCard>
          <AuthCard title="Create account" description="Launch reputation operations in minutes.">
            <Input label="Name" placeholder="Nora Shah" />
            <Input label="Business name" placeholder="Summit Dental Studio" />
            <Input
              label="Email"
              error="Use a work email address."
              placeholder="hello@example.com"
            />
            <ProgressMeter label="Password strength" max={100} value={72} />
            <Button className="w-full" loading>
              Create account
            </Button>
          </AuthCard>
          <AuthCard title="Reset access" description="We will send a reset link.">
            <Input label="Email" placeholder="nora@summitdental.co" />
            <Toast variant="success">Check your email for the reset link.</Toast>
            <Button className="w-full" variant="secondary">
              Back to login
            </Button>
          </AuthCard>
        </section>
      </div>
    </main>
  );
}

function AuthCard({
  children,
  description,
  title,
}: { children: React.ReactNode; description: string; title: string }) {
  return (
    <Card className="rounded-rl-layer p-[24px] shadow-rl-md md:p-[32px]">
      <h1 className="rl-h2">{title}</h1>
      <p className="rl-body mt-[6px]">{description}</p>
      <div className="mt-[24px] grid gap-[14px]">{children}</div>
    </Card>
  );
}

export function OnboardingPreview() {
  return (
    <main className="rl-theme min-h-screen bg-rl-bg px-[16px] py-[32px]">
      <div className="mx-auto max-w-[1040px]">
        <div className="mb-[32px] grid h-2 grid-cols-3 overflow-hidden rounded-rl-pill bg-rl-surface-3">
          <div className="bg-rl-pri" />
          <div className="bg-rl-pri" />
          <div className="bg-rl-surface-3" />
        </div>
        <div className="grid gap-[24px] lg:grid-cols-[minmax(0,620px)_280px] lg:justify-center">
          <Card className="rounded-rl-layer p-[24px] md:p-[32px]">
            <p className="rl-overline text-rl-pri">Step 2 of 3</p>
            <h1 className="rl-h1 mt-[8px]">Add your business</h1>
            <p className="rl-body-lg mt-[8px]">
              Connect platforms, confirm your profile, and invite the team.
            </p>
            <div className="mt-[24px] grid gap-[16px]">
              <Grid cols="md:grid-cols-3">
                {["Google Business Profile", "Yelp", "Facebook"].map((name, index) => (
                  <Card className="p-[16px]" key={name}>
                    <IntegrationGlyph label={name} />
                    <p className="rl-body-strong mt-[12px]">{name}</p>
                    <p className="rl-caption mt-[4px]">Pull reviews and source health.</p>
                    <Button
                      className="mt-[16px] w-full"
                      size="sm"
                      variant={index === 0 ? "secondary" : "primary"}
                      leftIcon={index === 0 ? Check : undefined}
                    >
                      {index === 0 ? "Connected" : "Connect"}
                    </Button>
                  </Card>
                ))}
              </Grid>
              <div className="grid gap-[12px] md:grid-cols-2">
                <Input label="Business name" value="Summit Dental Studio" readOnly />
                <Select label="Category" options={[{ label: "Dental clinic", value: "dental" }]} />
                <Input
                  className="md:col-span-2"
                  label="Address"
                  value="124 Market St, Austin, TX"
                  readOnly
                />
                <Input label="Phone" value="(512) 555-0184" readOnly />
                <Input label="Website" value="summitdental.co" readOnly />
              </div>
              <Card className="grid min-h-[160px] place-items-center bg-rl-surface-2">
                <MapPin className="h-8 w-8 text-rl-pri" strokeWidth={1.75} />
              </Card>
              <div className="flex justify-between gap-[12px] border-t border-rl-border pt-[16px]">
                <Button variant="ghost">Back</Button>
                <div className="flex gap-[12px]">
                  <Button variant="ghost">Skip for now</Button>
                  <Button>Continue</Button>
                </div>
              </div>
            </div>
          </Card>
          <Card className="h-fit bg-rl-surface-2">
            <CardTitle>Setup checklist</CardTitle>
            <div className="mt-[16px] grid gap-[12px]">
              {["Connect Google", "Confirm business profile", "Invite team"].map((item, index) => (
                <div className="flex items-center gap-[10px]" key={item}>
                  <Badge variant={index < 2 ? "success" : "neutral"}>
                    {index < 2 ? "Done" : "Next"}
                  </Badge>
                  <span className="rl-body-strong">{item}</span>
                </div>
              ))}
            </div>
            <EmptyState
              action={<Button size="sm">Go to dashboard</Button>}
              description="Once invites are sent, the workspace opens with starter data."
              icon={CheckCircle2}
              title="Ready to launch"
            />
          </Card>
        </div>
      </div>
    </main>
  );
}

export function DashboardPreview() {
  return (
    <AppShell
      active="dashboard"
      actions={<Button leftIcon={Send}>Request reviews</Button>}
      subtitle="Good morning, Nora. Summit Dental Studio is trending up this week."
      title="Dashboard"
    >
      <div className="grid gap-[24px]">
        <Grid cols="md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Avg rating" value="4.7" delta="+0.2" />
          <StatCard label="Total reviews" value="1,284" delta="+6%" />
          <StatCard label="Response rate" value="92%" delta="+8%" />
          <StatCard label="NPS" value="68" delta="+4" />
        </Grid>
        <div className="grid gap-[16px] lg:grid-cols-[2fr_1fr]">
          <div className="grid gap-[16px]">
            <Card>
              <CardHeader action={<Badge variant="info">Compared to previous</Badge>}>
                <CardTitle>Rating trend</CardTitle>
                <CardDescription>Average rating across connected sources.</CardDescription>
              </CardHeader>
              <MiniChart mode="area" height={300} />
            </Card>
            <Grid cols="lg:grid-cols-2">
              <Card>
                <CardTitle>Review volume by source</CardTitle>
                <div className="mt-[16px] grid gap-[12px]">
                  {[
                    ["Google", 76],
                    ["Yelp", 18],
                    ["Facebook", 6],
                  ].map(([source, value]) => (
                    <div key={source}>
                      <div className="flex justify-between">
                        <SourcePill source={source as "Google" | "Yelp" | "Facebook"} />
                        <span className="rl-caption rl-tabular">{value}%</span>
                      </div>
                      <ProgressMeter label="" max={100} value={Number(value)} />
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <CardTitle>Sentiment split</CardTitle>
                <div className="mt-[24px]">
                  <SplitBar
                    parts={[
                      { className: "bg-rl-success", label: "Positive", value: 72 },
                      { className: "bg-rl-warning", label: "Neutral", value: 19 },
                      { className: "bg-rl-danger", label: "Negative", value: 9 },
                    ]}
                  />
                </div>
              </Card>
            </Grid>
          </div>
          <Card>
            <CardHeader
              action={
                <Link className="rl-label text-rl-pri" href="/design-preview/reviews-inbox">
                  View all
                </Link>
              }
            >
              <CardTitle>Recent reviews</CardTitle>
            </CardHeader>
            <div className="grid gap-[12px]">
              {reviews.map((review) => (
                <ReviewItem key={review.name} review={review} />
              ))}
            </div>
          </Card>
        </div>
        <Card>
          <CardHeader
            action={
              <Button variant="secondary" size="sm">
                Manage
              </Button>
            }
          >
            <CardTitle>Active campaigns</CardTitle>
            <CardDescription>
              Spring cleaning follow-up is converting above baseline.
            </CardDescription>
          </CardHeader>
          <SimpleTable
            columns={["Campaign", "Sent", "Opened", "Reviews", "Status"]}
            rows={[
              [
                "Spring cleaning follow-up",
                "392",
                "41%",
                "28",
                <Badge key="active" variant="success">
                  Active
                </Badge>,
              ],
            ]}
          />
        </Card>
      </div>
    </AppShell>
  );
}

export function ReviewsInboxPreview() {
  return (
    <AppShell
      active="reviews-inbox"
      actions={<Button leftIcon={Bot}>Suggest replies</Button>}
      subtitle="Read, triage, and reply to every review from one queue."
      title="Reviews Inbox"
    >
      <div className="grid gap-[16px]">
        <Card className="flex flex-wrap items-center gap-[12px]">
          <div className="min-w-[260px] flex-1">
            <Input leadingIcon={Search} placeholder="Search reviews" />
          </div>
          {["Source", "Rating", "Status", "Date"].map((item) => (
            <Badge key={item}>
              {item} <ChevronDown className="h-3 w-3" />
            </Badge>
          ))}
          <Tabs
            style="segmented"
            items={[
              { label: "All", value: "all" },
              { label: "Needs reply", value: "needs" },
              { label: "Flagged", value: "flagged" },
            ]}
          />
        </Card>
        <div className="grid gap-[16px] lg:grid-cols-[380px_minmax(0,1fr)]">
          <Card className="overflow-hidden p-[12px]">
            <div className="sticky top-0 mb-[12px] rounded-rl-control bg-rl-pri-50 p-[10px]">
              <p className="rl-body-strong">2 selected</p>
              <div className="mt-[8px] flex gap-[8px]">
                <Button size="sm" variant="secondary">
                  Mark replied
                </Button>
                <Button size="sm" variant="ghost" leftIcon={Flag}>
                  Flag
                </Button>
              </div>
            </div>
            <div className="grid gap-[10px]">
              {reviews.map((review, index) => (
                <ReviewItem key={review.name} review={review} selected={index === 0} />
              ))}
              <Skeleton className="h-[84px]" />
            </div>
          </Card>
          <Card>
            <CardHeader
              action={
                <Button rightIcon={ExternalLink} variant="secondary" size="sm">
                  Open on Google
                </Button>
              }
              divided
            >
              <div className="flex items-center gap-[12px]">
                <Avatar alt="Maya Patel" initials="MP" size="lg" />
                <div>
                  <CardTitle>Maya Patel</CardTitle>
                  <div className="mt-[4px] flex flex-wrap items-center gap-[8px]">
                    <SourcePill source="Google" />
                    <StarRating rating={5} />
                    <span className="rl-caption">2h ago</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <p className="rl-body-lg text-rl-text">
              Front desk was incredibly helpful and the cleaning was painless. I felt cared for from
              check-in to checkout.
            </p>
            <div className="mt-[24px] rounded-rl-card border border-rl-pri-100 bg-rl-pri-50 p-[16px]">
              <div className="flex items-center justify-between gap-[12px]">
                <Badge icon={Sparkles} variant="info">
                  AI draft ready
                </Badge>
                <Button size="sm" variant="secondary">
                  Insert
                </Button>
              </div>
              <p className="rl-body mt-[12px] text-rl-text">
                Maya, thank you for sharing this. Our front desk team will be glad to hear the visit
                felt easy and comfortable.
              </p>
            </div>
            <div className="mt-[20px] grid gap-[12px]">
              <Select label="Tone" options={[{ label: "Warm and professional", value: "warm" }]} />
              <Textarea
                label="Reply"
                value="Maya, thank you for sharing this. We are so glad the visit felt comfortable."
                readOnly
              />
              <div className="flex flex-wrap items-center justify-between gap-[12px]">
                <span className="rl-caption">142 characters. 1 SMS segment.</span>
                <div className="flex gap-[12px]">
                  <Button variant="ghost">Save draft</Button>
                  <Button leftIcon={Send}>Send reply</Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

export function CampaignsPreview() {
  return (
    <AppShell
      active="campaigns"
      actions={<Button leftIcon={Plus}>New campaign</Button>}
      subtitle="Create, schedule, and measure review-request campaigns."
      title="Campaigns"
    >
      <div className="grid gap-[24px]">
        <Section title="Campaign list">
          <SimpleTable
            columns={[
              "Name",
              "Channel",
              "Status",
              "Audience",
              "Sent",
              "Open",
              "Reviews",
              "Updated",
            ]}
            rows={campaignRows.map((row) => [
              row[0],
              <Badge key={row[1]}>{row[1]}</Badge>,
              <Badge
                key={row[2]}
                variant={
                  row[2] === "Active" ? "success" : row[2] === "Scheduled" ? "info" : "neutral"
                }
              >
                {row[2]}
              </Badge>,
              ...row.slice(3),
            ])}
          />
        </Section>
        <div className="grid gap-[16px] lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle>Campaign builder</CardTitle>
              <CardDescription>One-scroll form with live message preview.</CardDescription>
            </CardHeader>
            <div className="grid gap-[16px]">
              <Grid cols="md:grid-cols-2">
                <Input label="Campaign name" value="Spring cleaning follow-up" readOnly />
                <Tabs
                  style="segmented"
                  items={[
                    { label: "SMS", value: "sms" },
                    { label: "Email", value: "email" },
                    { label: "Both", value: "both" },
                  ]}
                />
              </Grid>
              <Card className="bg-rl-surface-2">
                <CardTitle>Audience</CardTitle>
                <p className="rl-body mt-[8px]">
                  Recent visits from the last 30 days. Estimated 426 recipients.
                </p>
              </Card>
              <Textarea
                label="Message template"
                value="Hi {{first_name}}, thanks for visiting {{business}}. Would you share a quick review? {{review_link}}"
                readOnly
              />
              <div className="flex flex-wrap gap-[8px]">
                {["{{first_name}}", "{{business}}", "{{review_link}}", "Improve with AI"].map(
                  (chip) => (
                    <Badge key={chip} variant={chip.includes("AI") ? "info" : "neutral"}>
                      {chip}
                    </Badge>
                  ),
                )}
              </div>
              <Card className="sticky bottom-[16px] flex flex-wrap justify-end gap-[12px]">
                <Button variant="ghost">Save draft</Button>
                <Button variant="secondary">Send test</Button>
                <Modal
                  title="Schedule campaign"
                  description="426 recipients will receive this request tomorrow at 9:00 AM."
                  trigger={<Button>Schedule</Button>}
                  footer={
                    <>
                      <Button variant="ghost">Cancel</Button>
                      <Button>Confirm</Button>
                    </>
                  }
                >
                  <ProgressMeter label="Estimated send" max={426} value={426} />
                </Modal>
              </Card>
            </div>
          </Card>
          <Card>
            <CardTitle>Live preview</CardTitle>
            <div className="mt-[20px]">
              <PhonePreview />
            </div>
          </Card>
        </div>
        <Section title="Campaign analytics">
          <Grid cols="md:grid-cols-5">
            {[
              ["Sent", "392"],
              ["Delivered", "386"],
              ["Opened", "161"],
              ["Clicked", "74"],
              ["Reviews", "28"],
            ].map(([label, value]) => (
              <StatCard key={label ?? ""} label={label ?? ""} value={value ?? ""} delta="+6%" />
            ))}
          </Grid>
          <Card>
            <CardTitle>Conversion funnel</CardTitle>
            <div className="mt-[16px] grid gap-[12px]">
              {["Sent", "Delivered", "Opened", "Clicked", "Reviewed"].map((stage, index) => (
                <ProgressMeter key={stage} label={stage} max={100} value={100 - index * 18} />
              ))}
            </div>
          </Card>
        </Section>
      </div>
    </AppShell>
  );
}

export function SentimentPreview() {
  return (
    <AppShell
      active="sentiment"
      subtitle="Monitor language trends before they become reputation issues."
      title="Sentiment"
    >
      <div className="grid gap-[24px]">
        <div className="flex flex-wrap gap-[8px]">
          {["All", "Google", "Yelp", "Facebook"].map((item) => (
            <Badge key={item}>{item}</Badge>
          ))}
        </div>
        <Grid cols="md:grid-cols-4">
          <StatCard label="Positive" value="72%" delta="+5%" />
          <StatCard label="Neutral" value="19%" delta="+2%" />
          <StatCard label="Negative" value="9%" delta="-3%" deltaTone="danger" />
          <Card className="grid place-items-center text-center">
            <p className="rl-overline">Score</p>
            <p className="rl-display rl-tabular mt-[8px]">84</p>
            <Badge variant="success">Healthy</Badge>
          </Card>
        </Grid>
        <Card>
          <CardTitle>Sentiment over time</CardTitle>
          <div className="mt-[16px]">
            <MiniChart mode="area" height={300} />
          </div>
        </Card>
        <div className="grid gap-[16px] lg:grid-cols-[1.4fr_0.8fr]">
          <Card>
            <CardTitle>Themes & keywords</CardTitle>
            <div className="mt-[16px] grid gap-[12px]">
              {[
                ["Staff friendliness", "184 mentions", "Positive"],
                ["Wait time", "63 mentions", "Watch"],
                ["Pricing clarity", "41 mentions", "Neutral"],
              ].map(([name, count, tone]) => (
                <div
                  className="grid gap-[8px] rounded-rl-card border border-rl-border p-[14px]"
                  key={name}
                >
                  <div className="flex items-center justify-between">
                    <p className="rl-body-strong">{name}</p>
                    <Badge variant={tone === "Positive" ? "success" : "warning"}>{tone}</Badge>
                  </div>
                  <p className="rl-caption">{count}</p>
                  <MiniChart height={58} />
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardTitle>Alert rules</CardTitle>
            <div className="mt-[16px] grid gap-[12px]">
              <Badge variant="warning">Negative sentiment &gt; 20%</Badge>
              <Badge variant="info">Yelp rating drops below 4.3</Badge>
              <Modal
                title="New alert rule"
                trigger={<Button leftIcon={Plus}>New alert rule</Button>}
                footer={<Button>Create rule</Button>}
              >
                <div className="grid gap-[12px]">
                  <Select
                    label="Metric"
                    options={[{ label: "Negative sentiment", value: "negative" }]}
                  />
                  <Input label="Threshold" value="20%" readOnly />
                </div>
              </Modal>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

export function AnalyticsPreview() {
  return (
    <AppShell
      active="analytics"
      actions={
        <>
          <Button variant="secondary" leftIcon={Download}>
            Export
          </Button>
          <Button leftIcon={CalendarDays}>Schedule report</Button>
        </>
      }
      subtitle="A polished reporting workspace owners can read in 30 seconds."
      title="Analytics & Reports"
    >
      <div className="grid gap-[24px]">
        <Grid cols="md:grid-cols-5">
          {["Avg rating", "New reviews", "Response rate", "Avg response", "Conversion"].map(
            (label, index) => (
              <StatCard
                key={label}
                label={label}
                value={["4.7", "286", "92%", "3h", "18%"][index] ?? ""}
                delta="+6%"
              />
            ),
          )}
        </Grid>
        <Grid cols="lg:grid-cols-2">
          {[
            "Rating trend",
            "Review volume",
            "Volume by source",
            "Response time",
            "Reviews vs requests",
          ].map((title, index) => (
            <Card key={title}>
              <CardHeader action={<Badge>{index % 2 === 0 ? "Line" : "Bar"}</Badge>}>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <MiniChart mode={index % 2 === 0 ? "line" : "bar"} height={240} />
            </Card>
          ))}
        </Grid>
        <Card>
          <CardHeader
            action={
              <Button variant="secondary" size="sm">
                PDF layout
              </Button>
            }
          >
            <CardTitle>Breakdown by location</CardTitle>
          </CardHeader>
          <SimpleTable
            columns={["Location", "Rating", "Reviews", "Response rate", "Trend"]}
            rows={locations.map((location) => [
              location[0],
              location[3],
              location[4],
              location[5],
              <MiniChart key={location[0]} height={44} />,
            ])}
          />
        </Card>
      </div>
    </AppShell>
  );
}

export function WidgetsPreview() {
  return (
    <AppShell
      active="widgets"
      subtitle="Build embeddable review showcases for the business website."
      title="Widgets"
    >
      <div className="grid gap-[16px] lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <CardTitle>Controls</CardTitle>
          <div className="mt-[16px] grid gap-[14px]">
            <Grid cols="grid-cols-2">
              {["Carousel", "Grid", "Wall", "Floating badge"].map((type) => (
                <Card className="p-[12px]" key={type}>
                  <p className="rl-body-strong">{type}</p>
                </Card>
              ))}
            </Grid>
            <Tabs
              style="segmented"
              items={[
                { label: "Light", value: "light" },
                { label: "Dark", value: "dark" },
                { label: "Auto", value: "auto" },
              ]}
            />
            <Select label="Minimum rating" options={[{ label: "4 stars and up", value: "4" }]} />
            <ProgressMeter label="Corner radius" max={24} value={12} />
            <div className="flex flex-wrap gap-[8px]">
              {["Photo", "Date", "Source", "Autoplay"].map((item) => (
                <Badge key={item} variant="info">
                  {item}
                </Badge>
              ))}
            </div>
          </div>
        </Card>
        <div className="grid gap-[16px]">
          <Card>
            <CardHeader
              action={
                <Tabs
                  style="segmented"
                  items={[
                    { label: "Desktop", value: "desktop" },
                    { label: "Mobile", value: "mobile" },
                  ]}
                />
              }
            >
              <CardTitle>Live preview</CardTitle>
            </CardHeader>
            <div className="rounded-rl-layer bg-rl-surface-2 p-[24px]">
              <div className="rounded-rl-card bg-rl-surface p-[24px] shadow-rl-sm">
                <p className="rl-h3">What patients say</p>
                <div className="mt-[16px] grid gap-[12px] md:grid-cols-3">
                  {reviews.map((review) => (
                    <ReviewItem key={review.name} review={review} />
                  ))}
                </div>
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader action={<Button leftIcon={Copy}>Copy code</Button>}>
              <CardTitle>Embed code</CardTitle>
            </CardHeader>
            <pre className="overflow-auto rounded-rl-control bg-rl-surface-3 p-[16px] text-[12px] text-rl-text-muted">{`<script src="https://repulabs.com/widget.js" data-id="summit-dental"></script>`}</pre>
            <Toast variant="success">Code copied to clipboard.</Toast>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

export function LocationsPreview() {
  return (
    <AppShell
      active="locations"
      actions={<Button leftIcon={Plus}>Add location</Button>}
      subtitle="Manage every storefront, source, and local default."
      title="Locations"
    >
      <div className="grid gap-[24px]">
        <Grid cols="md:grid-cols-3">
          <StatCard label="Locations" value="3" delta="+1" />
          <StatCard label="Group avg rating" value="4.7" delta="+0.1" />
          <StatCard label="Lowest performer" value="Westside" delta="-0.2" deltaTone="danger" />
        </Grid>
        <Grid cols="lg:grid-cols-3">
          {locations.map((location) => (
            <Card key={location[0]}>
              <div className="flex items-start justify-between gap-[12px]">
                <div>
                  <CardTitle>{location[0]}</CardTitle>
                  <p className="rl-caption mt-[4px]">{location[1]}</p>
                </div>
                <Badge
                  variant={
                    location[2] === "Active"
                      ? "success"
                      : location[2] === "Pending"
                        ? "info"
                        : "warning"
                  }
                >
                  {location[2]}
                </Badge>
              </div>
              <div className="mt-[20px] flex items-center justify-between">
                <StarRating rating={Math.round(Number(location[3]))} />
                <p className="rl-h2 rl-tabular">{location[3]}</p>
              </div>
              <div className="mt-[16px] flex gap-[8px]">
                <SourcePill source="Google" />
                <SourcePill source="Yelp" />
              </div>
            </Card>
          ))}
        </Grid>
        <Card>
          <CardHeader
            action={
              <Drawer
                title="Edit location"
                trigger={<Button variant="secondary">Edit</Button>}
                footer={<Button>Save location</Button>}
              >
                <Input label="Location name" value="Downtown" readOnly />
                <Input label="Address" value="124 Market St" readOnly />
              </Drawer>
            }
          >
            <CardTitle>Downtown detail</CardTitle>
            <CardDescription>
              Overview, profile, sources, team, and campaign defaults.
            </CardDescription>
          </CardHeader>
          <Tabs
            items={[
              {
                label: "Overview",
                value: "overview",
                content: (
                  <Grid cols="md:grid-cols-3">
                    <StatCard label="Rating" value="4.8" />
                    <StatCard label="Reviews" value="684" />
                    <StatCard label="Response" value="94%" />
                  </Grid>
                ),
              },
              {
                label: "Profile",
                value: "profile",
                content: (
                  <Grid cols="md:grid-cols-2">
                    <Input label="Phone" value="(512) 555-0184" readOnly />
                    <Input label="Hours" value="Mon-Fri 8-5" readOnly />
                  </Grid>
                ),
              },
              {
                label: "Sources",
                value: "sources",
                content: (
                  <div className="flex gap-[8px]">
                    <Badge variant="success">Google connected</Badge>
                    <Badge variant="warning">Yelp reconnect</Badge>
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </div>
    </AppShell>
  );
}

export function TeamPreview() {
  return (
    <AppShell
      active="team"
      actions={<Button leftIcon={UserPlus}>Invite member</Button>}
      subtitle="Control access by role, location, and capability."
      title="Team & Roles"
    >
      <div className="grid gap-[24px]">
        <SimpleTable
          columns={["Member", "Role", "Locations", "Status", "Last active", ""]}
          rows={[
            [
              <div key="nora" className="flex items-center gap-[10px]">
                <Avatar alt="Nora Shah" initials="NS" /> Nora Shah
              </div>,
              <Badge key="owner">Owner</Badge>,
              "All",
              <Badge key="active" variant="success">
                Active
              </Badge>,
              "Now",
              <DropdownMenu key="m" />,
            ],
            [
              <div key="ivy" className="flex items-center gap-[10px]">
                <Avatar alt="Ivy Kim" initials="IK" /> Ivy Kim
              </div>,
              <Badge key="manager">Manager</Badge>,
              "Downtown",
              <Badge key="invited" variant="info">
                Invited
              </Badge>,
              "Pending",
              <DropdownMenu key="m2" />,
            ],
          ]}
        />
        <Drawer
          title="Invite member"
          trigger={
            <Button variant="secondary" leftIcon={Mail}>
              Open invite drawer
            </Button>
          }
          footer={<Button loading>Send invite</Button>}
        >
          <div className="grid gap-[12px]">
            <Input label="Emails" placeholder="ivy@summitdental.co" />
            <Select
              label="Role"
              options={[{ label: "Manager - reviews and campaigns", value: "manager" }]}
            />
            <Badge variant="info">Assigned to Downtown and Westside</Badge>
          </div>
        </Drawer>
        <Card>
          <CardTitle>Roles & permissions</CardTitle>
          <SimpleTable
            columns={["Capability", "Owner", "Admin", "Manager", "Staff"]}
            rows={[
              "View reviews",
              "Reply to reviews",
              "Manage campaigns",
              "Manage billing",
              "Manage team",
              "Manage settings",
            ].map((cap, index) => [
              cap,
              <Check key="o" />,
              <Check key="a" />,
              index < 3 ? <Check key="m" /> : "-",
              index === 0 ? <Check key="s" /> : "-",
            ])}
          />
        </Card>
      </div>
    </AppShell>
  );
}

export function IntegrationsPreview() {
  const integrations: Array<[string, string, string, string]> = [
    ["Google", "Review platform", "Connected", "Synced 5m ago"],
    ["Yelp", "Review platform", "Needs attention", "Reconnect token"],
    ["Facebook", "Social reviews", "Connected", "Synced 12m ago"],
    ["Twilio", "SMS", "Not connected", "Send review requests"],
    ["SendGrid", "Email", "Not connected", "Campaign email"],
    ["Zapier", "Automation", "Not connected", "Connect workflows"],
    ["HubSpot", "CRM", "Connected", "Synced 1h ago"],
    ["Webhook", "Developer", "Not connected", "Custom events"],
  ];
  return (
    <AppShell
      active="integrations"
      subtitle="Connect the systems reputation depends on."
      title="Integrations"
    >
      <div className="grid gap-[24px]">
        <Card className="flex flex-wrap items-center gap-[12px]">
          <div className="min-w-[260px] flex-1">
            <Input leadingIcon={Search} placeholder="Search integrations" />
          </div>
          {["All", "Review platforms", "Messaging", "CRM", "Automation"].map((item) => (
            <Badge key={item}>{item}</Badge>
          ))}
        </Card>
        <Card className="flex flex-wrap items-center gap-[12px]">
          <Badge variant="success">4 connected</Badge>
          <Badge variant="warning">1 needs attention</Badge>
          <span className="rl-body">All locations are syncing except Yelp Westside.</span>
        </Card>
        <Grid cols="md:grid-cols-2 xl:grid-cols-3">
          {integrations.map(([name, category, status, detail]) => (
            <Card key={name} hover>
              <div className="flex items-start justify-between gap-[12px]">
                <IntegrationGlyph label={name} />
                <DropdownMenu />
              </div>
              <h3 className="rl-h3 mt-[16px]">{name}</h3>
              <p className="rl-body mt-[4px]">
                {category}. {detail}
              </p>
              <div className="mt-[20px] flex items-center justify-between">
                <Badge
                  variant={
                    status === "Connected"
                      ? "success"
                      : status === "Needs attention"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {status}
                </Badge>
                <Drawer
                  title={`Configure ${name}`}
                  trigger={
                    <Button size="sm" variant="secondary">
                      {status === "Not connected" ? "Connect" : "Configure"}
                    </Button>
                  }
                  footer={
                    <>
                      <Button variant="danger">Disconnect</Button>
                      <Button>Save</Button>
                    </>
                  }
                >
                  <div className="grid gap-[12px]">
                    <Input label="Sync frequency" value="Every 15 minutes" readOnly />
                    <Badge variant="success">Test connection passed</Badge>
                  </div>
                </Drawer>
              </div>
            </Card>
          ))}
          <Card className="grid place-items-center border-dashed text-center">
            <EmptyState
              icon={Webhook}
              title="Request integration"
              description="Tell us which tool your team needs next."
              action={<Button variant="secondary">Request</Button>}
            />
          </Card>
        </Grid>
      </div>
    </AppShell>
  );
}

export function SettingsPreview() {
  return (
    <AppShell
      active="settings"
      subtitle="Workspace controls with grouped fields and a dirty-state save bar."
      title="Settings"
    >
      <div className="grid gap-[16px] lg:grid-cols-[220px_minmax(0,720px)]">
        <Card className="h-fit">
          {[
            "Profile",
            "Business profile",
            "Branding",
            "Notifications",
            "Review settings",
            "Danger zone",
          ].map((item, index) => (
            <Link
              className={cn(
                "block rounded-rl-control px-[12px] py-[10px] rl-label",
                index === 0 ? "bg-rl-pri-50 text-rl-pri" : "text-rl-text-muted",
              )}
              href="/design-preview/settings"
              key={item}
            >
              {item}
            </Link>
          ))}
        </Card>
        <div className="grid gap-[16px]">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <Grid cols="md:grid-cols-2">
              <Input label="Name" value="Nora Shah" readOnly />
              <Input label="Email" value="nora@summitdental.co" readOnly />
            </Grid>
            <div className="mt-[16px]">
              <Badge variant="success">2FA enabled</Badge>
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Business profile</CardTitle>
            </CardHeader>
            <Grid cols="md:grid-cols-2">
              <Input label="Business name" value="Summit Dental Studio" readOnly />
              <Select label="Timezone" options={[{ label: "Central Time", value: "ct" }]} />
              <Input label="Default review link" value="repulabs.com/r/summit" readOnly />
            </Grid>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
            </CardHeader>
            <SimpleTable
              columns={["Event", "Email", "SMS", "In-app"]}
              rows={["New review", "Negative review", "Weekly report", "Campaign completed"].map(
                (event) => [event, <Check key="e" />, <Check key="s" />, <Check key="i" />],
              )}
            />
          </Card>
          <Card className="border-rl-danger-border bg-rl-danger-bg">
            <CardTitle>Danger zone</CardTitle>
            <p className="rl-body mt-[8px]">
              Export data or delete the account with confirm-by-typing.
            </p>
            <div className="mt-[16px] flex gap-[12px]">
              <Button variant="secondary">Export data</Button>
              <Modal
                title="Delete account"
                trigger={<Button variant="danger">Delete account</Button>}
                footer={<Button variant="danger">Delete permanently</Button>}
              >
                <Input label="Type DELETE" error="Confirmation required." />
              </Modal>
            </div>
          </Card>
          <Card className="sticky bottom-[16px] flex items-center justify-between shadow-rl-md">
            <span className="rl-body-strong">Unsaved changes</span>
            <div className="flex gap-[12px]">
              <Button variant="ghost">Discard</Button>
              <Button>Save changes</Button>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

export function BillingPreview() {
  return (
    <AppShell
      active="billing"
      subtitle="Stripe-clean plan, usage, payment, and invoice management."
      title="Billing"
    >
      <div className="grid gap-[24px]">
        <Badge variant="warning">
          Trial ends June 18, 2026. Add payment details to avoid interruption.
        </Badge>
        <Card>
          <div className="flex flex-col gap-[16px] lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="rl-overline">Current plan</p>
              <h2 className="rl-h1 mt-[8px]">Growth</h2>
              <p className="rl-body mt-[6px]">$149/month. Renews July 1, 2026.</p>
            </div>
            <div className="flex gap-[12px]">
              <Button variant="secondary">Change to annual</Button>
              <Button>Upgrade plan</Button>
            </div>
          </div>
        </Card>
        <Card>
          <CardTitle>Usage</CardTitle>
          <div className="mt-[16px] grid gap-[14px] md:grid-cols-2">
            <ProgressMeter label="Review requests" max={1000} value={820} />
            <ProgressMeter label="SMS credits" max={5000} value={4200} />
            <ProgressMeter label="Locations" max={5} value={3} />
            <ProgressMeter label="Seats" max={10} value={7} />
          </div>
        </Card>
        <Grid cols="lg:grid-cols-3">
          {["Starter", "Growth", "Scale"].map((plan) => (
            <Card className={cn(plan === "Growth" && "border-2 border-rl-pri")} key={plan}>
              <div className="flex items-center justify-between">
                <CardTitle>{plan}</CardTitle>
                {plan === "Growth" ? <Badge variant="info">Current</Badge> : null}
              </div>
              <p className="rl-h2 rl-tabular mt-[16px]">
                {plan === "Starter" ? "$79" : plan === "Growth" ? "$149" : "$299"}
                <span className="rl-caption">/mo</span>
              </p>
              <div className="mt-[16px] grid gap-[8px]">
                {["Requests", "Widgets", "Analytics", "Team roles"].map((feature) => (
                  <p className="rl-body flex gap-[8px]" key={feature}>
                    <Check className="h-4 w-4 text-rl-success" />
                    {feature}
                  </p>
                ))}
              </div>
              <Button
                className="mt-[20px] w-full"
                variant={plan === "Growth" ? "secondary" : "primary"}
              >
                {plan === "Growth" ? "Current plan" : "Choose plan"}
              </Button>
            </Card>
          ))}
        </Grid>
        <Grid cols="lg:grid-cols-2">
          <Card>
            <CardHeader action={<Button variant="secondary">Update</Button>}>
              <CardTitle>Payment method</CardTitle>
            </CardHeader>
            <div className="flex items-center gap-[12px]">
              <CreditCard className="h-8 w-8 text-rl-pri" />
              <div>
                <p className="rl-body-strong">Visa ending 4242</p>
                <p className="rl-caption">Expires 08/28. Billing to finance@summitdental.co</p>
              </div>
            </div>
          </Card>
          <Card>
            <CardTitle>Invoices</CardTitle>
            <div className="mt-[16px]">
              <SimpleTable
                columns={["Date", "Amount", "Status", ""]}
                rows={[
                  [
                    "Jun 1, 2026",
                    "$149.00",
                    <Badge key="paid" variant="success">
                      Paid
                    </Badge>,
                    <Button key="dl" size="sm" variant="ghost" leftIcon={Download}>
                      PDF
                    </Button>,
                  ],
                  [
                    "May 1, 2026",
                    "$149.00",
                    <Badge key="paid2" variant="success">
                      Paid
                    </Badge>,
                    <Button key="dl2" size="sm" variant="ghost" leftIcon={Download}>
                      PDF
                    </Button>,
                  ],
                ]}
              />
            </div>
            <Pagination page={1} pageSize={10} total={24} />
          </Card>
        </Grid>
      </div>
    </AppShell>
  );
}

export function SystemPreview() {
  return (
    <AppShell
      active="dashboard"
      subtitle="Utility states: errors, command palette, notifications, and account menu."
      title="System States"
    >
      <div className="grid gap-[24px]">
        <Grid cols="lg:grid-cols-3">
          <EmptyState
            icon={AlertCircle}
            title="404"
            description="The page moved or was renamed."
            action={<Button>Back to dashboard</Button>}
          />
          <EmptyState
            icon={ShieldAlert}
            title="Could not load"
            description="Retry the sync or contact support if this continues."
            action={<Button variant="secondary">Retry</Button>}
          />
          <EmptyState
            icon={LineChart}
            title="Coming soon"
            description="This report is being prepared for your workspace."
            action={<Button variant="ghost">Notify me</Button>}
          />
        </Grid>
        <Card className="mx-auto w-full max-w-[560px] shadow-rl-lg">
          <Input leadingIcon={Search} placeholder="Search actions, pages, and reviews" />
          <div className="mt-[16px] grid gap-[8px]">
            {["Request reviews", "Invite teammate", "Open billing", "Maya Patel review"].map(
              (result) => (
                <div
                  className="flex items-center gap-[12px] rounded-rl-control p-[10px] hover:bg-rl-surface-3"
                  key={result}
                >
                  <Search className="h-4 w-4 text-rl-text-subtle" />
                  <span className="rl-body-strong">{result}</span>
                </div>
              ),
            )}
          </div>
        </Card>
        <Grid cols="lg:grid-cols-2">
          <Card>
            <CardHeader action={<Button variant="ghost">Mark all read</Button>}>
              <CardTitle>Notifications</CardTitle>
            </CardHeader>
            {[
              "New Google review from Maya Patel",
              "Negative sentiment alert for Westside",
              "Campaign completed",
            ].map((item) => (
              <p className="border-t border-rl-border py-[12px] rl-body" key={item}>
                {item}
              </p>
            ))}
          </Card>
          <Card>
            <CardTitle>Account menu</CardTitle>
            <div className="mt-[16px] grid gap-[8px]">
              {["Profile", "Settings", "Billing", "Theme", "Sign out"].map((item) => (
                <Button key={item} variant={item === "Sign out" ? "danger" : "ghost"}>
                  {item}
                </Button>
              ))}
            </div>
          </Card>
        </Grid>
      </div>
    </AppShell>
  );
}

export const screenComponents: Record<ScreenSlug, React.ComponentType> = {
  analytics: AnalyticsPreview,
  auth: AuthPreview,
  billing: BillingPreview,
  campaigns: CampaignsPreview,
  dashboard: DashboardPreview,
  integrations: IntegrationsPreview,
  locations: LocationsPreview,
  onboarding: OnboardingPreview,
  "reviews-inbox": ReviewsInboxPreview,
  sentiment: SentimentPreview,
  settings: SettingsPreview,
  system: SystemPreview,
  team: TeamPreview,
  widgets: WidgetsPreview,
};

export function DesignPreviewScreen({ screen }: { screen: ScreenSlug }) {
  const Screen = screenComponents[screen];
  return <Screen />;
}

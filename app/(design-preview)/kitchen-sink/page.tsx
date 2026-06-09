"use client";

import type * as React from "react";
import {
  AlertCircle,
  Archive,
  Bell,
  Building2,
  Check,
  Copy,
  Download,
  Eye,
  Flag,
  Info,
  Mail,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Star,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  Avatar,
  AvatarGroup,
  Badge,
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DataTable,
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
  Tooltip,
} from "@/components/repulabs-ui";

const tableRows = [
  {
    id: "review-1",
    customer: (
      <div className="flex items-center gap-[12px]">
        <Avatar alt="Maya Patel" initials="MP" />
        <div>
          <p className="rl-body-strong">Maya Patel</p>
          <p className="rl-caption">2h ago</p>
        </div>
      </div>
    ),
    source: <SourcePill source="Google" />,
    rating: <StarRating rating={5} />,
    status: <Badge variant="warning">Needs reply</Badge>,
    reviews: "284",
  },
  {
    id: "review-2",
    customer: (
      <div className="flex items-center gap-[12px]">
        <Avatar alt="Leo Grant" initials="LG" />
        <div>
          <p className="rl-body-strong">Leo Grant</p>
          <p className="rl-caption">Yesterday</p>
        </div>
      </div>
    ),
    source: <SourcePill source="Yelp" />,
    rating: <StarRating rating={4} />,
    status: <Badge variant="success">Replied</Badge>,
    reviews: "96",
  },
  {
    id: "review-3",
    customer: (
      <div className="flex items-center gap-[12px]">
        <Avatar alt="Ari Chen" initials="AC" />
        <div>
          <p className="rl-body-strong">Ari Chen</p>
          <p className="rl-caption">Mar 14</p>
        </div>
      </div>
    ),
    source: <SourcePill source="Facebook" />,
    rating: <StarRating rating={5} />,
    status: <Badge variant="info">Published</Badge>,
    reviews: "51",
  },
];

const tableColumns = [
  { key: "customer", label: "Customer" },
  { key: "source", label: "Source", sortable: true },
  { key: "rating", label: "Rating" },
  { key: "status", label: "Status" },
  { key: "reviews", label: "Reviews", align: "right" as const, sortable: true },
] satisfies Array<{
  align?: "left" | "right";
  key: keyof (typeof tableRows)[number] & string;
  label: string;
  sortable?: boolean;
}>;

function Section({
  children,
  kicker,
  title,
}: {
  children: React.ReactNode;
  kicker: string;
  title: string;
}) {
  return (
    <section className="border-t border-rl-border py-[32px]">
      <div className="mb-[20px] flex flex-wrap items-end justify-between gap-[16px]">
        <div>
          <p className="rl-overline">{kicker}</p>
          <h2 className="rl-h2 mt-[4px]">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function KitchenSinkPage() {
  return (
    <main className="rl-theme min-h-screen bg-rl-bg px-[16px] py-[32px] md:px-[24px] xl:px-[32px]">
      <div className="mx-auto max-w-[1280px]">
        <header className="flex flex-col gap-[20px] pb-[32px] lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[760px]">
            <p className="rl-overline text-rl-pri">Design preview foundation</p>
            <h1 className="rl-h1 mt-[8px]">RepuLabs kitchen sink</h1>
            <p className="rl-body-lg mt-[8px]">
              Summit Dental Studio component states for Phase 1 review.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-[12px]">
            <DateRangePicker />
            <Button leftIcon={Send}>Request reviews</Button>
          </div>
        </header>

        <Section kicker="Theme" title="Color, type, focus">
          <div className="grid gap-[24px] lg:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-[16px]">
              <div>
                <p className="rl-display">Display 44/48</p>
                <p className="rl-h1 mt-[8px]">H1 page title 30/36</p>
                <p className="rl-h2 mt-[8px]">H2 section header 24/30</p>
                <p className="rl-h3 mt-[8px]">H3 card title 18/26</p>
                <p className="rl-body-lg mt-[12px] max-w-[70ch]">
                  Body-lg is used for important product copy with a calm, plain voice.
                </p>
                <p className="rl-body mt-[8px] max-w-[70ch]">
                  Body text stays at 14/21 with zero tracking, muted color, and enough space around
                  it to keep dense SaaS surfaces readable.
                </p>
                <p className="rl-caption mt-[8px]">Caption 12/16 for meta and helper text.</p>
              </div>
              <div className="flex flex-wrap gap-[12px]">
                <Button>Focus me</Button>
                <Button variant="secondary">Secondary focus</Button>
                <Tooltip label="Icon buttons include accessible labels">
                  <Button
                    aria-label="Preview notifications"
                    iconOnly
                    leftIcon={Bell}
                    variant="ghost"
                  />
                </Tooltip>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-[12px] sm:grid-cols-3">
              {[
                ["Canvas", "bg-rl-bg"],
                ["Surface", "bg-rl-surface"],
                ["Inset", "bg-rl-surface-2"],
                ["Hover", "bg-rl-surface-3"],
                ["Primary", "bg-rl-pri text-white"],
                ["Tint", "bg-rl-pri-50"],
                ["Success", "bg-rl-success-bg text-rl-success"],
                ["Warning", "bg-rl-warning-bg text-rl-warning"],
                ["Danger", "bg-rl-danger-bg text-rl-danger"],
              ].map(([label, className]) => (
                <div
                  className={`rounded-rl-control border border-rl-border p-[16px] shadow-rl-sm ${className}`}
                  key={label}
                >
                  <p className="rl-label">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section kicker="Actions" title="Button states">
          <div className="flex flex-wrap items-center gap-[12px]">
            <Button leftIcon={Plus}>Primary</Button>
            <Button leftIcon={Download} variant="secondary">
              Secondary
            </Button>
            <Button leftIcon={RefreshCw} variant="ghost">
              Ghost
            </Button>
            <Button leftIcon={Trash2} variant="danger">
              Danger
            </Button>
            <Button loading>Sending</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button
              aria-label="More options"
              iconOnly
              leftIcon={MoreHorizontal}
              variant="secondary"
            />
          </div>
        </Section>

        <Section kicker="Inputs" title="Input, textarea, select">
          <div className="grid gap-[16px] lg:grid-cols-3">
            <Input
              helper="Used for global search and filters."
              label="Search"
              leadingIcon={Search}
              placeholder="Search reviews"
            />
            <Input
              error="Email is required."
              label="Customer email"
              placeholder="maya@summitdental.com"
              trailingIcon={AlertCircle}
            />
            <Input disabled label="Disabled" placeholder="Connected from Google" />
            <Textarea
              helper="Counter and validation sit below the field."
              label="Reply draft"
              placeholder="Thanks for sharing your experience, Maya."
            />
            <Select
              helper="Native select styled to spec."
              label="Tone"
              options={[
                { label: "Warm and professional", value: "warm" },
                { label: "Brief", value: "brief" },
                { label: "Apologetic", value: "apology" },
              ]}
            />
            <Input label="With action" placeholder="Copy review link" trailingIcon={Copy} />
          </div>
        </Section>

        <Section kicker="Cards" title="Cards and metrics">
          <div className="grid gap-[16px] md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              delta="+4.2%"
              label="Avg rating"
              value="4.7"
              values={[4, 6, 5, 8, 9, 12, 14]}
            />
            <StatCard
              delta="+18%"
              label="Reviews"
              value="1,284"
              values={[6, 7, 8, 7, 10, 13, 16]}
            />
            <StatCard
              delta="+8%"
              label="Response rate"
              value="92%"
              values={[2, 5, 7, 11, 10, 16, 18]}
            />
            <StatCard
              delta="-3%"
              deltaTone="danger"
              label="Open issues"
              value="12"
              values={[14, 12, 13, 9, 8, 7, 6]}
            />
          </div>
          <div className="mt-[16px] grid gap-[16px] lg:grid-cols-3">
            <Card hover>
              <CardHeader
                action={
                  <Button size="sm" variant="secondary">
                    Manage
                  </Button>
                }
                divided
              >
                <CardTitle>Card header</CardTitle>
                <CardDescription>Optional action, divider, body, and footer.</CardDescription>
              </CardHeader>
              <p className="rl-body">
                Front desk was incredibly helpful and the cleaning was painless.
              </p>
              <CardFooter>
                <Button variant="ghost">Cancel</Button>
                <Button>Save</Button>
              </CardFooter>
            </Card>
            <EmptyState
              action={<Button leftIcon={Building2}>Connect platform</Button>}
              description="Connect Google to see reviews, sentiment, and campaign results here."
              icon={Star}
              title="No reputation data yet"
            />
            <div className="grid gap-[12px]">
              <Skeleton className="h-[56px]" />
              <Skeleton className="h-[96px]" />
              <Skeleton className="h-[160px]" />
            </div>
          </div>
        </Section>

        <Section kicker="Status" title="Badges, source pills, ratings, avatars">
          <div className="grid gap-[20px] lg:grid-cols-3">
            <div className="flex flex-wrap items-center gap-[8px]">
              <Badge>Neutral</Badge>
              <Badge dot variant="success">
                Active
              </Badge>
              <Badge dot variant="warning">
                Needs attention
              </Badge>
              <Badge dot variant="danger">
                Failed
              </Badge>
              <Badge icon={Info} variant="info">
                AI suggestion
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-[8px]">
              <SourcePill source="Google" />
              <SourcePill source="Yelp" />
              <SourcePill source="Facebook" />
            </div>
            <div className="flex flex-wrap items-center gap-[16px]">
              <StarRating rating={4} />
              <StarRating interactive rating={3} size="md" />
              <Avatar alt="Maya Patel" initials="MP" />
              <AvatarGroup
                avatars={[
                  { alt: "Maya Patel", initials: "MP" },
                  { alt: "Leo Grant", initials: "LG" },
                  { alt: "Ari Chen", initials: "AC" },
                ]}
                overflow={5}
              />
            </div>
          </div>
        </Section>

        <Section kicker="Data" title="Table, pagination, progress">
          <div className="grid gap-[20px]">
            <DataTable columns={tableColumns} rows={tableRows} selectedRowIds={["review-1"]} />
            <div className="flex flex-col gap-[20px] lg:flex-row lg:items-center lg:justify-between">
              <Pagination page={1} pageSize={20} total={1284} />
              <div className="grid w-full gap-[12px] lg:max-w-[420px]">
                <ProgressMeter label="Review requests" max={1000} value={820} />
                <ProgressMeter label="Locations" max={5} value={3} />
              </div>
            </div>
          </div>
        </Section>

        <Section kicker="Navigation" title="Tabs and menus">
          <div className="grid gap-[24px] lg:grid-cols-2">
            <Tabs
              items={[
                {
                  value: "all",
                  label: "All",
                  content: <p className="rl-body">All review activity.</p>,
                },
                {
                  value: "needs-reply",
                  label: "Needs reply",
                  content: <p className="rl-body">Open reply queue.</p>,
                },
                {
                  value: "flagged",
                  label: "Flagged",
                  content: <p className="rl-body">Reviews marked for follow-up.</p>,
                },
              ]}
            />
            <div className="flex flex-wrap items-start gap-[16px]">
              <Tabs
                items={[
                  { value: "monthly", label: "Monthly" },
                  { value: "annual", label: "Annual" },
                ]}
                style="segmented"
              />
              <DropdownMenu
                items={[
                  { label: "Assign teammate", icon: UserPlus },
                  { label: "Archive", icon: Archive },
                  { label: "Flag review", icon: Flag },
                  { label: "Delete", danger: true, icon: Trash2 },
                ]}
              />
            </div>
          </div>
        </Section>

        <Section kicker="Layers" title="Modal, drawer, tooltip, toast">
          <div className="grid gap-[16px] lg:grid-cols-2">
            <div className="flex flex-wrap items-center gap-[12px]">
              <Modal
                description="Confirm the audience and delivery window before sending."
                footer={
                  <>
                    <Button variant="ghost">Cancel</Button>
                    <Button leftIcon={Send}>Schedule</Button>
                  </>
                }
                title="Schedule campaign"
                trigger={
                  <Button leftIcon={Mail} variant="secondary">
                    Open modal
                  </Button>
                }
              >
                <div className="grid gap-[12px]">
                  <Input label="Campaign name" value="Spring cleaning follow-up" readOnly />
                  <Select
                    label="Audience"
                    options={[
                      { label: "Recent promoters", value: "promoters" },
                      { label: "All contacts", value: "all" },
                    ]}
                  />
                </div>
              </Modal>
              <Drawer
                footer={
                  <>
                    <Button variant="ghost">Discard</Button>
                    <Button>Save changes</Button>
                  </>
                }
                title="Configure integration"
                trigger={
                  <Button leftIcon={Settings} variant="secondary">
                    Open drawer
                  </Button>
                }
              >
                <div className="grid gap-[16px]">
                  <Input label="Sync frequency" value="Every 15 minutes" readOnly />
                  <ProgressMeter label="Synced locations" max={3} value={3} />
                </div>
              </Drawer>
              <Tooltip label="View public Google profile">
                <Button
                  aria-label="Preview public profile"
                  iconOnly
                  leftIcon={Eye}
                  variant="ghost"
                />
              </Tooltip>
            </div>
            <div className="grid gap-[12px] justify-items-start">
              <Toast
                action={
                  <Button size="sm" variant="ghost">
                    Undo
                  </Button>
                }
                variant="success"
              >
                Reply sent to Google.
              </Toast>
              <Toast variant="danger">Campaign failed to send. Check SMS credits.</Toast>
            </div>
          </div>
        </Section>
      </div>
    </main>
  );
}

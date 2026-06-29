import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import {
  ALL_PLATFORMS,
  getConnectedPlatforms,
  type SocialPlatform,
} from "@/lib/social/connections";
import { imageGenAvailability } from "@/lib/social/image-gen";
import { listLibraryAssets } from "@/lib/social/library";
import Link from "next/link";
import { Composer, type InitialPost, type MiniCalPost } from "./_components/composer";
import {
  generateCaptionsForComposer,
  generateCreativesForComposer,
  recommendTimesForComposer,
} from "./_components/composer-actions";
import { HistoryTab } from "./_components/history-tab";
import { LibraryTab } from "./_components/library-tab";
import type { LibraryAsset as PickerAsset } from "./_components/library-modal";
import { StudioKpis, StudioTabs } from "./_components/studio-kit";
import "./social-compose.css";

/**
 * Social Studio (Module 10) — the 4-tab hub on `/social/posts`.
 *
 *   ?tab=create   (default) → 3-column <Composer>
 *   ?tab=history            → <HistoryTab>
 *   ?tab=library            → <LibraryTab>
 *   Calendar is its own route (/social/calendar) linked from the tabs.
 *
 * Stays a SERVER component: it computes connection state + entitlement + loads
 * tab data, then mounts the client islands and passes the backend `lib/social/*`
 * services in as bound server-action props (so the client islands never import a
 * server-only module directly and orgId never reaches the client).
 *
 * `?post=<id>` hydrates the composer for the calendar's edit deep-link;
 * `?media=<url>` preselects a library asset (the Library tab's "Use in post").
 */

export const dynamic = "force-dynamic";

type TabKey = "create" | "history" | "library";

function parseTab(raw?: string): TabKey {
  return raw === "history" || raw === "library" ? raw : "create";
}

type KpiDelta = { pct: number; dir: "up" | "down" } | null;
type TrendMap = { scheduled?: KpiDelta; published?: KpiDelta; drafts?: KpiDelta };

/**
 * Percent change of `now` vs the `prev` 30-day window, for a KPI trend pill.
 * Returns null when there's no signal yet (both windows empty) so the card can
 * hide the pill instead of fabricating a "0%" / "↑ ∞%" — we never invent deltas.
 */
function pctDelta(now: number, prev: number): KpiDelta {
  if (now === 0 && prev === 0) return null;
  if (prev === 0) return { pct: 100, dir: "up" }; // new activity, no prior baseline
  const change = Math.round(((now - prev) / prev) * 100);
  if (change === 0) return { pct: 0, dir: "up" };
  return { pct: Math.abs(change), dir: change > 0 ? "up" : "down" };
}

/** Best-effort brand colors from establishment.brandVoice.colors → hex list. */
function extractBrandColors(brandVoice: unknown): string[] {
  if (brandVoice && typeof brandVoice === "object" && "colors" in brandVoice) {
    const colors = (brandVoice as { colors?: unknown }).colors;
    if (Array.isArray(colors)) {
      return colors
        .filter((c): c is string => typeof c === "string" && /^#?[0-9a-fA-F]{3,8}$/.test(c))
        .map((c) => (c.startsWith("#") ? c : `#${c}`))
        .slice(0, 4);
    }
  }
  return [];
}

export default async function SocialPostsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    post?: string;
    media?: string;
    hpage?: string;
    folder?: string;
    __empty?: string;
  }>;
}) {
  const { orgId, org } = await getOrgContext();
  const sp = await searchParams;
  const tab = parseTab(sp.tab);
  // Dev-only empty-state preview (?__empty=1) — forces the empty branch for
  // screenshot verification. Harmless flag; no effect on real reads.
  const forceEmpty = sp.__empty === "1";

  // Connection state — drives platform gating + the empty state.
  const connectedSet = await getConnectedPlatforms(orgId);
  const connectedPlatforms = ALL_PLATFORMS.filter((p) => connectedSet.has(p)) as SocialPlatform[];

  // KPI counts (cheap aggregate, always shown) + the 30-day trend windows that
  // drive each card's delta pill. All counts come from real socialPost rows —
  // the deltas compare the last 30 days against the prior 30 days, never faked.
  const NOW = Date.now();
  const DAY = 864e5;
  const win30 = new Date(NOW - 30 * DAY); // start of the current 30-day window
  const win60 = new Date(NOW - 60 * DAY); // start of the prior 30-day window
  const { counts, trend } = await withTenant(orgId, async (tx) => {
    const [grouped, schedNow, schedPrev, pubNow, pubPrev, draftNow, draftPrev] = await Promise.all([
      tx.socialPost.groupBy({ by: ["status"], _count: { _all: true } }),
      // Scheduled: posts that entered the queue, bucketed by creation time.
      tx.socialPost.count({ where: { status: "scheduled", createdAt: { gte: win30 } } }),
      tx.socialPost.count({
        where: { status: "scheduled", createdAt: { gte: win60, lt: win30 } },
      }),
      // Published: bucketed by when they actually went out (postedAt).
      tx.socialPost.count({
        where: { status: { in: ["published", "posted"] }, postedAt: { gte: win30 } },
      }),
      tx.socialPost.count({
        where: { status: { in: ["published", "posted"] }, postedAt: { gte: win60, lt: win30 } },
      }),
      // Drafts: bucketed by creation time.
      tx.socialPost.count({ where: { status: "draft", createdAt: { gte: win30 } } }),
      tx.socialPost.count({ where: { status: "draft", createdAt: { gte: win60, lt: win30 } } }),
    ]);
    const map: Record<string, number> = {};
    for (const g of grouped) map[g.status] = g._count._all;
    return {
      counts: map,
      trend: {
        scheduled: pctDelta(schedNow, schedPrev),
        published: pctDelta(pubNow, pubPrev),
        drafts: pctDelta(draftNow, draftPrev),
      },
    };
  }).catch(() => ({ counts: {} as Record<string, number>, trend: {} as TrendMap }));

  const scheduled = counts.scheduled ?? 0;
  // Demo seeds use "posted"; production publishes as "published".
  const published = (counts.published ?? 0) + (counts.posted ?? 0);
  const drafts = counts.draft ?? 0;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Engagement", "Social Studio"]}>
      <div className="sk-page">
        <PageHeader
          kicker="Cross-channel scheduler"
          title="Social studio"
          description="Compose once, preview per platform, and schedule across Facebook, Instagram, LinkedIn and X — with AI captions and creatives."
          actions={
            <>
              <Link href="/social/posts?tab=create" className="btn sk-hbtn">
                <Icon name="plus" size={14} />
                Create new post
              </Link>
              <Link href="/social/posts/bulk" className="btn btn--pri sk-hbtn">
                <Icon name="cal" size={14} />
                Bulk schedule
              </Link>
            </>
          }
        />

        <StudioKpis
          items={[
            {
              label: "Scheduled",
              value: String(scheduled),
              delta: trend.scheduled ?? null,
              icon: "cal",
              tone: "pri",
              art: "/assets/repulabs/post-creator/cp-scheduled.svg",
            },
            {
              label: "Published · all time",
              value: String(published),
              delta: trend.published ?? null,
              icon: "globe",
              tone: "green",
              art: "/assets/repulabs/post-creator/cp-published.svg",
            },
            {
              label: "Drafts",
              value: String(drafts),
              delta: trend.drafts ?? null,
              icon: "file",
              tone: "orange",
              art: "/assets/repulabs/post-creator/cp-drafts.svg",
            },
          ]}
        />

        <StudioTabs active={tab} />

        {tab === "create" && (
          <CreatePanel
            orgId={orgId}
            orgName={org.name}
            orgLogoUrl={org.logoUrl}
            connectedPlatforms={connectedPlatforms}
            postId={sp.post}
            presetMedia={sp.media}
            hasPosts={!forceEmpty && scheduled + published + drafts > 0}
          />
        )}
        {tab === "history" && (
          <HistoryTab orgId={orgId} page={Number(sp.hpage) || 1} forceEmpty={forceEmpty} />
        )}
        {tab === "library" && (
          <LibraryTab orgId={orgId} folder={sp.folder ?? null} forceEmpty={forceEmpty} />
        )}
      </div>
    </AppShellServer>
  );
}

/** Server panel that gathers the composer's data + mounts the client island. */
async function CreatePanel({
  orgId,
  orgName,
  orgLogoUrl,
  connectedPlatforms,
  postId,
  presetMedia,
  hasPosts,
}: {
  orgId: string;
  orgName: string;
  orgLogoUrl: string | null;
  connectedPlatforms: SocialPlatform[];
  postId?: string;
  presetMedia?: string;
  hasPosts: boolean;
}) {
  const isUuid = (s?: string) =>
    !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

  // Window for the schedule mini-calendar. Day-bucketing happens in the CLIENT
  // (browser timezone) — the server only fetches a generous window: current
  // month ±36h so posts near month boundaries land correctly in any user tz.
  const now = new Date();
  const PAD_MS = 36 * 60 * 60 * 1000;
  const monthStart = new Date(new Date(now.getFullYear(), now.getMonth(), 1).getTime() - PAD_MS);
  const monthEnd = new Date(new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() + PAD_MS);

  const [establishments, libraryAssetsRaw, imageGen, initialPostRow, monthPosts] = await Promise.all([
    withTenant(orgId, async (tx) =>
      tx.establishment.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, brandVoice: true },
        orderBy: { createdAt: "asc" },
      }),
    ).catch(() => []),
    listLibraryAssets(orgId, { take: 60 }),
    imageGenAvailability(orgId).catch(() => ({ available: false, reason: "not_configured" as const })),
    isUuid(postId)
      ? withTenant(orgId, async (tx) =>
          tx.socialPost.findFirst({
            where: { id: postId },
            select: {
              id: true,
              caption: true,
              hashtags: true,
              platforms: true,
              mediaUrl: true,
              approvedCreativeUrls: true,
              scheduledFor: true,
              establishmentId: true,
              status: true,
            },
          }),
        ).catch(() => null)
      : Promise.resolve(null),
    // Mini-calendar source: same shape the /social/calendar query uses, narrowed
    // to the current month. FAIL-SOFT — an unmigrated relation just renders an
    // unmarked grid instead of crashing the composer.
    withTenant(orgId, async (tx) =>
      tx.socialPost.findMany({
        where: {
          status: { in: ["scheduled", "published", "posted"] },
          OR: [
            { scheduledFor: { gte: monthStart, lt: monthEnd } },
            { postedAt: { gte: monthStart, lt: monthEnd } },
          ],
        },
        select: { status: true, scheduledFor: true, postedAt: true },
        take: 500,
      }),
    ).catch(() => []),
  ]);

  // Serializable posts for the client-side mini-calendar (it buckets by the
  // BROWSER's timezone; the server no longer picks the day).
  const miniCal: MiniCalPost[] = monthPosts.flatMap((p) => {
    const when = p.postedAt ?? p.scheduledFor;
    return when ? [{ status: p.status, when: when.toISOString() }] : [];
  });

  // Brand colors: first establishment with a brandVoice.colors wins.
  let brandColors: string[] = [];
  for (const e of establishments) {
    const colors = extractBrandColors(e.brandVoice);
    if (colors.length) {
      brandColors = colors;
      break;
    }
  }

  const libraryAssets: PickerAsset[] = libraryAssetsRaw.map((a) => ({
    id: a.id,
    url: a.url,
    kind: a.kind === "video" ? "video" : "image",
    folder: a.folder,
    caption: a.caption,
    sizeBytes: a.sizeBytes,
  }));

  // Build the InitialPost for an edit deep-link, OR seed media from ?media=.
  let initialPost: InitialPost | null = null;
  if (initialPostRow) {
    initialPost = {
      id: initialPostRow.id,
      caption: initialPostRow.caption,
      hashtags: initialPostRow.hashtags ?? [],
      platforms: initialPostRow.platforms ?? [],
      mediaUrl: initialPostRow.mediaUrl,
      approvedCreativeUrls: initialPostRow.approvedCreativeUrls ?? [],
      scheduledFor: initialPostRow.scheduledFor?.toISOString() ?? null,
      establishmentId: initialPostRow.establishmentId,
      status: initialPostRow.status,
    };
  } else if (presetMedia && /^https?:\/\//.test(presetMedia)) {
    initialPost = {
      id: "",
      caption: null,
      hashtags: [],
      platforms: [],
      mediaUrl: presetMedia,
      approvedCreativeUrls: [presetMedia],
      scheduledFor: null,
      establishmentId: null,
      status: "draft",
    };
  }

  return (
    <Composer
      connectedPlatforms={connectedPlatforms}
      establishments={establishments.map((e) => ({ id: e.id, name: e.name }))}
      orgName={orgName}
      orgLogoUrl={orgLogoUrl}
      brandColors={brandColors}
      libraryAssets={libraryAssets}
      imageGen={imageGen}
      generateCaptions={generateCaptionsForComposer}
      generateCreatives={generateCreativesForComposer}
      recommendTimes={recommendTimesForComposer}
      initialPost={initialPost}
      miniCal={miniCal}
      hasPosts={hasPosts}
    />
  );
}

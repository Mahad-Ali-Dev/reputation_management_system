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
import { Composer, type InitialPost, type MiniCalMonth } from "./_components/composer";
import {
  generateCaptionsForComposer,
  generateCreativesForComposer,
  recommendTimesForComposer,
} from "./_components/composer-actions";
import { HistoryTab } from "./_components/history-tab";
import { HubTabs } from "./_components/hub-tabs";
import { LibraryTab } from "./_components/library-tab";
import type { LibraryAsset as PickerAsset } from "./_components/library-modal";

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
  }>;
}) {
  const { orgId, org } = await getOrgContext();
  const sp = await searchParams;
  const tab = parseTab(sp.tab);

  // Connection state — drives platform gating + the empty state.
  const connectedSet = await getConnectedPlatforms(orgId);
  const connectedPlatforms = ALL_PLATFORMS.filter((p) => connectedSet.has(p)) as SocialPlatform[];

  // KPI counts (cheap aggregate, always shown).
  const counts = await withTenant(orgId, async (tx) => {
    const grouped = await tx.socialPost.groupBy({ by: ["status"], _count: { _all: true } });
    const map: Record<string, number> = {};
    for (const g of grouped) map[g.status] = g._count._all;
    return map;
  }).catch(() => ({}) as Record<string, number>);

  const scheduled = counts.scheduled ?? 0;
  const published = counts.published ?? 0;
  const drafts = counts.draft ?? 0;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Engagement", "Social Studio"]}>
      <PageHeader
        kicker="Cross-channel scheduler"
        title="Social studio"
        description="Compose once, preview per platform, and schedule across Facebook, Instagram, LinkedIn and X — with AI captions and creatives."
        actions={
          <Link href="/social/posts/bulk" className="btn">
            <Icon name="bars" size={12} />
            Bulk schedule
          </Link>
        }
      />

      <div className="grid-3" style={{ gap: 12, marginBottom: 18 }}>
        <Kpi l="Scheduled" v={String(scheduled)} d="Queued to publish" />
        <Kpi l="Published · all time" v={String(published)} d="Across all channels" />
        <Kpi l="Drafts" v={String(drafts)} d="Not yet sent" />
      </div>

      <HubTabs active={tab} />

      {tab === "create" && (
        <CreatePanel
          orgId={orgId}
          orgName={org.name}
          orgLogoUrl={org.logoUrl}
          connectedPlatforms={connectedPlatforms}
          postId={sp.post}
          presetMedia={sp.media}
        />
      )}
      {tab === "history" && <HistoryTab orgId={orgId} page={Number(sp.hpage) || 1} />}
      {tab === "library" && <LibraryTab orgId={orgId} folder={sp.folder ?? null} />}
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
}: {
  orgId: string;
  orgName: string;
  orgLogoUrl: string | null;
  connectedPlatforms: SocialPlatform[];
  postId?: string;
  presetMedia?: string;
}) {
  const isUuid = (s?: string) =>
    !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

  // Window for the schedule mini-calendar (current month, server tz).
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

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
          status: { in: ["scheduled", "published"] },
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

  // Collapse month posts → marked day numbers (published wins over scheduled).
  const scheduledDays = new Set<number>();
  const publishedDays = new Set<number>();
  for (const p of monthPosts) {
    const when = p.postedAt ?? p.scheduledFor;
    if (!when || when < monthStart || when >= monthEnd) continue;
    (p.status === "published" ? publishedDays : scheduledDays).add(when.getDate());
  }
  const miniCal: MiniCalMonth = {
    ym: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    label: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
    firstDow: (monthStart.getDay() + 6) % 7, // Monday-first, like /social/calendar
    today: now.getDate(),
    scheduledDays: [...scheduledDays],
    publishedDays: [...publishedDays],
  };

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
    />
  );
}

function Kpi({ l, v, d }: { l: string; v: string; d: string }) {
  return (
    <div className="ds-card">
      <div className="stat">
        <div className="stat__label">{l}</div>
        <div className="stat__value" style={{ fontSize: 30 }}>
          {v}
        </div>
        <div className="stat__delta">{d}</div>
      </div>
    </div>
  );
}

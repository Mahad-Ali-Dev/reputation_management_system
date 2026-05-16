import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon, type IconName } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import Link from "next/link";
import { CreatePostForm } from "./form";

/**
 * Social posts — repulabs v2 design.
 *
 * Compose form + recent posts list. Real data: SocialPost model.
 */

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  draft: "chip--out",
  scheduled: "chip--warn",
  publishing: "chip--info",
  published: "chip--ok",
  failed: "chip--bad",
};

const PLATFORM_ICON: Record<string, IconName> = {
  facebook: "fb",
  instagram: "insta",
  linkedin: "linkedin",
  twitter: "twitter",
};

export default async function SocialPostsPage() {
  const { orgId } = await getOrgContext();

  const [posts, establishments] = await withTenant(orgId, async (tx) =>
    Promise.all([
      tx.socialPost.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
      tx.establishment.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
      }),
    ]),
  );

  const scheduled = posts.filter((p) => p.status === "scheduled").length;
  const published = posts.filter((p) => p.status === "published").length;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Engagement", "Social Studio"]}>
      <PageHeader
        kicker="Cross-channel scheduler"
        title="Social post studio"
        description="Compose once. Schedule across Facebook, Instagram, LinkedIn and X. AI can draft a caption + hashtags from a one-line topic."
        actions={
          <Link href="/social/calendar" className="btn">
            <Icon name="cal" size={12} />
            Calendar view
          </Link>
        }
      />

      <div className="grid-3" style={{ gap: 12, marginBottom: 18 }}>
        <Kpi l="Scheduled" v={String(scheduled)} d="Queued to publish" />
        <Kpi l="Published · all time" v={String(published)} d="Across all channels" />
        <Kpi
          l="Draft"
          v={String(Math.max(0, posts.length - scheduled - published))}
          d="Not yet sent"
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 14,
        }}
      >
        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Create a post</h3>
            <div className="ds-card__sub">
              AI can draft caption + hashtags from a one-line topic
            </div>
          </div>
          <div className="ds-card__body">
            <CreatePostForm establishments={establishments} />
          </div>
        </div>

        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Recent posts</h3>
            <span className="mono dim" style={{ fontSize: 10.5 }}>
              LAST {posts.length}
            </span>
          </div>
          {posts.length === 0 ? (
            <div className="ds-card__body dim" style={{ textAlign: "center", padding: 32 }}>
              <Icon name="share" size={28} style={{ color: "var(--pri)" }} />
              <p style={{ marginTop: 10, fontSize: 13 }}>
                No posts yet. Compose your first on the left.
              </p>
            </div>
          ) : (
            <div style={{ padding: 4 }}>
              {posts.map((p, i) => (
                <div
                  key={p.id}
                  className="row"
                  style={{
                    padding: 12,
                    borderTop: i ? "1px solid var(--line)" : "none",
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: "var(--pri-50)",
                      color: "var(--pri)",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={PLATFORM_ICON[p.platforms?.[0] ?? ""] ?? "share"} size={13} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.caption
                        ? p.caption.slice(0, 80) + (p.caption.length > 80 ? "…" : "")
                        : "(no caption)"}
                    </div>
                    <div className="dim mono" style={{ fontSize: 10.5 }}>
                      {(p.platforms ?? []).join(" · ")} · {relativeTime(p.createdAt)}
                    </div>
                  </div>
                  <span className={`chip ${STATUS_TONE[p.status] ?? "chip--out"}`}>{p.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShellServer>
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

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

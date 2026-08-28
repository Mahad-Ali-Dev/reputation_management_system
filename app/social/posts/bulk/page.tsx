import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { BulkScheduleForm } from "./bulk-form";
import "../social-compose.css";

/**
 * Bulk schedule (Module 10) — rebuilt to the delivered design kit (.sk-page /
 * .sk-bulk-*). A focused operational workspace: a hero (eyebrow + title + the
 * kit calendar illustration) over a single scheduler card. The form itself is
 * the `<BulkScheduleForm>` client island (caption parsing, platform select,
 * schedule window, queue submit).
 */

export const dynamic = "force-dynamic";

export default async function BulkSocialPostsPage() {
  const { orgId } = await getOrgContext();

  const establishments = await withTenant(orgId, async (tx) =>
    tx.establishment.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  );

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Inbox & Social", "Social Studio", "Bulk schedule"]}>
      <div className="sk-page">
        {/* hero */}
        <div className="sk-bulk-hero">
          <div style={{ minWidth: 0 }}>
            <div className="ph__kicker">Social studio</div>
            <h1 className="ph__title">Bulk schedule</h1>
            <p className="ph__sub">
              Compose once, preview per platform, and schedule across Facebook, Instagram, LinkedIn
              and X with AI captions and creatives.
            </p>
          </div>
          <div className="sk-bulk-hero__art" aria-hidden>
            {/* biome-ignore lint/performance/noImgElement: static illustration-kit asset */}
            <img src="/assets/repulabs/post-creator/bulk-hero.svg" alt="" />
          </div>
        </div>

        {/* scheduler card */}
        <div className="sk-card">
          <div className="sk-card__body">
            <BulkScheduleForm establishments={establishments} />
          </div>
        </div>
      </div>
    </AppShellServer>
  );
}

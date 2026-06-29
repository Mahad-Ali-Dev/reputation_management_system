import { Icon } from "@/components/shell/icon";
import {
  type LibraryAsset,
  deleteLibraryAsset,
  listLibraryAssets,
  listLibraryFolders,
} from "@/lib/social/library";
import Link from "next/link";
import { LibraryUploader } from "./library-uploader";

/**
 * `<LibraryTab>` (Module 10) — Content Library management panel (server), rebuilt
 * to the delivered design kit (.sk-lib-*).
 *
 * Header with "Add new" + "Upload media" actions, a filter-chip row bound to the
 * org's real folders (`?folder=`), a 6-up asset grid of `ContentLibraryAsset`
 * thumbnails (file-type badge, video play overlay + duration, more menu, title +
 * folder + date), delete (admin-gated by the action) and "Use in post" (links to
 * Create with the asset's URL preselected). Empty state = the kit dashed
 * drop-zone. All reads fail soft (pre-migration → empty), so the tab never 500s.
 */

export async function LibraryTab({
  orgId,
  folder,
  forceEmpty,
}: {
  orgId: string;
  folder?: string | null;
  forceEmpty?: boolean;
}) {
  const [assetsRaw, foldersRaw] = await Promise.all([
    listLibraryAssets(orgId, { folder: folder ?? undefined, take: 120 }),
    listLibraryFolders(orgId),
  ]);
  const assets = forceEmpty ? [] : assetsRaw;
  const folders = forceEmpty ? [] : foldersRaw;

  const isEmpty = assets.length === 0 && !folder;

  return (
    <div className="sk-card">
      <div className="sk-card__head">
        <div>
          <h3 className="sk-card__title">Content library</h3>
          <div className="sk-card__sub">
            Organize and reuse your best content. Save time and maintain consistency.
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link href="/social/posts?tab=create" className="sk-btn-out" style={{ height: 38 }}>
            <Icon name="plus" size={13} />
            Add new
          </Link>
          <LibraryUploader folder={folder} />
        </div>
      </div>

      {/* filter chips (real folders) + folder/sort */}
      {folders.length > 0 && (
        <div className="sk-lib-chips">
          <div className="sk-chips">
            <FolderChip label="All" href="/social/posts?tab=library" active={!folder} />
            {folders.map((f) => (
              <FolderChip
                key={f}
                label={f}
                href={`/social/posts?tab=library&folder=${encodeURIComponent(f)}`}
                active={folder === f}
              />
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="sk-chip" style={{ cursor: "default" }}>
              <Icon name="grid" size={13} />
              {folder ?? "All folders"}
            </span>
            <span className="sk-chip" style={{ cursor: "default" }}>
              <Icon name="filter" size={13} />
              Newest first
            </span>
          </div>
        </div>
      )}

      <div className="sk-card__body">
        {assets.length === 0 ? (
          isEmpty ? (
            <LibraryUploader variant="dropzone" folder={folder} />
          ) : (
            <div className="sk-empty-center" style={{ padding: "32px 28px" }}>
              <div className="sk-empty-center__art" style={{ maxWidth: 220 }}>
                {/* biome-ignore lint/performance/noImgElement: static illustration-kit asset */}
                <img src="/assets/repulabs/post-creator/lib-library.svg" alt="" />
              </div>
              <p className="sk-empty-center__body" style={{ marginTop: 12 }}>
                No media in “{folder}” yet.
              </p>
            </div>
          )
        ) : (
          <>
            <div className="sk-lib-grid">
              {assets.map((a) => (
                <AssetCard key={a.id} asset={a} />
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: 22 }}>
              <Link
                href="/social/posts?tab=library"
                className="row"
                style={{
                  display: "inline-flex",
                  gap: 6,
                  color: "var(--sk-pri)",
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                View all content
                <Icon name="arrowR" size={13} />
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AssetCard({ asset }: { asset: LibraryAsset }) {
  const ext = fileExt(asset.url, asset.kind);
  return (
    <div className="sk-asset">
      <div className="sk-asset__thumb">
        {/* biome-ignore lint/performance/noImgElement: library thumbnail (blob asset) */}
        <img
          src={asset.url}
          alt={asset.caption ?? ""}
          style={asset.kind === "video" ? { opacity: 0.7 } : undefined}
        />
        {asset.kind === "video" && (
          <span className="sk-asset__play" aria-hidden>
            <span>
              <Icon name="play" size={18} />
            </span>
          </span>
        )}
        <span className="sk-asset__badge">{ext}</span>
        {asset.source === "ai_creative" && (
          <span
            className="sk-asset__dur"
            style={{ left: "auto", right: 8, background: "var(--sk-pri)" }}
          >
            <Icon name="sparkle" size={10} style={{ marginRight: 3 }} /> AI
          </span>
        )}
        <button type="button" className="sk-asset__more" aria-label="Asset actions">
          <Icon name="sliders" size={14} />
        </button>
      </div>
      <div className="sk-asset__meta">
        <div className="sk-asset__title">{asset.caption || asset.folder || "Untitled asset"}</div>
        <div className="sk-asset__info">
          {asset.folder ? `${asset.folder} · ` : ""}
          {fmtDate(asset.createdAt)}
        </div>
        <div className="sk-asset__actions">
          <Link
            href={`/social/posts?tab=create&media=${encodeURIComponent(asset.url)}`}
            className="sk-btn-out"
            style={{ flex: 1, justifyContent: "center", height: 32, fontSize: 12 }}
          >
            <Icon name="plus" size={12} />
            Use in post
          </Link>
          <form action={deleteLibraryAsset}>
            <input type="hidden" name="id" value={asset.id} />
            <button
              type="submit"
              className="sk-btn-out"
              style={{ height: 32, padding: "0 10px", borderColor: "#f3c0c8", color: "#c0344a" }}
              aria-label="Delete asset"
              title="Delete (admin)"
            >
              <Icon name="trash" size={12} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function FolderChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link href={href} className={`sk-chip${active ? " is-active" : ""}`}>
      {label}
    </Link>
  );
}

function fileExt(url: string, kind: string): string {
  const m = url.split("?")[0]?.match(/\.([a-z0-9]{2,4})$/i);
  if (m?.[1]) return m[1].toUpperCase();
  return kind === "video" ? "MP4" : "IMG";
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

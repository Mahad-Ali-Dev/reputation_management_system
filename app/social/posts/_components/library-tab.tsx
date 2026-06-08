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
 * `<LibraryTab>` (Module 10) — Content Library management panel (server).
 *
 * Grid of `ContentLibraryAsset` thumbnails (folder filter via `?folder=`, size,
 * date), an upload control (the `<LibraryUploader>` island), delete (admin-gated
 * by the action), and "Use in post" (links to Create with the asset's URL
 * preselected). Empty state when there's nothing yet. All reads fail soft
 * (pre-migration → empty), so the tab never 500s before the founder migrates.
 */

export async function LibraryTab({
  orgId,
  folder,
}: {
  orgId: string;
  folder?: string | null;
}) {
  const [assets, folders] = await Promise.all([
    listLibraryAssets(orgId, { folder: folder ?? undefined, take: 120 }),
    listLibraryFolders(orgId),
  ]);

  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <div>
          <h3 className="ds-card__title">Content library</h3>
          <div className="ds-card__sub">Reusable images & video for your posts.</div>
        </div>
        <LibraryUploader folder={folder} />
      </div>

      {/* folder filter */}
      {folders.length > 0 && (
        <div
          className="row"
          style={{ gap: 6, flexWrap: "wrap", padding: "10px 16px", borderBottom: "1px solid var(--line)" }}
        >
          <FolderLink label="All" href="/social/posts?tab=library" active={!folder} />
          {folders.map((f) => (
            <FolderLink
              key={f}
              label={f}
              href={`/social/posts?tab=library&folder=${encodeURIComponent(f)}`}
              active={folder === f}
            />
          ))}
        </div>
      )}

      <div className="ds-card__body">
        {assets.length === 0 ? (
          <div style={{ padding: 36, textAlign: "center", color: "var(--rl-muted)" }}>
            <Icon name="image" size={28} style={{ color: "var(--pri)" }} />
            <p style={{ marginTop: 10, fontSize: 13 }}>
              {folder ? `No media in “${folder}” yet.` : "Your library is empty."}
            </p>
            <p style={{ fontSize: 11.5, marginTop: 4 }}>
              Upload images or video to reuse them across posts — or generate AI creatives from the composer.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: 12,
            }}
          >
            {assets.map((a) => (
              <AssetCard key={a.id} asset={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssetCard({ asset }: { asset: LibraryAsset }) {
  return (
    <div className="ds-card" style={{ padding: 0, overflow: "hidden", borderRadius: 12 }}>
      <div style={{ position: "relative", aspectRatio: "1 / 1", background: "var(--surface-3)" }}>
        {asset.kind === "video" ? (
          <div style={{ position: "absolute", inset: 0, background: "#0b1220" }}>
            {/* biome-ignore lint/performance/noImgElement: library thumbnail (blob asset) */}
            <img
              src={asset.url}
              alt={asset.caption ?? ""}
              style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.65 }}
            />
            <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
              <Icon name="play" size={20} style={{ color: "#fff" }} />
            </span>
          </div>
        ) : (
          // biome-ignore lint/performance/noImgElement: library thumbnail (blob asset)
          <img
            src={asset.url}
            alt={asset.caption ?? ""}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
        {asset.source === "ai_creative" && (
          <span
            className="chip chip--pri"
            style={{ position: "absolute", left: 6, top: 6, fontSize: 9, height: 18, padding: "0 6px" }}
          >
            <Icon name="sparkle" size={9} /> AI
          </span>
        )}
      </div>
      <div style={{ padding: "8px 10px" }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 6 }}>
          <span className="dim mono" style={{ fontSize: 9.5 }}>
            {fmtSize(asset.sizeBytes)} · {fmtDate(asset.createdAt)}
          </span>
        </div>
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <Link
            href={`/social/posts?tab=create&media=${encodeURIComponent(asset.url)}`}
            className="btn btn--xs"
            style={{ flex: 1, justifyContent: "center" }}
          >
            <Icon name="plus" size={11} />
            Use in post
          </Link>
          <form action={deleteLibraryAsset}>
            <input type="hidden" name="id" value={asset.id} />
            <button type="submit" className="btn btn--xs btn--danger" aria-label="Delete asset" title="Delete (admin)">
              <Icon name="trash" size={11} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function FolderLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`chip ${active ? "chip--pri" : "chip--out"}`}
      style={{ textDecoration: "none" }}
    >
      {label}
    </Link>
  );
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

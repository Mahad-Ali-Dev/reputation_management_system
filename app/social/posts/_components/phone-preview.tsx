"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import type { CSSProperties, JSX } from "react";

/**
 * `<PhonePreview>` (Module 10) — per-platform, phone-frame live preview.
 *
 * Pure presentation: given the current `caption`, `hashtags`, ordered `media`,
 * and the org's display identity, it renders the post the way the selected
 * platform would (platform header chrome, caption truncation, hashtag styling,
 * X's 280-char hard cap, Instagram's media-first layout).
 *
 * No data fetching, no state — the composer owns state and feeds props, and a
 * platform `<select>` (also in the composer) drives `platform`. This keeps the
 * marquee "instant live preview that switches platform" behaviour entirely in
 * the client island without shipping the whole page.
 */

export type PreviewPlatform = "facebook" | "instagram" | "twitter" | "linkedin";

export type PreviewMedia = { url: string; kind: "image" | "video" };

const PLATFORM_META: Record<
  PreviewPlatform,
  { label: string; icon: IconName; color: string; handle: string }
> = {
  facebook: { label: "Facebook", icon: "fb", color: "#1877F2", handle: "Page · Just now" },
  instagram: { label: "Instagram", icon: "insta", color: "#E1306C", handle: "Just now" },
  twitter: { label: "X", icon: "twitter", color: "#0F1419", handle: "· now" },
  linkedin: { label: "LinkedIn", icon: "linkedin", color: "#0A66C2", handle: "Company · Now" },
};

/** X enforces a hard 280-char limit including the hashtags. */
function composeBody(
  platform: PreviewPlatform,
  caption: string,
  hashtags: string[],
): { text: string; truncated: boolean } {
  const tags = hashtags.length ? `\n\n${hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}` : "";
  const full = `${caption}${tags}`.trim();
  if (platform === "twitter" && full.length > 280) {
    return { text: `${full.slice(0, 277)}…`, truncated: true };
  }
  // Facebook collapses long posts behind "See more" around ~280 chars.
  if (platform === "facebook" && full.length > 360) {
    return { text: `${full.slice(0, 360)}… `, truncated: true };
  }
  return { text: full, truncated: false };
}

function MediaBlock({
  media,
  rounded,
  aspect,
}: {
  media: PreviewMedia[];
  rounded: number;
  aspect: string;
}): JSX.Element | null {
  if (media.length === 0) return null;
  const first = media[0];
  if (!first) return null;
  const extra = media.length - 1;
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: aspect,
        borderRadius: rounded,
        overflow: "hidden",
        background: "var(--surface-3)",
      }}
    >
      {first.kind === "video" ? (
        // Posters render as a dark tile with a play glyph (no autoplay in preview).
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "#0b1220",
          }}
        >
          {/* biome-ignore lint/performance/noImgElement: preview thumbnail of a user/blob asset, not a static asset */}
          <img
            src={first.url}
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.7 }}
          />
          <span
            style={{
              position: "relative",
              width: 44,
              height: 44,
              borderRadius: 999,
              background: "rgba(255,255,255,0.92)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Icon name="play" size={18} style={{ color: "#0b1220" }} />
          </span>
        </div>
      ) : (
        // biome-ignore lint/performance/noImgElement: preview thumbnail of a user/blob asset, not a static asset
        <img
          src={first.url}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      {extra > 0 && (
        <span
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            background: "rgba(0,0,0,0.62)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 999,
          }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

function Avatar({ logoUrl, color, name }: { logoUrl?: string | null; color: string; name: string }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return logoUrl ? (
    // biome-ignore lint/performance/noImgElement: org logo (user/blob asset)
    <img
      src={logoUrl}
      alt=""
      style={{ width: 34, height: 34, borderRadius: 999, objectFit: "cover", flexShrink: 0 }}
    />
  ) : (
    <span
      aria-hidden
      style={{
        width: 34,
        height: 34,
        borderRadius: 999,
        background: color,
        color: "#fff",
        display: "grid",
        placeItems: "center",
        fontSize: 14,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initial}
    </span>
  );
}

export function PhonePreview({
  platform,
  caption,
  hashtags,
  media,
  orgName,
  orgLogoUrl,
}: {
  platform: PreviewPlatform;
  caption: string;
  hashtags: string[];
  media: PreviewMedia[];
  orgName: string;
  orgLogoUrl?: string | null;
}): JSX.Element {
  const meta = PLATFORM_META[platform];
  const body = composeBody(platform, caption, hashtags);
  const hasContent = body.text.length > 0 || media.length > 0;

  const captionTextStyle: CSSProperties = {
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--ink)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    margin: 0,
  };

  return (
    <div
      aria-label={`${meta.label} preview`}
      style={{
        // Phone chrome
        width: "100%",
        maxWidth: 340,
        margin: "0 auto",
        borderRadius: 28,
        border: "1px solid var(--line)",
        background: "var(--surface)",
        boxShadow: "0 10px 30px -12px rgba(15,23,42,0.18)",
        overflow: "hidden",
      }}
    >
      {/* Notch / status bar */}
      <div
        style={{
          height: 30,
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <span
          aria-hidden
          style={{ width: 56, height: 5, borderRadius: 999, background: "var(--rl-muted-3)" }}
        />
        <span
          style={{
            position: "absolute",
            left: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 10.5,
            fontWeight: 600,
            color: meta.color,
          }}
        >
          <Icon name={meta.icon} size={12} style={{ color: meta.color }} />
          {meta.label}
        </span>
      </div>

      {/* Post header */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 12px 8px" }}>
        <Avatar logoUrl={orgLogoUrl} color={meta.color} name={orgName} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {orgName || "Your business"}
          </div>
          <div style={{ fontSize: 11, color: "var(--rl-muted)" }}>{meta.handle}</div>
        </div>
        <Icon name="grip" size={15} style={{ color: "var(--rl-muted-2)" }} />
      </div>

      {/* Body — Instagram is media-first; the others lead with text. */}
      {platform === "instagram" ? (
        <>
          {media.length > 0 ? (
            <MediaBlock media={media} rounded={0} aspect="1 / 1" />
          ) : (
            <div
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                background: "var(--surface-3)",
                display: "grid",
                placeItems: "center",
                color: "var(--rl-muted-2)",
                fontSize: 12,
                gap: 6,
                flexDirection: "column",
              }}
            >
              <Icon name="image" size={26} style={{ color: "var(--rl-muted-2)" }} />
              Instagram needs a photo or video
            </div>
          )}
          <div style={{ display: "flex", gap: 14, padding: "9px 12px 4px", color: "var(--ink)" }}>
            <Icon name="star" size={18} />
            <Icon name="chat" size={18} />
            <Icon name="send" size={18} />
          </div>
          <div style={{ padding: "2px 12px 14px" }}>
            <p style={captionTextStyle}>
              <span style={{ fontWeight: 600 }}>{(orgName || "you").toLowerCase().replace(/\s+/g, "")}</span>{" "}
              {body.text || <span style={{ color: "var(--rl-muted-2)" }}>Your caption preview…</span>}
            </p>
          </div>
        </>
      ) : (
        <>
          <div style={{ padding: "0 12px 10px" }}>
            {body.text ? (
              <p style={captionTextStyle}>
                {body.text}
                {body.truncated && platform === "facebook" && (
                  <span style={{ color: "var(--rl-muted)" }}>See more</span>
                )}
              </p>
            ) : (
              <p style={{ ...captionTextStyle, color: "var(--rl-muted-2)" }}>
                Your caption preview will appear here as you type…
              </p>
            )}
          </div>
          {media.length > 0 && (
            <div style={{ padding: platform === "linkedin" ? 0 : "0 12px 0" }}>
              <MediaBlock
                media={media}
                rounded={platform === "linkedin" ? 0 : 10}
                aspect={platform === "linkedin" ? "1.91 / 1" : "1.6 / 1"}
              />
            </div>
          )}
          {/* Engagement bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-around",
              padding: "10px 12px 12px",
              marginTop: media.length ? 8 : 0,
              borderTop: "1px solid var(--line)",
              color: "var(--rl-muted)",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5 }}>
              <Icon name="star" size={15} /> Like
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5 }}>
              <Icon name="chat" size={15} /> Comment
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5 }}>
              <Icon name="share" size={15} /> Share
            </span>
          </div>
        </>
      )}

      {!hasContent && platform !== "instagram" && (
        <div
          style={{
            padding: "0 12px 14px",
            fontSize: 11,
            color: "var(--rl-muted-2)",
            textAlign: "center",
          }}
        >
          Compose on the left to preview your post.
        </div>
      )}
    </div>
  );
}

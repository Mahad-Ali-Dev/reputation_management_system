"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import { createSocialPost, publishSocialPostNow } from "@/lib/social/post-actions";
import Link from "next/link";
import { type JSX, useMemo, useRef, useState, useTransition } from "react";
import { CaptionModal, type CaptionOption, type GenerateCaptionsFn } from "./caption-modal";
import { CreativesModal, type GenerateCreativesFn } from "./creatives-modal";
import { LibraryModal, type LibraryAsset } from "./library-modal";
import { PhonePreview, type PreviewPlatform } from "./phone-preview";
import "../social-compose.css";

/**
 * `<Composer>` (Module 10) — the 3-column post creator island.
 *
 *   LEFT   channel picker (connection-gated checkboxes) + scheduler
 *          (Now / Schedule / Best times).
 *   CENTER caption editor (+ AI caption modal), media drag-drop zone, the
 *          Content-Library picker, and the AI Image Creatives card (Pro/env
 *          gated by `imageGen` prop).
 *   RIGHT  the live `<PhonePreview>` with a platform dropdown.
 *
 * The whole tab's state lives here. Connection state + entitlement are computed
 * server-side and handed in as props (the client never queries them). When the
 * org has NO connected platform, the empty "Connect a channel" state renders
 * instead of the composer (AC).
 *
 * Submits to `createSocialPost` (Schedule / Save draft) or `publishSocialPostNow`
 * (Publish now). `initialPost` hydrates the editor for the calendar's `?post=`
 * deep-link.
 */

type PlatformDef = { id: PreviewPlatform; label: string; icon: IconName };

const PLATFORMS: PlatformDef[] = [
  { id: "facebook", label: "Facebook", icon: "fb" },
  { id: "instagram", label: "Instagram", icon: "insta" },
  { id: "twitter", label: "X", icon: "twitter" },
  { id: "linkedin", label: "LinkedIn", icon: "linkedin" },
];

// Mirrors lib/social/connections.ts PLATFORM_LIMITS.maxChars (kept tiny + local
// so the client island doesn't import the server-only connections module).
const MAX_CHARS: Record<PreviewPlatform, number> = {
  facebook: 63206,
  instagram: 2200,
  twitter: 280,
  linkedin: 3000,
};

export type ComposerMedia = { url: string; kind: "image" | "video" };

export type InitialPost = {
  id: string;
  caption: string | null;
  hashtags: string[];
  platforms: string[];
  mediaUrl: string | null;
  approvedCreativeUrls: string[];
  scheduledFor: string | null; // ISO
  establishmentId: string | null;
  status: string;
};

type Establishment = { id: string; name: string };

/** Server-computed snapshot of the current month for the schedule mini-calendar. */
export type MiniCalMonth = {
  /** "YYYY-MM" — the /social/calendar deep-link param. */
  ym: string;
  /** e.g. "June 2026" */
  label: string;
  daysInMonth: number;
  /** Monday-first offset of day 1 (0 = Monday … 6 = Sunday). */
  firstDow: number;
  /** Today's day-of-month. */
  today: number;
  /** Day numbers with ≥1 scheduled post. */
  scheduledDays: number[];
  /** Day numbers with ≥1 published post. */
  publishedDays: number[];
};

/** Starter angles for the "Creative ideas" tile row — prefill, never auto-send. */
type CreativeIdea = {
  id: string;
  name: string;
  sub: string;
  art: string;
  caption: string;
  hashtags: string[];
};

const CREATIVE_IDEAS: CreativeIdea[] = [
  {
    id: "review",
    name: "Share a five-star review",
    sub: "Turn your latest praise into proof.",
    art: "/assets/repulabs/illustrations/feat-reviews.png",
    caption:
      "⭐⭐⭐⭐⭐ Review of the week!\n\n“[paste your favorite recent review here]”\n\nThank you, [customer name] — feedback like this is why we do what we do.",
    hashtags: ["fivestars", "customerlove"],
  },
  {
    id: "offer",
    name: "Promote an offer",
    sub: "A limited-time deal with a clear CTA.",
    art: "/assets/repulabs/illustrations/feat-qr-nfc.png",
    caption:
      "🎉 This week only: [your offer].\n\nMention this post in store or book online to claim it — ends [date].",
    hashtags: ["offer", "local"],
  },
  {
    id: "milestone",
    name: "Celebrate a milestone",
    sub: "Reviews, years, customers — mark the moment.",
    art: "/assets/repulabs/illustrations/feat-analytics.png",
    caption:
      "Milestone unlocked 🚀 We just hit [X reviews / X years / X customers].\n\nA huge thank-you to every one of you who got us here.",
    hashtags: ["milestone", "thankyou"],
  },
  {
    id: "thanks",
    name: "Thank your customers",
    sub: "A simple gratitude post that invites replies.",
    art: "/assets/repulabs/illustrations/voice-review.png",
    caption:
      "To everyone who shared feedback with us this month — thank you. We read every single review, and it shapes what we do next.\n\nHad a great experience? We'd love to hear about it too.",
    hashtags: ["thankyou", "community"],
  },
];

export function Composer({
  connectedPlatforms,
  establishments,
  orgName,
  orgLogoUrl,
  brandColors,
  libraryAssets,
  imageGen,
  generateCaptions,
  generateCreatives,
  recommendTimes,
  initialPost,
  miniCal,
}: {
  /** Platforms the org can publish to (server-computed from active Connections). */
  connectedPlatforms: PreviewPlatform[];
  establishments: Establishment[];
  orgName: string;
  orgLogoUrl: string | null;
  /** Editable brand colors prefilled from establishment.brandVoice.colors. */
  brandColors: string[];
  /** Library assets for the picker (server-fetched). */
  libraryAssets: LibraryAsset[];
  /** AI-image availability gate (server-computed). */
  imageGen: { available: boolean; reason: "ok" | "not_pro" | "not_configured" };
  generateCaptions: GenerateCaptionsFn;
  generateCreatives: GenerateCreativesFn;
  /** Best-time recommender (bound by the page; optional until backend lands). */
  recommendTimes?: (platforms: string[]) => Promise<string[]>;
  initialPost?: InitialPost | null;
  /** Current-month post days for the schedule mini-calendar (server-computed, fail-soft). */
  miniCal?: MiniCalMonth | null;
}): JSX.Element {
  const connectedSet = useMemo(() => new Set(connectedPlatforms), [connectedPlatforms]);
  const anyConnected = connectedPlatforms.length > 0;

  // ---- state -------------------------------------------------------------
  const [caption, setCaption] = useState(initialPost?.caption ?? "");
  const [hashtags, setHashtags] = useState<string[]>(initialPost?.hashtags ?? []);
  const [platforms, setPlatforms] = useState<PreviewPlatform[]>(() => {
    const fromInit = (initialPost?.platforms ?? []).filter((p): p is PreviewPlatform =>
      PLATFORMS.some((x) => x.id === p),
    );
    if (fromInit.length) return fromInit;
    // Default to the first connected platform.
    return connectedPlatforms.length ? [connectedPlatforms[0]!] : [];
  });
  const [media, setMedia] = useState<ComposerMedia[]>(() => {
    const urls = initialPost?.approvedCreativeUrls?.length
      ? initialPost.approvedCreativeUrls
      : initialPost?.mediaUrl
        ? [initialPost.mediaUrl]
        : [];
    return urls.map((url) => ({ url, kind: "image" as const }));
  });
  const [establishmentId, setEstablishmentId] = useState(
    initialPost?.establishmentId ?? establishments[0]?.id ?? "",
  );
  const [scheduleMode, setScheduleMode] = useState<"now" | "schedule">(
    initialPost?.scheduledFor ? "schedule" : "now",
  );
  const [scheduledFor, setScheduledFor] = useState(
    initialPost?.scheduledFor ? toLocalInput(initialPost.scheduledFor) : "",
  );
  const [previewPlatform, setPreviewPlatform] = useState<PreviewPlatform>(
    platforms[0] ?? connectedPlatforms[0] ?? "facebook",
  );
  const [isAiCaption, setIsAiCaption] = useState(false);

  // modals
  const [captionOpen, setCaptionOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [creativesOpen, setCreativesOpen] = useState(false);

  // best-times
  const [bestTimes, setBestTimes] = useState<string[] | null>(null);
  const [btPending, startBt] = useTransition();

  // submit
  const [pending, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const captionRef = useRef<HTMLTextAreaElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // ---- derived -----------------------------------------------------------
  const tightestLimit = platforms.length
    ? Math.min(...platforms.map((p) => MAX_CHARS[p]))
    : MAX_CHARS[previewPlatform];
  const overLimit = caption.length > tightestLimit;

  function togglePlatform(id: PreviewPlatform) {
    if (!connectedSet.has(id)) return; // gated — can't select unconnected
    const next = platforms.includes(id) ? platforms.filter((p) => p !== id) : [...platforms, id];
    setPlatforms(next);
    // Keep the preview on a selected platform (pure event-handler updates).
    if (next.length && !next.includes(previewPlatform)) setPreviewPlatform(next[0]!);
  }

  function applyCaption(opt: CaptionOption) {
    setCaption(opt.caption);
    if (opt.hashtags.length) setHashtags(opt.hashtags);
    setIsAiCaption(true);
  }

  /** Creative-idea tile → prefill the editor with a starter angle (user edits it). */
  function applyIdea(idea: CreativeIdea) {
    setCaption(idea.caption);
    setHashtags(idea.hashtags);
    setIsAiCaption(false);
    setError(null);
    setSuccess(null);
    captionRef.current?.focus();
    captionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function addMedia(items: ComposerMedia[]) {
    setMedia((prev) => {
      const seen = new Set(prev.map((m) => m.url));
      return [...prev, ...items.filter((m) => !seen.has(m.url))].slice(0, 10);
    });
  }
  function removeMedia(url: string) {
    setMedia((prev) => prev.filter((m) => m.url !== url));
  }

  async function uploadFiles(files: FileList | File[]) {
    setError(null);
    setUploading(true);
    try {
      const arr = Array.from(files);
      for (const file of arr) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("context", "social_post_media");
        const res = await fetch("/api/uploads/social", { method: "POST", body: fd });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(uploadErrorCopy(body.error));
        }
        const data = (await res.json()) as { url: string; kind: "image" | "video" };
        addMedia([{ url: data.url, kind: data.kind }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function fetchBestTimes() {
    if (!recommendTimes) return;
    setError(null);
    startBt(async () => {
      try {
        const times = await recommendTimes(platforms.length ? platforms : ["facebook"]);
        setBestTimes(times.slice(0, 3));
      } catch {
        setError("Couldn’t fetch recommended times.");
      }
    });
  }

  function buildFormData(): FormData | null {
    if (platforms.length === 0) {
      setError("Pick at least one platform.");
      return null;
    }
    if (!caption.trim() && media.length === 0) {
      setError("Add a caption or at least one image/video.");
      return null;
    }
    if (overLimit) {
      setError(`Caption is too long for ${previewPlatform} (max ${tightestLimit}).`);
      return null;
    }
    // Instagram requires media.
    if (platforms.includes("instagram") && media.length === 0) {
      setError("Instagram requires at least one image or video.");
      return null;
    }
    const fd = new FormData();
    fd.set("caption", caption);
    fd.set("hashtags", hashtags.join(" "));
    fd.set("platforms", platforms.join(","));
    if (media[0]) {
      fd.set("mediaUrl", media[0].url);
      fd.set("mediaType", media[0].kind);
    }
    if (media.length) fd.set("mediaUrls", JSON.stringify(media.map((m) => m.url)));
    if (isAiCaption) fd.set("isAiCaption", "true");
    if (establishmentId) fd.set("establishmentId", establishmentId);
    if (initialPost?.id) fd.set("id", initialPost.id);
    return fd;
  }

  function submit(action: "save" | "publish") {
    setError(null);
    setSuccess(null);
    const fd = buildFormData();
    if (!fd) return;

    if (action === "save" && scheduleMode === "schedule") {
      if (!scheduledFor) {
        setError("Pick a date & time to schedule.");
        return;
      }
      fd.set("scheduledFor", new Date(scheduledFor).toISOString());
    }

    startSubmit(async () => {
      try {
        if (action === "publish") {
          await publishSocialPostNow(fd);
          setSuccess("Publishing now…");
        } else {
          await createSocialPost(fd);
          setSuccess(
            scheduleMode === "schedule"
              ? "Scheduled. It’ll publish automatically."
              : "Saved as a draft.",
          );
        }
        if (!initialPost) resetAfterSave();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  function resetAfterSave() {
    setCaption("");
    setHashtags([]);
    setMedia([]);
    setScheduledFor("");
    setScheduleMode("now");
    setIsAiCaption(false);
    setBestTimes(null);
  }

  // ---- empty state (nothing connected) -----------------------------------
  if (!anyConnected) {
    return <NothingConnected />;
  }

  // ---- composer ----------------------------------------------------------
  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 0.95fr) minmax(0, 1.25fr) minmax(0, 0.85fr)",
          gap: 14,
          alignItems: "start",
        }}
        className="composer-grid"
      >
        {/* ===================== LEFT: channels + schedule ===================== */}
        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Channels</h3>
          </div>
          <div className="ds-card__body" style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gap: 8 }}>
              {PLATFORMS.map((p) => {
                const connected = connectedSet.has(p.id);
                const on = platforms.includes(p.id);
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    disabled={!connected}
                    aria-pressed={on}
                    title={connected ? p.label : `Connect ${p.label} on Connections →`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: on ? "1.5px solid var(--pri)" : "1px solid var(--line)",
                      background: on ? "var(--pri-50)" : "var(--surface)",
                      cursor: connected ? "pointer" : "not-allowed",
                      opacity: connected ? 1 : 0.55,
                      textAlign: "left",
                      width: "100%",
                    }}
                  >
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: on ? "var(--pri)" : "var(--surface-3)",
                        color: on ? "#fff" : "var(--ink-2)",
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon name={p.icon} size={15} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, display: "block" }}>{p.label}</span>
                      {!connected && (
                        <span style={{ fontSize: 10.5, color: "var(--rl-muted)" }}>Not connected</span>
                      )}
                    </span>
                    {connected ? (
                      <Icon
                        name={on ? "checkCircle" : "round"}
                        size={16}
                        style={{ color: on ? "var(--pri)" : "var(--rl-muted-3)" }}
                      />
                    ) : (
                      <Icon name="lock" size={13} style={{ color: "var(--rl-muted-2)" }} />
                    )}
                  </button>
                );
              })}
            </div>

            {connectedPlatforms.length < PLATFORMS.length && (
              <Link
                href="/connections"
                className="row"
                style={{ gap: 6, fontSize: 11.5, color: "var(--pri)", textDecoration: "none" }}
              >
                <Icon name="plug" size={12} />
                Connect more channels →
              </Link>
            )}

            {/* establishment */}
            {establishments.length > 0 && (
              <label style={{ display: "block" }}>
                <span className="lbl">Location</span>
                <select
                  className="ds-select"
                  value={establishmentId}
                  onChange={(e) => setEstablishmentId(e.target.value)}
                >
                  <option value="">All locations</option>
                  {establishments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* scheduler */}
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
              <span className="lbl">When to post</span>
              <div className="seg" style={{ width: "100%", marginBottom: 10 }}>
                <SegBtn label="Post now" active={scheduleMode === "now"} onClick={() => setScheduleMode("now")} />
                <SegBtn
                  label="Schedule"
                  active={scheduleMode === "schedule"}
                  onClick={() => setScheduleMode("schedule")}
                />
              </div>
              {scheduleMode === "schedule" && (
                <div style={{ display: "grid", gap: 8 }}>
                  <input
                    type="datetime-local"
                    className="ds-input"
                    aria-label="Schedule date and time"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                  />
                  {recommendTimes && (
                    <div>
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={fetchBestTimes}
                        disabled={btPending}
                      >
                        <Icon name="bolt" size={12} />
                        {btPending ? "Finding…" : "Suggest best times"}
                      </button>
                      {bestTimes && bestTimes.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                          {bestTimes.map((t) => (
                            <button
                              type="button"
                              key={t}
                              className="chip chip--info"
                              style={{ cursor: "pointer" }}
                              onClick={() => setScheduledFor(toLocalInput(t))}
                            >
                              {fmtBestTime(t)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* mini content-calendar — month at a glance, deep-links to /social/calendar */}
              {miniCal && <MiniCalendar data={miniCal} />}
            </div>
          </div>
        </div>

        {/* ===================== CENTER: editor + media + AI ===================== */}
        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Content</h3>
            <button type="button" className="btn btn--xs btn--accent" onClick={() => setCaptionOpen(true)}>
              <Icon name="sparkle" size={12} />
              AI caption
            </button>
          </div>
          <div className="ds-card__body" style={{ display: "grid", gap: 14 }}>
            <div>
              <textarea
                ref={captionRef}
                className="ds-textarea"
                rows={6}
                value={caption}
                onChange={(e) => {
                  setCaption(e.target.value);
                  setIsAiCaption(false);
                }}
                placeholder="Write your post… or let AI draft 3 options."
                maxLength={63206}
              />
              <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
                {isAiCaption ? (
                  <span className="chip chip--info" style={{ fontSize: 10 }}>
                    <Icon name="sparkle" size={10} /> AI-drafted
                  </span>
                ) : (
                  <span />
                )}
                <span
                  className="mono"
                  style={{ fontSize: 10.5, color: overLimit ? "var(--bad)" : "var(--rl-muted)" }}
                >
                  {caption.length}/{tightestLimit}
                </span>
              </div>
            </div>

            {/* hashtags */}
            <div>
              <span className="lbl">Hashtags</span>
              <HashtagEditor value={hashtags} onChange={setHashtags} />
            </div>

            {/* media zone */}
            <div>
              <span className="lbl">Media</span>
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: the zone is a convenience drop target; the explicit Upload + Library buttons below are the keyboard-accessible controls */}
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
                }}
                style={{
                  border: `1.5px dashed ${dragOver ? "var(--pri)" : "var(--line)"}`,
                  borderRadius: 12,
                  background: dragOver ? "var(--pri-50)" : "var(--surface-2)",
                  padding: media.length ? 12 : 22,
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "border-color .15s, background .15s",
                }}
              >
                {media.length === 0 ? (
                  <div style={{ color: "var(--rl-muted)" }}>
                    <Icon name="upload" size={22} style={{ color: "var(--rl-muted-2)" }} />
                    <p style={{ margin: "8px 0 0", fontSize: 12.5 }}>
                      {uploading ? "Uploading…" : "Drag & drop, or click to upload"}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 10.5 }}>PNG, JPG, WebP or MP4 · up to 50MB</p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(74px, 1fr))",
                      gap: 8,
                    }}
                  >
                    {media.map((m, i) => (
                      <div
                        key={m.url}
                        style={{
                          position: "relative",
                          aspectRatio: "1 / 1",
                          borderRadius: 8,
                          overflow: "hidden",
                          border: "1px solid var(--line)",
                          background: "var(--surface-3)",
                        }}
                      >
                        {/* biome-ignore lint/performance/noImgElement: media thumbnail (user/blob asset) */}
                        <img
                          src={m.url}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover", opacity: m.kind === "video" ? 0.7 : 1 }}
                        />
                        {m.kind === "video" && (
                          <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                            <Icon name="play" size={16} style={{ color: "#fff" }} />
                          </span>
                        )}
                        {i === 0 && (
                          <span
                            style={{
                              position: "absolute",
                              left: 3,
                              top: 3,
                              fontSize: 8.5,
                              fontWeight: 700,
                              background: "var(--pri)",
                              color: "#fff",
                              padding: "1px 5px",
                              borderRadius: 4,
                            }}
                          >
                            COVER
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeMedia(m.url);
                          }}
                          aria-label="Remove media"
                          style={{
                            position: "absolute",
                            top: 3,
                            right: 3,
                            width: 18,
                            height: 18,
                            borderRadius: 999,
                            border: "none",
                            background: "rgba(0,0,0,0.6)",
                            color: "#fff",
                            display: "grid",
                            placeItems: "center",
                            cursor: "pointer",
                          }}
                        >
                          <Icon name="x" size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) void uploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn btn--sm" onClick={() => setLibraryOpen(true)}>
                  <Icon name="image" size={12} />
                  Content library
                </button>
                <AiImageButton imageGen={imageGen} onClick={() => setCreativesOpen(true)} />
              </div>
            </div>
          </div>
        </div>

        {/* ===================== RIGHT: live preview ===================== */}
        <div className="ds-card" style={{ position: "sticky", top: 12 }}>
          <div className="ds-card__head">
            <h3 className="ds-card__title">Preview</h3>
            <select
              className="ds-select"
              aria-label="Preview platform"
              value={previewPlatform}
              onChange={(e) => setPreviewPlatform(e.target.value as PreviewPlatform)}
              style={{ width: 130, height: 30, fontSize: 12 }}
            >
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="ds-card__body" style={{ background: "var(--surface-2)" }}>
            <PhonePreview
              platform={previewPlatform}
              caption={caption}
              hashtags={hashtags}
              media={media}
              orgName={orgName}
              orgLogoUrl={orgLogoUrl}
            />
          </div>
        </div>
      </div>

      {/* ===================== action bar ===================== */}
      <div
        className="ds-card"
        style={{
          marginTop: 14,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minHeight: 18 }}>
          {error && (
            <span style={{ fontSize: 12.5, color: "var(--bad)" }} role="alert">
              <Icon name="alert" size={12} /> {error}
            </span>
          )}
          {success && !error && (
            <span style={{ fontSize: 12.5, color: "var(--ok)" }}>
              <Icon name="checkCircle" size={12} /> {success}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => submit("save")}
            disabled={pending || uploading}
          >
            <Icon name={scheduleMode === "schedule" ? "clock" : "edit"} size={12} />
            {scheduleMode === "schedule" ? "Schedule" : "Save draft"}
          </button>
          <button
            type="button"
            className="btn btn--pri btn--sm"
            onClick={() => submit("publish")}
            disabled={pending || uploading}
          >
            <Icon name="send" size={12} />
            {pending ? "Working…" : "Publish now"}
          </button>
        </div>
      </div>

      {/* ===================== creative idea tiles ===================== */}
      <section className="ds-card soc-ideas" aria-label="Creative ideas">
        <div className="ds-card__head">
          <div>
            <h3 className="ds-card__title">Creative ideas</h3>
            <p className="ds-card__sub" style={{ margin: "3px 0 0" }}>
              Starter angles — tap one to prefill the editor, then make it yours.
            </p>
          </div>
        </div>
        <div className="ds-card__body">
          <div className="soc-ideas__grid">
            {CREATIVE_IDEAS.map((idea) => (
              <button key={idea.id} type="button" className="soc-idea" onClick={() => applyIdea(idea)}>
                <span className="soc-idea__art" aria-hidden>
                  {/* biome-ignore lint/performance/noImgElement: static illustration-kit asset */}
                  <img src={idea.art} alt="" loading="lazy" />
                </span>
                <span>
                  <span className="soc-idea__name">{idea.name}</span>
                  <span className="soc-idea__sub">{idea.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== modals ===================== */}
      <CaptionModal
        open={captionOpen}
        onClose={() => setCaptionOpen(false)}
        onUse={applyCaption}
        generate={generateCaptions}
        platforms={platforms}
        defaultPlatform={previewPlatform}
      />
      <LibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        assets={libraryAssets}
        onUse={(chosen) =>
          addMedia(chosen.map((a) => ({ url: a.url, kind: a.kind })))
        }
      />
      <CreativesModal
        open={creativesOpen}
        onClose={() => setCreativesOpen(false)}
        onApprove={(urls) => addMedia(urls.map((url) => ({ url, kind: "image" as const })))}
        generate={generateCreatives}
        initialBrandColors={brandColors}
      />
    </>
  );
}

/* ---------------------------- subcomponents ------------------------------- */

function SegBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="seg__b"
      aria-pressed={active}
      style={{
        flex: 1,
        padding: "7px 10px",
        fontSize: 12.5,
        borderRadius: "calc(var(--r) - 3px)",
        border: "none",
        cursor: "pointer",
        background: active ? "var(--surface)" : "transparent",
        color: active ? "var(--ink)" : "var(--rl-muted)",
        fontWeight: active ? 600 : 450,
        boxShadow: active ? "var(--sh)" : "none",
      }}
    >
      {label}
    </button>
  );
}

const MINICAL_DOW = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * Compact month grid in the schedule column — dots/fills on days that already
 * have scheduled or published posts (server-computed). Every day deep-links to
 * the full /social/calendar; the datetime input above stays the real control.
 */
function MiniCalendar({ data }: { data: MiniCalMonth }) {
  const scheduled = new Set(data.scheduledDays);
  const published = new Set(data.publishedDays);
  const monthName = data.label.split(" ")[0] ?? data.label;
  const href = `/social/calendar?ym=${data.ym}`;
  const cells: (number | null)[] = [
    ...Array.from({ length: data.firstDow }, () => null),
    ...Array.from({ length: data.daysInMonth }, (_, i) => i + 1),
  ];
  return (
    <div className="soc-minical">
      <div className="soc-minical__head">
        <span className="soc-minical__title">{data.label}</span>
        <Link href={href} className="soc-minical__link">
          Open calendar →
        </Link>
      </div>
      <div className="soc-minical__grid">
        {MINICAL_DOW.map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed 7-day header
          <span key={`dow-${i}`} className="soc-minical__dow" aria-hidden>
            {d}
          </span>
        ))}
        {cells.map((day, i) =>
          day === null ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: leading pad cells are positional
            <span key={`pad-${i}`} className="soc-minical__day soc-minical__day--pad" aria-hidden />
          ) : (
            <Link
              key={day}
              href={href}
              className={[
                "soc-minical__day",
                published.has(day)
                  ? "soc-minical__day--published"
                  : scheduled.has(day)
                    ? "soc-minical__day--scheduled"
                    : "",
                day === data.today ? "soc-minical__day--today" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label={`Open the content calendar — ${monthName} ${day}`}
            >
              {day}
            </Link>
          ),
        )}
      </div>
      {(scheduled.size > 0 || published.size > 0) && (
        <div className="soc-minical__legend">
          <span>
            <span className="soc-minical__dot" style={{ background: "var(--pri)" }} />
            Scheduled
          </span>
          <span>
            <span className="soc-minical__dot" style={{ background: "var(--trust)" }} />
            Published
          </span>
        </div>
      )}
    </div>
  );
}

function AiImageButton({
  imageGen,
  onClick,
}: {
  imageGen: { available: boolean; reason: "ok" | "not_pro" | "not_configured" };
  onClick: () => void;
}) {
  // The modal itself shows the gate panel; the button always opens it so the
  // user sees WHY it's unavailable (upsell vs not-enabled) — but a non-Pro state
  // shows the gold padlock to set expectations.
  const locked = imageGen.reason === "not_pro";
  return (
    <button
      type="button"
      className="btn btn--sm"
      onClick={onClick}
      title={
        imageGen.reason === "not_pro"
          ? "AI image creatives are a Pro feature"
          : imageGen.reason === "not_configured"
            ? "AI image generation isn’t enabled for this workspace"
            : "Generate on-brand images with AI"
      }
      style={{ gap: 6 }}
    >
      <Icon name="sparkle" size={12} style={{ color: locked ? "var(--gold)" : "var(--pri)" }} />
      AI image
      {locked && <Icon name="lock" size={11} style={{ color: "var(--gold)" }} />}
    </button>
  );
}

function HashtagEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    const tags = draft
      .split(/[,\s]+/)
      .map((t) => t.trim().replace(/^#/, ""))
      .filter(Boolean);
    if (tags.length) {
      const seen = new Set(value.map((v) => v.toLowerCase()));
      onChange([...value, ...tags.filter((t) => !seen.has(t.toLowerCase()))]);
    }
    setDraft("");
  }
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
        border: "1px solid var(--line)",
        borderRadius: "var(--r)",
        padding: "7px 10px",
        background: "var(--surface)",
        minHeight: 38,
      }}
    >
      {value.map((t) => (
        <span key={t} className="chip chip--info" style={{ gap: 4 }}>
          #{t}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== t))}
            aria-label={`Remove #${t}`}
            style={{ border: "none", background: "none", cursor: "pointer", padding: 0, color: "inherit", display: "grid" }}
          >
            <Icon name="x" size={10} />
          </button>
        </span>
      ))}
      <input
        aria-label="Add hashtag"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder={value.length ? "" : "#localbiz  #springfield"}
        style={{
          flex: 1,
          minWidth: 100,
          border: "none",
          outline: "none",
          background: "none",
          fontSize: 13,
          color: "var(--ink)",
        }}
      />
    </div>
  );
}

function NothingConnected() {
  return (
    <div
      className="ds-card"
      style={{ padding: "40px 24px", textAlign: "center", maxWidth: 560, margin: "0 auto" }}
    >
      <div
        aria-hidden
        style={{
          display: "inline-flex",
          width: 52,
          height: 52,
          borderRadius: 999,
          background: "var(--pri-50)",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        <Icon name="plug" size={24} style={{ color: "var(--pri)" }} />
      </div>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}>
        Connect a channel to start posting
      </h3>
      <p style={{ margin: "8px auto 18px", fontSize: 13, color: "var(--rl-muted)", maxWidth: 420, lineHeight: 1.6 }}>
        Link Facebook, Instagram, X or LinkedIn and you’ll be able to compose, schedule, and publish
        across all of them from here — with AI captions and a live preview.
      </p>
      <Link href="/connections" className="btn btn--pri">
        <Icon name="plug" size={13} />
        Go to Connections
      </Link>
    </div>
  );
}

/* ------------------------------- helpers --------------------------------- */

/** ISO → value for <input type="datetime-local"> in the user's local tz. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtBestTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function uploadErrorCopy(code?: string): string {
  switch (code) {
    case "file_too_large":
      return "That file is too large (max 50MB).";
    case "invalid_context":
    case "not_allowed":
      return "That file type isn’t allowed.";
    case "no_file":
    case "empty_file":
      return "No file received.";
    default:
      return code?.startsWith("mime_type_not_allowed")
        ? "That file type isn’t allowed."
        : "Upload failed.";
  }
}

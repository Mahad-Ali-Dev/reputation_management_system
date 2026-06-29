"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import { createSocialPost, publishSocialPostNow } from "@/lib/social/post-actions";
import Link from "next/link";
import { type JSX, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
/**
 * One scheduled/published post for the mini-calendar. `when` is an ISO string;
 * the CLIENT buckets it into a day so the grid reflects the USER's timezone —
 * server-side day-bucketing put posts on the wrong day for anyone not in the
 * VPS timezone (2026-06-11 review). The server widens its query window by ±36h
 * so boundary posts land in whichever month the browser says they belong to.
 */
export type MiniCalPost = { status: string; when: string };

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
  hasPosts = true,
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
  miniCal?: MiniCalPost[] | null;
  /** Whether the org has ANY post yet — drives the first-run "No posts yet" empty state. */
  hasPosts?: boolean;
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
  // First-run empty state ("No posts yet"): show until the user clicks "Create
  // post" (or when editing an existing post via the calendar deep-link).
  const [revealed, setRevealed] = useState(hasPosts || !!initialPost);

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

  // ---- first-run empty state ("No posts yet") ----------------------------
  if (!revealed) {
    return <NoPostsYet onCreate={() => setRevealed(true)} />;
  }

  // ---- composer ----------------------------------------------------------
  return (
    <>
      <div className="sk-composer">
        {/* ===================== LEFT: create post (editor + schedule + actions) ===================== */}
        <div className="sk-card">
          <div className="sk-card__head">
            <div>
              <h3 className="sk-card__title">Create post</h3>
              <div className="sk-card__sub">Compose your content once and publish everywhere</div>
            </div>
          </div>
          <div className="sk-card__body" style={{ display: "grid", gap: 16 }}>
            {/* caption */}
            <div>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                <span className="sk-lbl" style={{ margin: 0 }}>
                  Your post
                </span>
                <button type="button" className="sk-btn-out" style={{ height: 32 }} onClick={() => setCaptionOpen(true)}>
                  <Icon name="sparkle" size={13} />
                  AI caption
                </button>
              </div>
              <textarea
                ref={captionRef}
                className="sk-textarea"
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
                  <span className="sk-counter" style={{ color: "var(--sk-pri)" }}>
                    <Icon name="sparkle" size={11} /> AI-drafted
                  </span>
                ) : (
                  <span />
                )}
                <span className={`sk-counter${overLimit ? " sk-counter--over" : ""}`}>
                  {caption.length.toLocaleString()} / {tightestLimit.toLocaleString()}
                </span>
              </div>
            </div>

            {/* hashtags */}
            <div>
              <span className="sk-lbl">Hashtags</span>
              <HashtagEditor value={hashtags} onChange={setHashtags} />
            </div>

            {/* media zone */}
            <div>
              <span className="sk-lbl">Media</span>
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: the zone is a convenience drop target; the explicit Upload + Library buttons below are the keyboard-accessible controls */}
              <div
                className={`sk-drop${dragOver ? " is-drag" : ""}`}
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
                style={{ padding: media.length ? 12 : 22 }}
              >
                {media.length === 0 ? (
                  <div style={{ color: "var(--sk-muted)" }}>
                    <Icon name="upload" size={22} style={{ color: "var(--sk-pri)" }} />
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
                          border: "1px solid var(--sk-line)",
                          background: "var(--sk-soft)",
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
                              background: "var(--sk-pri)",
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
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button type="button" className="sk-btn-out" style={{ height: 34 }} onClick={() => setLibraryOpen(true)}>
                  <Icon name="image" size={13} />
                  Content library
                </button>
                <AiImageButton imageGen={imageGen} onClick={() => setCreativesOpen(true)} />
              </div>
            </div>

            {/* location */}
            {establishments.length > 0 && (
              <label style={{ display: "block" }}>
                <span className="sk-lbl">Location</span>
                <select
                  className="sk-select"
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
            <div style={{ borderTop: "1px solid var(--sk-divider)", paddingTop: 16 }}>
              <span className="sk-lbl">When to post</span>
              <div className="sk-seg sk-seg--full" style={{ marginBottom: 10 }}>
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
                    className="sk-input"
                    aria-label="Schedule date and time"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                  />
                  {recommendTimes && (
                    <div>
                      <button
                        type="button"
                        className="sk-btn-out"
                        style={{ height: 34 }}
                        onClick={fetchBestTimes}
                        disabled={btPending}
                      >
                        <Icon name="bolt" size={13} />
                        {btPending ? "Finding…" : "Suggest best times"}
                      </button>
                      {bestTimes && bestTimes.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                          {bestTimes.map((t) => (
                            <button
                              type="button"
                              key={t}
                              className="sk-chip is-active"
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
              {miniCal && <MiniCalendar posts={miniCal} />}
            </div>

            {/* actions */}
            <div style={{ borderTop: "1px solid var(--sk-divider)", paddingTop: 16, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn--pri"
                  style={{ flex: 1, minWidth: 150, justifyContent: "center", height: 44 }}
                  onClick={() => submit(scheduleMode === "schedule" ? "save" : "publish")}
                  disabled={pending || uploading}
                >
                  <Icon name={scheduleMode === "schedule" ? "clock" : "send"} size={14} />
                  {pending ? "Working…" : scheduleMode === "schedule" ? "Schedule post" : "Publish now"}
                </button>
                <button
                  type="button"
                  className="sk-btn-out"
                  style={{ height: 44 }}
                  onClick={() => submit("save")}
                  disabled={pending || uploading}
                >
                  <Icon name="edit" size={13} />
                  Save as draft
                </button>
              </div>
              <div style={{ minHeight: 18 }}>
                {error && (
                  <span className="row" style={{ fontSize: 12.5, color: "#c0344a", gap: 6 }} role="alert">
                    <Icon name="alert" size={13} /> {error}
                  </span>
                )}
                {success && !error && (
                  <span className="row" style={{ fontSize: 12.5, color: "#0f8a4d", gap: 6 }}>
                    <Icon name="checkCircle" size={13} /> {success}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ===================== CENTER: live preview ===================== */}
        <div className="sk-card">
          <div className="sk-card__head">
            <div>
              <h3 className="sk-card__title">Preview</h3>
              <div className="sk-card__sub">See how your post will look on each platform</div>
            </div>
            <select
              className="sk-select"
              aria-label="Preview platform"
              value={previewPlatform}
              onChange={(e) => setPreviewPlatform(e.target.value as PreviewPlatform)}
              style={{ width: 140, height: 36, fontSize: 12.5 }}
            >
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sk-card__body" style={{ background: "var(--sk-soft)" }}>
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

        {/* ===================== RIGHT: channels ===================== */}
        <div className="sk-card">
          <div className="sk-card__head">
            <div>
              <h3 className="sk-card__title">Channels</h3>
              <div className="sk-card__sub">
                {connectedPlatforms.length} connected
              </div>
            </div>
            <Link href="/connections" className="sk-btn-out" style={{ height: 32 }}>
              Manage
            </Link>
          </div>
          <div className="sk-card__body" style={{ display: "grid", gap: 10 }}>
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
                  className={`sk-channel${on ? " is-on" : ""}`}
                >
                  <span className="sk-channel__icon">
                    <Icon name={p.icon} size={16} />
                  </span>
                  <span className="sk-channel__name">
                    {p.label}
                    {!connected && <span className="sk-channel__sub">Not connected</span>}
                  </span>
                  {connected ? (
                    <span
                      className="sk-status sk-status--published"
                      style={{ height: 22, fontSize: 11 }}
                    >
                      <span className="sk-status__dot" />
                      Connected
                    </span>
                  ) : (
                    <Icon name="lock" size={14} style={{ color: "var(--sk-muted)" }} />
                  )}
                </button>
              );
            })}

            <Link
              href="/connections"
              className="row"
              style={{
                gap: 8,
                justifyContent: "center",
                padding: "11px 12px",
                borderRadius: 11,
                background: "var(--sk-pri-soft)",
                color: "var(--sk-pri)",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
                marginTop: 4,
              }}
            >
              <Icon name="plus" size={14} />
              Connect channel
            </Link>
          </div>
        </div>
      </div>

      {/* ===================== creative idea tiles ===================== */}
      <section className="sk-card sk-ideas" aria-label="Creative ideas">
        <div className="sk-card__head">
          <div>
            <h3 className="sk-card__title">Creative ideas</h3>
            <p className="sk-card__sub">
              Starter angles — tap one to prefill the editor, then make it yours.
            </p>
          </div>
        </div>
        <div className="sk-card__body">
          <div className="sk-ideas__grid">
            {CREATIVE_IDEAS.map((idea) => (
              <button key={idea.id} type="button" className="sk-idea" onClick={() => applyIdea(idea)}>
                <span className="sk-idea__art" aria-hidden>
                  {/* biome-ignore lint/performance/noImgElement: static illustration-kit asset */}
                  <img src={idea.art} alt="" loading="lazy" />
                </span>
                <span>
                  <span className="sk-idea__name">{idea.name}</span>
                  <span className="sk-idea__sub">{idea.sub}</span>
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
      className={`sk-seg__b${active ? " is-active" : ""}`}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

const MINICAL_DOW = ["M", "T", "W", "T", "F", "S", "S"];

type MiniCalView = {
  ym: string;
  label: string;
  daysInMonth: number;
  firstDow: number;
  today: number;
  scheduled: Set<number>;
  published: Set<number>;
};

/** Bucket posts into day-of-month sets using BROWSER-LOCAL date getters. */
function buildMiniCalView(posts: MiniCalPost[]): MiniCalView {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const scheduled = new Set<number>();
  const published = new Set<number>();
  for (const p of posts) {
    const when = new Date(p.when);
    if (Number.isNaN(when.getTime())) continue;
    if (when.getFullYear() !== y || when.getMonth() !== m) continue; // user-local month
    (p.status === "published" || p.status === "posted" ? published : scheduled).add(when.getDate());
  }
  return {
    ym: `${y}-${String(m + 1).padStart(2, "0")}`,
    label: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    daysInMonth: new Date(y, m + 1, 0).getDate(),
    firstDow: (new Date(y, m, 1).getDay() + 6) % 7, // Monday-first
    today: now.getDate(),
    scheduled,
    published,
  };
}

/**
 * Compact month grid in the schedule column — dots/fills on days that already
 * have scheduled or published posts. Month/today/day-buckets are computed in
 * the BROWSER after mount (useEffect) so the grid reflects the user's timezone
 * AND never hydration-mismatches the server HTML (no new Date() in render).
 * Every day deep-links to the full /social/calendar; the datetime input above
 * stays the real control.
 */
function MiniCalendar({ posts }: { posts: MiniCalPost[] }) {
  const [data, setData] = useState<MiniCalView | null>(null);
  useEffect(() => {
    setData(buildMiniCalView(posts));
  }, [posts]);
  if (!data) return <div className="sk-minical" aria-hidden style={{ minHeight: 196 }} />;
  const scheduled = data.scheduled;
  const published = data.published;
  const monthName = data.label.split(" ")[0] ?? data.label;
  const href = `/social/calendar?ym=${data.ym}`;
  const cells: (number | null)[] = [
    ...Array.from({ length: data.firstDow }, () => null),
    ...Array.from({ length: data.daysInMonth }, (_, i) => i + 1),
  ];
  return (
    <div className="sk-minical">
      <div className="sk-minical__head">
        <span className="sk-minical__title">{data.label}</span>
        <Link href={href} className="sk-minical__link">
          Open calendar →
        </Link>
      </div>
      <div className="sk-minical__grid">
        {MINICAL_DOW.map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed 7-day header
          <span key={`dow-${i}`} className="sk-minical__dow" aria-hidden>
            {d}
          </span>
        ))}
        {cells.map((day, i) =>
          day === null ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: leading pad cells are positional
            <span key={`pad-${i}`} className="sk-minical__day sk-minical__day--pad" aria-hidden />
          ) : (
            <Link
              key={day}
              href={href}
              className={[
                "sk-minical__day",
                published.has(day)
                  ? "sk-minical__day--published"
                  : scheduled.has(day)
                    ? "sk-minical__day--scheduled"
                    : "",
                day === data.today ? "sk-minical__day--today" : "",
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
        <div className="sk-minical__legend">
          <span>
            <span className="sk-minical__dot" style={{ background: "var(--sk-scheduled)" }} />
            Scheduled
          </span>
          <span>
            <span className="sk-minical__dot" style={{ background: "var(--sk-published)" }} />
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
      className="sk-btn-out"
      style={{ height: 34 }}
      onClick={onClick}
      title={
        imageGen.reason === "not_pro"
          ? "AI image creatives are a Pro feature"
          : imageGen.reason === "not_configured"
            ? "AI image generation isn’t enabled for this workspace"
            : "Generate on-brand images with AI"
      }
    >
      <Icon name="sparkle" size={13} style={{ color: locked ? "var(--gold)" : "var(--sk-pri)" }} />
      AI image
      {locked && <Icon name="lock" size={12} style={{ color: "var(--gold)" }} />}
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
        border: "1px solid var(--sk-line)",
        borderRadius: 10,
        padding: "8px 10px",
        background: "var(--sk-surface)",
        minHeight: 42,
      }}
    >
      {value.map((t) => (
        <span key={t} className="sk-chip is-active" style={{ height: 24, gap: 4 }}>
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

/** First-run "No posts yet" empty state (kit create-post empty mockup). The CTA
    reveals the full composer so the user can compose their first post. */
function NoPostsYet({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="sk-card">
      <div className="sk-empty">
        <div className="sk-empty__art">
          {/* biome-ignore lint/performance/noImgElement: static illustration-kit asset */}
          <img src="/assets/repulabs/post-creator/cp-post.svg" alt="" />
        </div>
        <div>
          <h3 className="sk-empty__title">No posts yet</h3>
          <p className="sk-empty__body">
            Create your first post to connect your channels and start engaging with your audience.
          </p>
          <button type="button" className="btn btn--pri" style={{ height: 46 }} onClick={onCreate}>
            <Icon name="edit" size={14} />
            Create post
          </button>
          <div className="sk-empty__note">
            <Icon name="lock" size={13} />
            Your connections are secure and encrypted.
          </div>
        </div>
      </div>
    </div>
  );
}

function NothingConnected() {
  return (
    <div className="sk-card">
      <div className="sk-empty">
        <div className="sk-empty__art">
          {/* biome-ignore lint/performance/noImgElement: static illustration-kit asset */}
          <img src="/assets/repulabs/post-creator/cp-post.svg" alt="" />
        </div>
        <div>
          <h3 className="sk-empty__title">Connect a channel to start posting</h3>
          <p className="sk-empty__body">
            Link Facebook, Instagram, X or LinkedIn and you’ll be able to compose, schedule, and
            publish across all of them from here — with AI captions and a live preview.
          </p>
          <Link href="/connections" className="btn btn--pri" style={{ height: 46 }}>
            <Icon name="plug" size={14} />
            Go to Connections
          </Link>
          <div className="sk-empty__note">
            <Icon name="lock" size={13} />
            Your connections are secure and encrypted.
          </div>
        </div>
      </div>
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

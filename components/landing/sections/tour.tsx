"use client";

/**
 * LandingTour — the scroll-driven product tour for the repulabs marketing home.
 *
 * Port of the founder's "parallax scroll Component" (hero section.txt): three
 * alternating full-height panels, each pairing a big title + description with
 * a real product screen. Panels showed a still screenshot revealed via a
 * scroll-driven clip-path wipe; they now show a looping product VIDEO
 * instead, so the reveal changed too — a directional wipe mask looks broken
 * on video (it visibly chops off motion mid-frame), so panels now fade +
 * scale in on scroll instead, and each video plays only while its panel is
 * in view (`useInView`, paused otherwise) so three autoplaying videos aren't
 * all decoding off-screen at once.
 *
 * Videos live in /public/assets/repulabs/landingPageVideos/, named per
 * product surface (reviews.mp4, ai_knowledge_base.mp4, social_studio.mp4).
 *
 * Each panel also gets its own ambient background wash (a soft blurred glow
 * in the section's accent color), so the plain white/pale-blue backdrop the
 * section used to share across all three panels now shifts distinctly per
 * topic — reviews reads blue, AI knowledge base reads teal, social studio
 * reads purple — without touching the panel's actual layout/structure.
 *
 * Restyled from the original dark theme to the repulabs LIGHT brand: ink type,
 * muted #5b6473 body copy, screens framed in rounded-2xl light borders with a
 * soft blue-tinted shadow — bigger than the original's `size-80` (fluid
 * `w-[560px] max-w-full` cards showing the real app).
 */

import { Reveal, ShinyText } from "@/components/landing/anim";
import { cn } from "@/lib/utils";
import { ArrowDown, Maximize2, X } from "lucide-react";
import { AnimatePresence, motion, useInView, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";

const VIDEO = "/assets/repulabs/landingPageVideos";

/* CONST section array — the hook arrays below map over this, so its length
   must never change at runtime (that is how the original component works). */
const SECTIONS = [
  {
    id: 1,
    kicker: "Reviews",
    accent: "#2563eb",
    accentSoft: "#eaf1ff",
    title: "Every review, one inbox",
    description:
      "Google, Facebook and Yelp stream into a single queue the moment they land. AI drafts the reply in your voice — you skim, approve and move on with your day.",
    video: `${VIDEO}/reviews.mp4`,
    alt: "repulabs Reviews — every platform in one moderated queue",
    reverse: false,
  },
  {
    id: 2,
    kicker: "AI Knowledge Base",
    accent: "#0891b2",
    accentSoft: "#e6f8fb",
    title: "Teach your AI once, it never forgets",
    description:
      "Upload your FAQs, policies and pricing — the AI learns your business and uses it everywhere: replies, chat, every customer question. Always accurate, always on-brand.",
    video: `${VIDEO}/ai_knowledge_base.mp4`,
    alt: "repulabs AI Knowledge Base — upload docs, the AI learns your business",
    reverse: true,
  },
  {
    id: 3,
    kicker: "Social Studio",
    accent: "#7c3aed",
    accentSoft: "#f2eeff",
    title: "Schedule once, post everywhere",
    description:
      "Draft a week of posts in minutes, publish to Facebook and Instagram on schedule, and keep an eye on every comment — without ever leaving repulabs.",
    video: `${VIDEO}/social_studio.mp4`,
    alt: "repulabs Social Studio — scheduled posts and comment monitoring",
    reverse: false,
  },
] as const;

export function LandingTour() {
  /* ── original fixed-array hook pattern — one ref / progress / transform set
        per section, mapped over the CONST array above ── */
  const sectionRefs = SECTIONS.map(() => useRef<HTMLDivElement>(null));
  const videoRefs = SECTIONS.map(() => useRef<HTMLVideoElement>(null));

  const scrollYProgress = SECTIONS.map(
    (_, index) =>
      useScroll({
        target: sectionRefs[index],
        offset: ["start end", "center start"],
      }).scrollYProgress,
  );

  // Panel fades + scales up into place instead of the old directional
  // clip-path wipe (which visibly sliced a playing video mid-motion).
  const opacityMedia = scrollYProgress.map((progress) => useTransform(progress, [0, 0.6], [0, 1]));
  const scaleMedia = scrollYProgress.map((progress) => useTransform(progress, [0, 0.6], [0.94, 1]));

  const translateContents = scrollYProgress.map((progress) =>
    useTransform(progress, [0, 1], [-50, 0]),
  );

  // Only the panel actually on screen plays — the other two videos stay
  // paused rather than all three decoding + looping off-screen at once.
  const inViews = SECTIONS.map((_, index) => useInView(sectionRefs[index]!, { amount: 0.5 }));

  // Click a panel's video to watch it full-size with real controls — the
  // scroll thumbnails are muted/looping/cropped-to-fill, not meant for
  // actually watching.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const openSection = openIndex === null ? null : SECTIONS[openIndex]!;

  // A thumbnail plays only when its panel is in view AND its full-size modal
  // isn't the one open — single source of truth, so closing the modal
  // correctly resumes the thumbnail (if still in view) instead of leaving it
  // paused from whatever last touched it.
  SECTIONS.forEach((_, index) => {
    const videoRef = videoRefs[index]!;
    const shouldPlay = inViews[index] && openIndex !== index;
    useEffect(() => {
      const el = videoRef.current;
      if (!el) return;
      if (shouldPlay) {
        el.play().catch(() => {
          /* autoplay can be blocked before any user interaction — the poster
             frame still shows, so this fails silently rather than erroring. */
        });
      } else {
        el.pause();
      }
    }, [shouldPlay, videoRef]);
  });

  useEffect(() => {
    if (openIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenIndex(null);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [openIndex]);

  return (
    <>
    <section
      id="tour"
      aria-labelledby="tour-heading"
      className="relative isolate overflow-hidden"
      style={{
        background: "radial-gradient(130% 80% at 50% 0%, #ffffff 0%, #f2f6ff 55%, #f8faff 100%)",
      }}
    >
      {/* ── compact header (stands in for the original's full-screen intro) ── */}
      <div className="mx-auto w-full max-w-[1200px] px-5 pt-24 text-center sm:px-8 sm:pt-28">
        <Reveal>
          <span
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 backdrop-blur"
            style={{ borderColor: "#D9DDF7", background: "rgba(255,255,255,0.65)" }}
          >
            <ShinyText
              text="✦ SEE IT IN ACTION"
              className="text-[13px] font-bold tracking-[0.16em] text-[#2563eb]"
            />
          </span>
        </Reveal>

        <Reveal delay={0.06}>
          <h2
            id="tour-heading"
            className="mx-auto mt-6 max-w-[18ch] text-balance text-[40px] font-bold leading-[1.04] tracking-[-0.025em] text-[#0b1220] sm:text-[56px]"
          >
            Three screens that{" "}
            <span className="bg-gradient-to-r from-[#2563eb] to-[#7c3aed] bg-clip-text text-transparent">
              run your reputation.
            </span>
          </h2>
        </Reveal>

        <Reveal delay={0.12}>
          <p className="mt-8 inline-flex items-center gap-1.5 text-[13px] font-semibold tracking-[0.14em] text-[#5b6473]">
            SCROLL <ArrowDown size={15} />
          </p>
        </Reveal>
      </div>

      {/* ── the three parallax panels (original structure + animations) ── */}
      <div className="flex flex-col px-6 md:px-0">
        {SECTIONS.map((section, index) => (
          <div
            key={section.id}
            ref={sectionRefs[index]}
            className={cn(
              "relative flex min-h-screen flex-col items-center justify-center gap-14 overflow-hidden py-16 md:flex-row md:gap-24 lg:gap-32",
              section.reverse && "md:flex-row-reverse",
            )}
          >
            {/* ambient per-panel color wash — the section's plain white/pale-
                blue backdrop shifts distinctly per topic, biased toward the
                video side, without changing the panel's own layout */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                background: `radial-gradient(55% 55% at ${section.reverse ? "22% 50%" : "78% 50%"}, ${section.accentSoft} 0%, transparent 70%)`,
              }}
            />

            {/* text side — the original's translateY drift on both nodes */}
            <motion.div style={{ y: translateContents[index] }} className="max-w-sm">
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-[13px] font-bold tracking-[0.18em]"
                style={{ background: section.accentSoft, color: section.accent }}
              >
                {section.kicker.toUpperCase()}
              </span>
              <div className="mt-4 max-w-sm text-[38px] font-bold leading-[1.06] tracking-[-0.02em] text-[#0b1220] sm:text-[48px]">
                {section.title}
              </div>
              <motion.p
                style={{ y: translateContents[index] }}
                className="mt-14 max-w-sm text-[17px] leading-[1.6] text-[#5b6473]"
              >
                {section.description}
              </motion.p>
            </motion.div>

            {/* video side — fade + scale in on scroll (see header note on why
                this replaced the old clip-path wipe) */}
            <motion.div
              style={{
                opacity: opacityMedia[index],
                scale: scaleMedia[index],
              }}
              className="relative"
            >
              {/* soft accent glow, revealed together with the shot */}
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-8 -z-10 rounded-[36px] blur-3xl"
                style={{
                  background: `radial-gradient(60% 60% at 50% 45%, ${section.accent}3d 0%, transparent 70%)`,
                }}
              />
              <button
                type="button"
                onClick={() => setOpenIndex(index)}
                aria-label={`Watch ${section.kicker} full-size`}
                className="group block w-[680px] max-w-full cursor-pointer overflow-hidden rounded-2xl border border-[#E1E6F0] bg-white text-left"
                style={{ boxShadow: "0 34px 70px -34px rgba(26,43,95,0.38)" }}
              >
                {/* aspect-video (16:9) matches the recordings' native ratio —
                    at the old 16:11 frame, cover had to crop the LEFT/RIGHT
                    edges to fill the narrower box (16:11 < 16:9). Matching the
                    ratio means cover has nothing left to crop on that axis. */}
                <div className="relative aspect-video w-full overflow-hidden">
                  <video
                    ref={videoRefs[index]}
                    src={section.video}
                    aria-label={section.alt}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    /* The source recordings ALSO have a thin black letterbox
                       baked into the footage itself (measured ~3% top + ~3%
                       bottom on reviews.mp4) — separate from the box-ratio
                       crop above, and not fixable by object-fit/aspect-ratio
                       since it's baked into the pixels. A slight scale-up
                       crops those bars out instead. */
                    className="h-full w-full scale-[1.12] object-cover"
                  >
                    <track kind="captions" />
                  </video>

                  {/* click-to-expand affordance — shows on hover/focus */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/25 group-hover:opacity-100 group-focus-visible:bg-black/25 group-focus-visible:opacity-100">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-white/90 text-[#0b1220] shadow-lg">
                      <Maximize2 size={20} />
                    </span>
                  </div>
                </div>
              </button>
            </motion.div>
          </div>
        ))}
      </div>
    </section>

    {/* full-size video modal — the scroll thumbnails are muted, looping and
        cropped-to-fill; this is the real "watch it" experience */}
    <AnimatePresence>
      {openSection && (
        <motion.div
          key="tour-video-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${openSection.kicker} — full-size video`}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            aria-label="Close video"
            onClick={() => setOpenIndex(null)}
            className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            className="relative w-full max-w-[1100px]"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <button
              type="button"
              onClick={() => setOpenIndex(null)}
              aria-label="Close"
              className="absolute -top-12 right-0 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:-top-14"
            >
              <X size={20} />
            </button>
            <div
              className="overflow-hidden rounded-2xl border border-white/10 bg-black"
              style={{ boxShadow: "0 40px 100px -30px rgba(0,0,0,0.7)" }}
            >
              <div className="aspect-video w-full">
                {/* biome-ignore lint/a11y/useMediaCaption: product demo has no dialogue/narration to caption */}
                <video
                  key={openSection.id}
                  src={openSection.video}
                  autoPlay
                  controls
                  playsInline
                  className="h-full w-full"
                />
              </div>
            </div>
            <p className="mt-4 text-center text-[13px] font-semibold tracking-[0.1em] text-white/70">
              {openSection.kicker.toUpperCase()}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}

export default LandingTour;

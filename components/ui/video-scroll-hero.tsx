"use client";

/**
 * VideoScrollHero: a video that starts small in the middle of the screen and
 * grows to full size as you scroll through its section (sticky, 200vh).
 *
 * Adapted from the community "video-scroll-hero" component for this project:
 *   - motion/react (the project's motion library) instead of framer-motion,
 *     and scroll-linked transforms via useScroll, so scrolling doesn't
 *     re-render React on every scroll event.
 *   - Large videos stay cheap: preload="none" with a poster frame, and the
 *     video only plays while the section is near the viewport.
 *   - The caption fades out as the video reaches full size, then a control
 *     bar appears: play/pause, seek, time, sound and full screen (the video
 *     autoplays muted, as browsers require). A visitor who pauses it is never
 *     auto-resumed by scrolling.
 *   - Reduced-motion visitors get the full-size video with no scaling.
 *   - Transparent background so it sits on the glass landing canvas.
 */

import { Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

interface VideoScrollHeroProps {
  videoSrc: string;
  /** Still frame shown until the video starts. */
  poster?: string;
  /** Caption over the video while it is still small. */
  title?: ReactNode;
  subtitle?: ReactNode;
  enableAnimations?: boolean;
  className?: string;
  /** Scale the video starts at (grows to 1). */
  startScale?: number;
}

export function VideoScrollHero({
  videoSrc,
  poster,
  title,
  subtitle,
  enableAnimations = true,
  className = "",
  startScale = 0.25,
}: VideoScrollHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion();
  const animate = enableAnimations && !reduce;

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });
  const scale = useTransform(scrollYProgress, [0, 1], [startScale, 1]);
  const captionOpacity = useTransform(scrollYProgress, [0, 0.55, 0.8], [1, 1, 0]);
  const [full, setFull] = useState(!animate);
  useMotionValueEvent(scrollYProgress, "change", (v) => setFull(!animate || v > 0.8));

  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Set when the visitor pauses: scrolling back into view must not resume it.
  const userPaused = useRef(false);

  // Load and play only while the section is near the viewport.
  useEffect(() => {
    const el = containerRef.current;
    const video = videoRef.current;
    if (!el || !video) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          if (!userPaused.current) video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      userPaused.current = false;
      video.play().catch(() => {});
    } else {
      userPaused.current = true;
      video.pause();
    }
  };

  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    if (!video.muted && video.paused) {
      userPaused.current = false;
      video.play().catch(() => {});
    }
  };

  const seek = (t: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(t)) return;
    video.currentTime = t;
    setTime(t);
  };

  const fullscreen = () => {
    const video = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    if (!video) return;
    if (video.requestFullscreen) video.requestFullscreen().catch(() => {});
    else video.webkitEnterFullscreen?.(); // iOS Safari
  };

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className={`relative ${animate ? "h-[200vh]" : ""}`}>
        <div
          className={`${animate ? "sticky top-0 h-screen" : "py-10"} flex w-full items-center justify-center`}
        >
          <motion.div
            className="relative will-change-transform"
            style={{ scale: animate ? scale : 1, transformOrigin: "center center" }}
          >
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: click-to-play is a mouse shortcut; keyboard users have the Play button in the control bar */}
            <video
              ref={videoRef}
              muted
              loop
              playsInline
              preload="none"
              poster={poster}
              onClick={full ? togglePlay : undefined}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
              className={`aspect-video w-[90vw] max-w-[1100px] rounded-[28px] object-cover ${full ? "cursor-pointer" : ""}`}
              style={{ boxShadow: "0 40px 90px -40px rgba(30,58,138,.65)", background: "#0b1220" }}
            >
              <source src={videoSrc} type="video/mp4" />
              Your browser does not support the video tag.
            </video>

            {(title || subtitle) && (
              <motion.div
                aria-hidden={full}
                className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[28px] px-6 text-center"
                style={{
                  opacity: animate ? captionOpacity : 0,
                  background: "linear-gradient(to top, rgba(11,18,32,.72), rgba(11,18,32,.28))",
                }}
              >
                <div className="text-white">
                  {title && (
                    <h2
                      className="font-bold"
                      style={{
                        fontSize: "clamp(28px, 5vw, 64px)",
                        lineHeight: 1.05,
                        letterSpacing: "-0.03em",
                      }}
                    >
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p
                      className="mx-auto mt-4 max-w-2xl"
                      style={{
                        fontSize: "clamp(14px, 1.6vw, 20px)",
                        color: "rgba(255,255,255,.82)",
                      }}
                    >
                      {subtitle}
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* control bar, once the video is full size */}
            <div
              className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-full px-2 py-1.5 text-white transition-opacity duration-300 sm:inset-x-5 sm:bottom-5 sm:gap-3 sm:px-3"
              style={{
                background: "rgba(11,18,32,.58)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,.16)",
                opacity: full ? 1 : 0,
                pointerEvents: full ? "auto" : "none",
              }}
              aria-hidden={!full}
            >
              <CtrlButton label={playing ? "Pause" : "Play"} onClick={togglePlay} tabbable={full}>
                {playing ? (
                  <Pause size={17} fill="currentColor" />
                ) : (
                  <Play size={17} fill="currentColor" />
                )}
              </CtrlButton>

              <span className="w-[42px] shrink-0 text-right text-[12px] tabular-nums text-white/80">
                {fmt(time)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={Math.min(time, duration || 0)}
                onChange={(e) => seek(Number(e.target.value))}
                aria-label="Seek"
                tabIndex={full ? 0 : -1}
                className="rl-video-seek h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full"
                style={{
                  background: `linear-gradient(to right, #ffffff ${duration ? (time / duration) * 100 : 0}%, rgba(255,255,255,.28) 0)`,
                }}
              />
              <span className="w-[42px] shrink-0 text-[12px] tabular-nums text-white/80">
                {fmt(duration)}
              </span>

              <CtrlButton
                label={muted ? "Turn sound on" : "Mute"}
                onClick={toggleSound}
                tabbable={full}
              >
                {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </CtrlButton>
              <CtrlButton label="Full screen" onClick={fullscreen} tabbable={full}>
                <Maximize size={16} />
              </CtrlButton>
            </div>
            <style>{`
              .rl-video-seek::-webkit-slider-thumb { -webkit-appearance: none; width: 13px; height: 13px; border-radius: 999px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.4); }
              .rl-video-seek::-moz-range-thumb { width: 13px; height: 13px; border: 0; border-radius: 999px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.4); }
              .rl-video-seek:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
            `}</style>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function CtrlButton({
  label,
  onClick,
  tabbable,
  children,
}: {
  label: string;
  onClick: () => void;
  tabbable: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      tabIndex={tabbable ? 0 : -1}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
    >
      {children}
    </button>
  );
}

/** 83.4 → "1:23" */
function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const m = Math.floor(t / 60);
  const sec = Math.floor(t % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  type MouseEvent,
  type TouchEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export interface CompareProps {
  firstImage: string;
  secondImage: string;
  className?: string;
  firstImageClassName?: string;
  secondImageClassName?: string;
  /** "hover" follows the cursor, "drag" requires click+drag. */
  slideMode?: "hover" | "drag";
  /** Auto-sweep the slider back and forth. */
  autoplay?: boolean;
  autoplayDuration?: number;
  initialSliderPercentage?: number;
}

export function Compare({
  firstImage,
  secondImage,
  className,
  firstImageClassName,
  secondImageClassName,
  slideMode = "hover",
  autoplay = false,
  autoplayDuration = 5000,
  initialSliderPercentage = 50,
}: CompareProps) {
  const [sliderXPercent, setSliderXPercent] = useState(initialSliderPercentage);
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);
  const autoplayRef = useRef<number | null>(null);

  const startAutoplay = useCallback(() => {
    if (!autoplay) return;
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = (elapsed % autoplayDuration) / autoplayDuration;
      const percentage = 50 + 50 * Math.sin(progress * Math.PI * 2);
      setSliderXPercent(percentage);
      autoplayRef.current = requestAnimationFrame(animate);
    };
    autoplayRef.current = requestAnimationFrame(animate);
  }, [autoplay, autoplayDuration]);

  const stopAutoplay = useCallback(() => {
    if (autoplayRef.current) {
      cancelAnimationFrame(autoplayRef.current);
      autoplayRef.current = null;
    }
  }, []);

  useEffect(() => {
    startAutoplay();
    return () => stopAutoplay();
  }, [startAutoplay, stopAutoplay]);

  const handleMove = useCallback(
    (clientX: number) => {
      if (!sliderRef.current) return;
      const rect = sliderRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderXPercent(percent);
    },
    [],
  );

  function onMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (slideMode === "hover" || (slideMode === "drag" && isDragging)) {
      handleMove(e.clientX);
    }
  }

  function onTouchMove(e: TouchEvent<HTMLDivElement>) {
    if (!autoplay && e.touches[0]) handleMove(e.touches[0].clientX);
  }

  return (
    <div
      ref={sliderRef}
      className={cn(
        "relative h-[400px] w-[400px] cursor-col-resize overflow-hidden rounded-2xl border border-slate-200 bg-white select-none",
        className,
      )}
      onMouseMove={onMouseMove}
      onMouseDown={() => slideMode === "drag" && setIsDragging(true)}
      onMouseUp={() => setIsDragging(false)}
      onMouseLeave={() => setIsDragging(false)}
      onMouseEnter={stopAutoplay}
      onTouchStart={stopAutoplay}
      onTouchMove={onTouchMove}
    >
      {/* Handle */}
      <AnimatePresence initial={false}>
        <motion.div
          className="absolute top-0 z-30 h-full w-0.5 bg-gradient-to-b from-transparent via-[#2457ff] to-transparent"
          style={{ left: `${sliderXPercent}%`, top: 0, zIndex: 40 }}
          transition={{ duration: 0 }}
        >
          <div className="absolute top-1/2 left-1/2 z-30 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md">
            <div className="h-4 w-4 rounded-full bg-gradient-to-br from-[#2457ff] to-[#12b998]" />
          </div>
        </motion.div>
      </AnimatePresence>

      {/* First (clipped) image */}
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        <motion.div
          className="absolute inset-0 h-full w-full overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - sliderXPercent}% 0 0)` }}
          transition={{ duration: 0 }}
        >
          <img
            src={firstImage}
            alt="before"
            className={cn(
              "absolute inset-0 h-full w-full object-cover",
              firstImageClassName,
            )}
            draggable={false}
          />
        </motion.div>
      </div>

      {/* Second (base) image */}
      <img
        src={secondImage}
        alt="after"
        className={cn(
          "absolute inset-0 z-10 h-full w-full object-cover",
          secondImageClassName,
        )}
        draggable={false}
      />
    </div>
  );
}

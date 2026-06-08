"use client";

import { motion } from "motion/react";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type MaskContainerProps = {
  /** Content shown by default (the "covered" layer). */
  children?: React.ReactNode;
  /** Content revealed through the cursor-following mask. */
  revealText?: React.ReactNode;
  /** Mask radius when the cursor is idle (px). */
  size?: number;
  /** Mask radius when hovering (px). */
  revealSize?: number;
  className?: string;
};

export const MaskContainer = ({
  children,
  revealText,
  size = 10,
  revealSize = 600,
  className,
}: MaskContainerProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [mousePosition, setMousePosition] = useState<{
    x: number | null;
    y: number | null;
  }>({ x: null, y: null });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateMousePosition = (e: MouseEvent) => {
      const rect = node.getBoundingClientRect();
      setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    node.addEventListener("mousemove", updateMousePosition);
    return () => node.removeEventListener("mousemove", updateMousePosition);
  }, []);

  const maskSize = isHovered ? revealSize : size;
  const x = mousePosition.x ?? null;
  const y = mousePosition.y ?? null;

  return (
    <motion.div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "relative flex h-[40rem] w-full items-center justify-center overflow-hidden rounded-2xl",
        className,
      )}
      style={{ backgroundColor: "#fbfaf6" }}
    >
      {/* Reveal layer: visible only inside the radial mask */}
      <motion.div
        className="absolute inset-0 z-20 flex items-center justify-center text-center"
        style={{
          backgroundColor: "#2457ff",
          color: "#ffffff",
          maskImage: "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"50\" fill=\"black\"/></svg>')",
          WebkitMaskImage:
            "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"50\" fill=\"black\"/></svg>')",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
        }}
        animate={{
          maskPosition:
            x != null && y != null
              ? `${x - maskSize / 2}px ${y - maskSize / 2}px`
              : "0px 0px",
          maskSize: `${maskSize}px`,
        }}
        transition={{ type: "tween", ease: "backOut", duration: 0.3 }}
      >
        <div className="mx-auto max-w-4xl px-8 text-center text-2xl font-bold sm:text-4xl">
          {revealText}
        </div>
      </motion.div>

      {/* Base layer */}
      <div className="flex h-full w-full items-center justify-center text-center text-2xl font-bold text-[#0f172a] sm:text-4xl">
        {children}
      </div>
    </motion.div>
  );
};

"use client";

import {
  motion,
  useMotionTemplate,
  useMotionValue,
} from "motion/react";
import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface HeroHighlightProps {
  children: ReactNode;
  className?: string;
  containerClassName?: string;
}

export function HeroHighlight({
  children,
  className,
  containerClassName,
}: HeroHighlightProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const dots = `url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle fill='%23cbd5e1' id='pattern-circle' cx='10' cy='10' r='1.6'%3E%3C/circle%3E%3C/svg%3E")`;
  const dotsHover = `url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle fill='%232457ff' id='pattern-circle' cx='10' cy='10' r='1.6'%3E%3C/circle%3E%3C/svg%3E")`;

  function handleMove({ currentTarget, clientX, clientY }: MouseEvent<HTMLDivElement>) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  return (
    <div
      onMouseMove={handleMove}
      className={cn(
        "group relative flex h-[40rem] w-full items-center justify-center bg-[#fbfaf6]",
        containerClassName,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: dots }}
      />
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100"
        style={{
          backgroundImage: dotsHover,
          WebkitMaskImage: useMotionTemplate`radial-gradient(220px circle at ${mouseX}px ${mouseY}px, black 0%, transparent 100%)`,
          maskImage: useMotionTemplate`radial-gradient(220px circle at ${mouseX}px ${mouseY}px, black 0%, transparent 100%)`,
        }}
      />
      <div className={cn("relative z-20", className)}>{children}</div>
    </div>
  );
}

export interface HighlightProps {
  children: ReactNode;
  className?: string;
}

export function Highlight({ children, className }: HighlightProps) {
  return (
    <motion.span
      initial={{ backgroundSize: "0% 100%" }}
      whileInView={{ backgroundSize: "100% 100%" }}
      transition={{ duration: 1.2, ease: "linear", delay: 0.3 }}
      viewport={{ once: true }}
      style={{
        backgroundRepeat: "no-repeat",
        backgroundPosition: "left center",
        display: "inline",
      }}
      className={cn(
        "relative inline-block rounded-lg bg-gradient-to-r from-[#2457ff] to-[#12b998] bg-clip-content px-1 pb-1 text-white",
        className,
      )}
    >
      {children}
    </motion.span>
  );
}

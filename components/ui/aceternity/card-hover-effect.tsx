"use client";

import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

export interface HoverEffectItem {
  title: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  link?: string;
}

export interface HoverEffectProps {
  items: HoverEffectItem[];
  className?: string;
}

export function HoverEffect({ items, className }: HoverEffectProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div
      className={cn(
        "grid grid-cols-1 py-10 md:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {items.map((item, idx) => {
        const Wrapper = item.link ? "a" : "div";
        return (
          <Wrapper
            href={item.link}
            // biome-ignore lint/suspicious/noArrayIndexKey: stable card list
            key={idx}
            className="group relative block h-full w-full p-2"
            onMouseEnter={() => setHovered(idx)}
            onMouseLeave={() => setHovered(null)}
          >
            <AnimatePresence>
              {hovered === idx ? (
                <motion.span
                  className="absolute inset-0 block h-full w-full rounded-3xl bg-gradient-to-br from-[#2457ff]/10 to-[#12b998]/10"
                  layoutId="hoverBackground"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: 0.15 } }}
                  exit={{ opacity: 0, transition: { duration: 0.15, delay: 0.2 } }}
                />
              ) : null}
            </AnimatePresence>
            <div className="relative z-20 h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow group-hover:shadow-lg">
              {item.icon ? (
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#2457ff]/10 text-[#2457ff]">
                  {item.icon}
                </div>
              ) : null}
              <h4 className="font-semibold tracking-wide text-[#0f172a]">
                {item.title}
              </h4>
              <p className="mt-3 text-sm leading-relaxed tracking-wide text-[#475569]">
                {item.description}
              </p>
            </div>
          </Wrapper>
        );
      })}
    </div>
  );
}

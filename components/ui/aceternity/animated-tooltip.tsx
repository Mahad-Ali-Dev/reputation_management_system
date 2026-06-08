"use client";

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { type MouseEvent, useState } from "react";
import { cn } from "@/lib/utils";

export interface AnimatedTooltipItem {
  id: number | string;
  name: string;
  designation: string;
  image: string;
}

export interface AnimatedTooltipProps {
  items: AnimatedTooltipItem[];
  className?: string;
}

export function AnimatedTooltip({ items, className }: AnimatedTooltipProps) {
  const [hovered, setHovered] = useState<number | string | null>(null);
  const springConfig = { stiffness: 100, damping: 5 };
  const x = useMotionValue(0);

  const rotate = useSpring(
    useTransform(x, [-100, 100], [-45, 45]),
    springConfig,
  );
  const translateX = useSpring(
    useTransform(x, [-100, 100], [-50, 50]),
    springConfig,
  );

  function handleMove(event: MouseEvent<HTMLImageElement>) {
    const half = event.currentTarget.offsetWidth / 2;
    x.set(event.nativeEvent.offsetX - half);
  }

  return (
    <div className={cn("flex flex-row items-center", className)}>
      {items.map((item) => (
        <div
          className="group relative -mr-4"
          key={item.id}
          onMouseEnter={() => setHovered(item.id)}
          onMouseLeave={() => setHovered(null)}
        >
          <AnimatePresence mode="popLayout">
            {hovered === item.id ? (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.6 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: {
                    type: "spring",
                    stiffness: 260,
                    damping: 10,
                  },
                }}
                exit={{ opacity: 0, y: 20, scale: 0.6 }}
                style={{
                  translateX,
                  rotate,
                  whiteSpace: "nowrap",
                }}
                className="absolute -top-16 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center justify-center rounded-md bg-[#0f172a] px-4 py-2 text-xs shadow-xl"
              >
                <div className="absolute inset-x-0 -bottom-px z-30 mx-auto h-px w-1/5 bg-gradient-to-r from-transparent via-[#2457ff] to-transparent" />
                <div className="absolute -bottom-px left-1/2 z-30 mx-auto h-px w-2/5 -translate-x-1/2 bg-gradient-to-r from-transparent via-[#12b998] to-transparent" />
                <div className="relative z-30 text-base font-bold text-white">
                  {item.name}
                </div>
                <div className="text-xs text-slate-300">{item.designation}</div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <img
            onMouseMove={handleMove}
            height={100}
            width={100}
            src={item.image}
            alt={item.name}
            className="relative !m-0 h-14 w-14 rounded-full border-2 border-white object-cover object-top !p-0 shadow transition duration-500 group-hover:z-30 group-hover:scale-105"
          />
        </div>
      ))}
    </div>
  );
}

"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

export interface ParallaxScrollProps {
  images: string[];
  className?: string;
}

export function ParallaxScroll({ images, className }: ParallaxScrollProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    container: gridRef,
    offset: ["start start", "end start"],
  });

  const translateFirst = useTransform(scrollYProgress, [0, 1], [0, -200]);
  const translateSecond = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const translateThird = useTransform(scrollYProgress, [0, 1], [0, -200]);

  const third = Math.ceil(images.length / 3);
  const first = images.slice(0, third);
  const second = images.slice(third, 2 * third);
  const last = images.slice(2 * third);

  const columns: Array<{ items: string[]; y: typeof translateFirst }> = [
    { items: first, y: translateFirst },
    { items: second, y: translateSecond },
    { items: last, y: translateThird },
  ];

  return (
    <div
      className={cn("h-[40rem] w-full items-start overflow-y-auto", className)}
      ref={gridRef}
    >
      <div className="mx-auto grid max-w-5xl grid-cols-1 items-start gap-6 px-6 py-20 sm:grid-cols-2 md:grid-cols-3">
        {columns.map((col, colIdx) => (
          <div className="grid gap-6" key={colIdx === 0 ? "col-a" : colIdx === 1 ? "col-b" : "col-c"}>
            {col.items.map((src, idx) => (
              <motion.div
                style={{ y: col.y }}
                // biome-ignore lint/suspicious/noArrayIndexKey: stable image grid
                key={`${colIdx}-${idx}`}
              >
                <img
                  src={src}
                  alt="gallery"
                  className="!m-0 h-80 w-full gap-10 rounded-2xl object-cover object-left-top shadow-sm !p-0"
                  height={400}
                  width={400}
                  loading="lazy"
                />
              </motion.div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

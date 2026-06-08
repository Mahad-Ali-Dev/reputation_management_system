"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface BentoGridProps {
  children: ReactNode;
  className?: string;
}

export function BentoGrid({ children, className }: BentoGridProps) {
  return (
    <div
      className={cn(
        "mx-auto grid max-w-7xl grid-cols-1 gap-4 md:auto-rows-[18rem] md:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface BentoGridItemProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Visual area at the top of the card (image, gradient, illustration). */
  header?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function BentoGridItem({
  title,
  description,
  header,
  icon,
  className,
}: BentoGridItemProps) {
  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className={cn(
        "group/bento row-span-1 flex flex-col justify-between space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:shadow-xl",
        className,
      )}
    >
      {header}
      <div className="transition duration-200 group-hover/bento:translate-x-1">
        {icon ? <div className="mb-2 text-[#2457ff]">{icon}</div> : null}
        {title ? (
          <div className="mt-2 mb-2 font-semibold text-[#0f172a]">{title}</div>
        ) : null}
        {description ? (
          <div className="text-sm font-normal text-[#475569]">{description}</div>
        ) : null}
      </div>
    </motion.div>
  );
}

"use client";

/**
 * ScrollFaq — chat-style FAQ that opens each answer in turn as you scroll.
 *
 * Adapted from a community "scroll FAQ accordion", restyled for repulabs:
 *   - questions are pills (white → brand-blue tint when active), answers are
 *     brand-blue chat bubbles; fonts inherit the landing's --f-ui
 *   - motion/react instead of framer-motion (same API, already installed) and
 *     plain gsap.matchMedia instead of @gsap/react
 *
 * Behaviour fixes over the original:
 *   - kills only its own ScrollTrigger (the original killed every trigger on
 *     the page)
 *   - the open item is derived from scroll progress, so scrolling back up
 *     re-opens earlier answers (the original only fired going forward)
 *   - pins below the floating nav, and only on md+ screens tall enough to fit
 *     it with motion allowed — elsewhere it's a normal click accordion
 *   - the trigger is clickable, so you can jump to any answer
 */

import * as Accordion from "@radix-ui/react-accordion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Minus, Plus } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

export type FaqItem = { id: string; question: string; answer: string };

const INK = "#0b1220";
const MUTE = "#5b6473";
const PRI = "#2563eb";
const LINE = "#e7ecf6";

/** Gap kept above the pinned FAQ so it clears the floating nav pill. */
const PIN_OFFSET = 96;
/** Scroll distance (px) spent on each question while pinned. */
const STEP_DISTANCE = 260;

export function ScrollFaq({ items, header }: { items: FaqItem[]; header?: ReactNode }) {
  const [open, setOpen] = useState<string>(items[0]?.id ?? "");
  const pinRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = pinRef.current;
    if (!el || items.length === 0) return;
    gsap.registerPlugin(ScrollTrigger);

    const mm = gsap.matchMedia();
    mm.add(
      "(min-width: 768px) and (min-height: 720px) and (prefers-reduced-motion: no-preference)",
      () => {
        const trigger = ScrollTrigger.create({
          trigger: el,
          start: `top top+=${PIN_OFFSET}`,
          end: `+=${items.length * STEP_DISTANCE}`,
          pin: true,
          onUpdate: (self) => {
            const index = Math.min(items.length - 1, Math.floor(self.progress * items.length));
            const id = items[index]?.id;
            if (id) setOpen(id);
          },
        });

        // Web fonts swapping in can shift the page after the trigger measured
        // its start/end; re-measure once they're ready. (GSAP already refreshes
        // on window load and resize, and the screenshots above reserve their
        // space via width/height, so the page doesn't shift as they load.)
        void document.fonts?.ready.then(() => ScrollTrigger.refresh());

        return () => trigger.kill();
      },
    );
    return () => mm.revert();
  }, [items]);

  return (
    <div ref={pinRef} className="mx-auto w-full max-w-3xl">
      {header}

      <Accordion.Root
        type="single"
        collapsible
        value={open}
        onValueChange={setOpen}
        className="mt-10 flex flex-col gap-3 text-left"
      >
        {items.map((item) => {
          const isOpen = open === item.id;
          return (
            <Accordion.Item value={item.id} key={item.id}>
              <Accordion.Header>
                <Accordion.Trigger className="group flex w-full items-center gap-3 text-left">
                  <span
                    className="rounded-2xl border px-4 py-2.5 text-[15px] font-semibold transition-colors duration-300"
                    style={
                      isOpen
                        ? { background: "rgba(37,99,235,.1)", borderColor: "rgba(37,99,235,.28)", color: PRI }
                        : { background: "#ffffff", borderColor: LINE, color: INK }
                    }
                  >
                    {item.question}
                  </span>
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-colors duration-300"
                    style={
                      isOpen
                        ? { borderColor: "rgba(37,99,235,.28)", color: PRI, background: "rgba(37,99,235,.08)" }
                        : { borderColor: LINE, color: MUTE, background: "#ffffff" }
                    }
                    aria-hidden
                  >
                    {isOpen ? <Minus size={15} /> : <Plus size={15} />}
                  </span>
                </Accordion.Trigger>
              </Accordion.Header>

              <Accordion.Content asChild forceMount>
                <motion.div
                  initial={false}
                  animate={isOpen ? "open" : "collapsed"}
                  variants={{
                    open: { opacity: 1, height: "auto" },
                    collapsed: { opacity: 0, height: 0 },
                  }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                  // Radix sets `hidden` on closed forced-mount content; keep it
                  // rendered so the collapse animates, and hide it from AT.
                  style={{ display: "block" }}
                  aria-hidden={!isOpen}
                >
                  <div className="ml-8 flex justify-end pt-3 md:ml-20">
                    <div
                      className="max-w-lg rounded-2xl rounded-br-md px-4 py-3 text-[15px] leading-relaxed text-white"
                      style={{
                        background: "linear-gradient(180deg,#2f6bff,#1e40af)",
                        boxShadow: "0 16px 34px -16px rgba(37,99,235,.6)",
                      }}
                    >
                      {item.answer}
                    </div>
                  </div>
                </motion.div>
              </Accordion.Content>
            </Accordion.Item>
          );
        })}
      </Accordion.Root>
    </div>
  );
}

export default ScrollFaq;

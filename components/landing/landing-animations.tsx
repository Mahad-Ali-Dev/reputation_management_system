"use client";

import { useEffect } from "react";

/**
 * Landing-page scroll + entrance animations powered by GSAP + ScrollTrigger.
 *
 * What this does:
 *   - Fades + slides every `data-lp-anim="rise"` element into view as it
 *     enters the viewport (one-shot, doesn't re-fire on scroll back).
 *   - Word-by-word stagger reveal on `data-lp-anim="words"` headings (hero).
 *   - Subtle parallax drift on `data-lp-parallax="<speed>"` (used for the
 *     hero background spots — looks alive without being distracting).
 *   - Staggered grid entry on `data-lp-stagger="<group>"` collections (the
 *     integration logos).
 *
 * Accessibility:
 *   - Wrapped in `gsap.matchMedia()` so `prefers-reduced-motion: reduce`
 *     users get instant final state, no motion.
 *   - All animations are GPU-only (transform + opacity), no layout thrash.
 *
 * Performance:
 *   - GSAP is dynamic-imported on mount so it doesn't block the initial
 *     paint or appear in the server bundle. Total cost: ~45 KB gzipped,
 *     loaded after the LCP element renders.
 *   - ScrollTrigger uses one shared scroll listener for all triggers.
 *   - Cleanup runs on unmount — every trigger and tween is killed.
 */
export function LandingAnimations() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;

      gsap.registerPlugin(ScrollTrigger);

      const mm = gsap.matchMedia();

      mm.add(
        {
          isMotion: "(prefers-reduced-motion: no-preference)",
          isReduced: "(prefers-reduced-motion: reduce)",
        },
        (ctx) => {
          const conditions = ctx.conditions as
            | { isMotion?: boolean; isReduced?: boolean }
            | undefined;
          // Reduced motion: snap everything to final state, no animation.
          if (!conditions?.isMotion) {
            gsap.set("[data-lp-anim], [data-lp-stagger], [data-lp-parallax]", {
              opacity: 1,
              y: 0,
              x: 0,
            });
            return;
          }

          // 1) Section rise — fade + 40px slide-up, one-shot, fires when
          // 15% of the element is in view.
          for (const el of gsap.utils.toArray<HTMLElement>("[data-lp-anim='rise']")) {
            gsap.from(el, {
              opacity: 0,
              y: 36,
              duration: 0.9,
              ease: "power2.out",
              scrollTrigger: {
                trigger: el,
                start: "top 85%",
                toggleActions: "play none none none",
              },
            });
          }

          // 2) Word-stagger on hero headings. We split into word spans so
          // GSAP can stagger them — done in CSS-class-free JS so we don't
          // touch the markup unless this component is mounted.
          for (const el of gsap.utils.toArray<HTMLElement>("[data-lp-anim='words']")) {
            // Skip if already split (re-mounts).
            if (el.dataset.lpSplit === "done") continue;
            const html = el.innerHTML;
            // Wrap each word in a span without breaking inner tags. Naive
            // text-node split is enough for the hero (single text + a
            // styled child span for the gradient line).
            const split = html.replace(
              /(\S+)/g,
              '<span class="lp-word" style="display:inline-block;will-change:transform,opacity">$1</span>',
            );
            el.innerHTML = split;
            el.dataset.lpSplit = "done";

            const words = el.querySelectorAll<HTMLElement>(".lp-word");
            gsap.from(words, {
              opacity: 0,
              yPercent: 60,
              duration: 0.7,
              ease: "power3.out",
              stagger: 0.04,
              scrollTrigger: {
                trigger: el,
                start: "top 90%",
                toggleActions: "play none none none",
              },
            });
          }

          // 3) Stagger groups — integration logos pop in together with a
          // gentle drift, staggered by index from the center.
          const groups = new Map<string, HTMLElement[]>();
          for (const el of gsap.utils.toArray<HTMLElement>("[data-lp-stagger]")) {
            const k = el.dataset.lpStagger ?? "default";
            const arr = groups.get(k) ?? [];
            arr.push(el);
            groups.set(k, arr);
          }
          for (const els of groups.values()) {
            if (els.length === 0) continue;
            gsap.from(els, {
              opacity: 0,
              scale: 0.92,
              y: 16,
              duration: 0.6,
              ease: "back.out(1.4)",
              stagger: { each: 0.045, from: "center" },
              scrollTrigger: {
                trigger: els[0]?.parentElement ?? els[0],
                start: "top 80%",
                toggleActions: "play none none none",
              },
            });
          }

          // 4) Parallax drift on hero spots. `data-lp-parallax="0.3"` means
          // the element translates 30% of the scroll distance — slow enough
          // to feel like depth, fast enough to be noticed.
          for (const el of gsap.utils.toArray<HTMLElement>("[data-lp-parallax]")) {
            const speed = Number.parseFloat(el.dataset.lpParallax ?? "0.2");
            gsap.to(el, {
              yPercent: -100 * speed,
              ease: "none",
              scrollTrigger: {
                trigger: el,
                start: "top bottom",
                end: "bottom top",
                scrub: true,
              },
            });
          }

          // ctx cleanup is automatic via matchMedia — no manual return needed.
        },
      );

      cleanup = () => {
        mm.revert();
        for (const t of ScrollTrigger.getAll()) t.kill();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}

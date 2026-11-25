import { LandingNav } from "@/components/landing/repulabs-landing";
import { G } from "@/components/marketing/glass-page";
import { LazyFrog } from "@/components/ui/lazy-frog";
import { Home } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

const btn = "inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold";

/**
 * App-wide 404, in the glass design used by the landing and marketing pages:
 * the landing nav, then a raised glass card with the 3D Repulabs AI frog (the
 * same mascot as the dashboard and Ask AI) in "at limit" mode, a gradient "404"
 * and the way back. The frog is lazy-loaded, so three.js only downloads here.
 */
export default function NotFound() {
  return (
    <main
      className="glass-theme glass-canvas flex min-h-screen flex-col overflow-x-clip"
      data-glass-mode="light"
      style={{ color: G.ink, fontFamily: "var(--f-ui)" }}
    >
      <LandingNav linkBase="/" />

      <section className="mx-auto flex w-full max-w-[720px] flex-1 flex-col items-center justify-center px-5 py-14 text-center">
        <div className="glass-surface glass-surface--raised w-full rounded-[36px] px-6 pb-12 pt-10 sm:px-12">
          {/* The 3D Repulabs AI frog (three.js, lazy-loaded) in "at limit" mode:
              startled, pale and sweating because the page is gone. His name
              pill says what happened. */}
          <div className="mx-auto -mb-2 flex justify-center">
            <LazyFrog
              state="limit"
              size={230}
              name="Repulabs AI"
              statusLabels={{ limit: "Can’t find this page" }}
              followPointer
            />
          </div>

          <div
            className="mt-6 bg-clip-text font-extrabold leading-none text-transparent"
            style={{
              fontFamily: "var(--f-num)",
              fontSize: 88,
              letterSpacing: "-0.05em",
              backgroundImage: "linear-gradient(160deg,#3b82f6,#1e3a8a)",
            }}
          >
            404
          </div>
          <h1
            className="mt-3"
            style={{ fontSize: 32, lineHeight: 1.1, letterSpacing: "-0.03em", fontWeight: 700 }}
          >
            Page not found
          </h1>
          <p
            className="mx-auto mt-3 max-w-md text-[16px] leading-relaxed"
            style={{ color: G.mute }}
          >
            Even our AI couldn’t track this one down. It may have moved or been renamed.
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard"
              className={`${btn} text-white`}
              style={{ background: G.pri, boxShadow: "0 14px 28px -14px rgba(37,99,235,.9)" }}
            >
              Back to dashboard
            </Link>
            <Link href="/" className={btn} style={{ background: G.fill, color: G.ink }}>
              <Home size={16} /> Home
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

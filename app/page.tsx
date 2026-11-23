import { RepulabsLanding } from "@/components/landing/repulabs-landing";

/**
 * Marketing home ("/") — repulabs landing page.
 *
 *   Nav → Hero (product screenshots) → Stats tiles → Marquee → Who it's for
 *   → How it works → Features (bento) → Product tour (tabbed) → Pricing
 *   → FAQ → CTA band → Footer.
 *
 * All of that lives in <RepulabsLanding>. The previous animation-heavy kit
 * (hero/workspace/ai-robot/tour/steps/metrics/command-center/integrations/
 * locations/frames) is retired from the home route but its components remain
 * in components/landing/* for reuse elsewhere.
 */

export const metadata = {
  title: "repulabs — Run your reputation like a system.",
  description:
    "The reputation OS for local teams. Reviews, AI replies, requests, a unified inbox, AI phone and autopilot — one premium workspace that keeps every customer moment on brand and on time.",
};

export default function LandingPage() {
  return <RepulabsLanding />;
}

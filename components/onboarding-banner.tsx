import Link from "next/link";
import { Button } from "@/components/ui/button";
import { dismissOnboarding } from "@/lib/onboarding/actions";

export type OnboardingFacts = {
  hasEstablishment: boolean;
  hasGoogleConnection: boolean;
  hasReviewReply: boolean;       // a reply that was published OR approved
  hasWidgetKey: boolean;
  hasHardware: boolean;
};

type Step = {
  key: string;
  title: string;
  body: string;
  cta: string;
  href: string;
};

function nextStep(f: OnboardingFacts): Step | null {
  if (!f.hasEstablishment) {
    return {
      key: "establishment",
      title: "Add your first listing",
      body: "Tell us about the listing you're managing, name, address, hours. Takes 30 seconds.",
      cta: "Add listing",
      href: "/establishments",
    };
  }
  if (!f.hasGoogleConnection) {
    return {
      key: "google",
      title: "Connect Google Business Profile",
      body: "Pulls in your reviews automatically. We never write to your listing without your approval.",
      cta: "Connect Google",
      href: "/establishments",
    };
  }
  if (!f.hasReviewReply) {
    return {
      key: "first-reply",
      title: "Approve your first AI-drafted reply",
      body: "We've already drafted a response in your tone. Review it, tweak if needed, hit publish.",
      cta: "Review queue",
      href: "/reviews",
    };
  }
  if (!f.hasWidgetKey) {
    return {
      key: "chatbot",
      title: "Embed the AI chatbot on your website",
      body: "Upload your FAQ once. Your customers get instant answers 24/7. Two lines of HTML.",
      cta: "Set up chatbot",
      href: "/ai",
    };
  }
  if (!f.hasHardware) {
    return {
      key: "hardware",
      title: "Order Review Stands for your front desk",
      body: "Physical QR + NFC stands that turn happy walk-ins into Google reviews. $29 each.",
      cta: "Order stands",
      href: "/hardware",
    };
  }
  return null;
}

export function OnboardingBanner({
  onboardingStep,
  facts,
}: {
  onboardingStep: number;
  facts: OnboardingFacts;
}) {
  if (onboardingStep >= 99) return null; // dismissed
  const step = nextStep(facts);
  if (!step) return null; // fully onboarded

  return (
    <div className="rounded-lg border border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Get started · next step
          </div>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">{step.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{step.body}</p>
          <div className="mt-3 flex items-center gap-3">
            <Button asChild size="sm">
              <Link href={step.href}>{step.cta} →</Link>
            </Button>
            <form action={dismissOnboarding}>
              <Button type="submit" variant="ghost" size="sm" className="text-slate-500">
                Skip onboarding
              </Button>
            </form>
          </div>
        </div>
        <div className="hidden sm:block text-4xl select-none" aria-hidden>
          {step.key === "establishment" && "📍"}
          {step.key === "google" && "🔗"}
          {step.key === "first-reply" && "✍️"}
          {step.key === "chatbot" && "💬"}
          {step.key === "hardware" && "📦"}
        </div>
      </div>
    </div>
  );
}

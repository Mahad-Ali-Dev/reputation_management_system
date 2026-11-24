import { Layers, Phone, QrCode, Sparkles, Zap } from "lucide-react";
import type { ComponentType } from "react";

/** The documentation guides, in reading order. Used by the /docs index, the
 *  guide sidebar and the previous/next links at the bottom of each guide. */
export type DocGuide = {
  href: string;
  title: string;
  blurb: string;
  Icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
};

export const DOC_GUIDES: DocGuide[] = [
  {
    href: "/docs/quickstart",
    title: "Quickstart",
    blurb:
      "Sign up, connect Google Business Profile, send your first review request in under 10 minutes.",
    Icon: Zap,
  },
  {
    href: "/docs/concepts",
    title: "Concepts",
    blurb:
      "Organisations, establishments, devices, brand voice: the mental model the rest of the docs assumes.",
    Icon: Layers,
  },
  {
    href: "/docs/ai-training",
    title: "AI reply training",
    blurb:
      "Train the assistant on your brand voice with three short documents and a handful of approved replies.",
    Icon: Sparkles,
  },
  {
    href: "/docs/hardware",
    title: "QR plaques",
    blurb: "Order, activate and configure hardware plaques. Includes the factory ZIP workflow.",
    Icon: QrCode,
  },
  {
    href: "/docs/phone",
    title: "AI phone receptionist",
    blurb: "Twilio setup, voice clone training, after-hours routing and outcome tagging.",
    Icon: Phone,
  },
];

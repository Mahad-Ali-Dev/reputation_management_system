import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Glass foundation · Design preview",
  description: "Adaptive glassmorphism foundation — frosted (light) + aurora (dark).",
  robots: { index: false, follow: false },
};

export default function GlassPreviewLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}

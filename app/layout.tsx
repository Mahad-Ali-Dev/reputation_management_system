import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist_Mono, Manrope, Onest } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";
import "./design-system.css";
import "./glass-chrome.css";

/**
 * Viewport meta — critical for mobile. Without this, mobile browsers render
 * the page at 980px and zoom out to fit, so @media (max-width: 1023px) rules
 * effectively never trigger on phones. Adding device-width fixes the mobile
 * responsive layout app-wide.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F7F4" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0D0E" },
  ],
};

// Type system (founder pick "C", 2026-11): three faces, one job each.
//   DM Sans  — body/UI text   → --font-text  (feeds --f-ui in globals.css)
//   Onest    — headings       → --font-head  (feeds --f-head)
//   Manrope  — numbers/metrics→ --font-num   (feeds --f-num)
// All variable fonts, so real weights render (no faux-bold). UI weights are
// capped at 700 in CSS per the typography rule.
const text = DM_Sans({ subsets: ["latin"], variable: "--font-text", display: "swap" });
const head = Onest({ subsets: ["latin"], variable: "--font-head", display: "swap" });
const num = Manrope({ subsets: ["latin"], variable: "--font-num", display: "swap" });

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://repulabs.com"),
  title: {
    default: "Repulabs Run your reputation like a system.",
    template: "%s · Repulabs",
  },
  description:
    "The reputation OS for local businesses. Requests, replies, surveys, social, phone all rooted in your brand voice, all in one workspace.",
  applicationName: "Repulabs",
  authors: [{ name: "Repulabs" }],
  keywords: [
    "reputation management",
    "google reviews",
    "review automation",
    "AI replies",
    "review requests",
    "local business",
    "QR review stand",
    "AI phone receptionist",
  ],
  // Google Search Console meta-tag verification. Set GOOGLE_SITE_VERIFICATION
  // to the token from Search Console → "HTML tag" and redeploy. Leave unset to
  // omit the tag entirely (DNS TXT verification needs nothing here).
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
  icons: {
    // Single source of truth — favicon.png covers the standard tab icon,
    // the 180×180 retina slot, and the apple-touch-icon. Cache-busted via
    // a versioned querystring so browsers that aggressively cache the
    // favicon (Chrome, Safari) refresh on next visit.
    icon: [
      { url: "/favicon.png?v=2", type: "image/png" },
      { url: "/favicon.png?v=2", sizes: "180x180", type: "image/png" },
    ],
    apple: "/favicon.png?v=2",
    shortcut: "/favicon.png?v=2",
  },
  openGraph: {
    type: "website",
    siteName: "Repulabs",
    title: "Repulabs Run your reputation like a system.",
    description:
      "The reputation OS for local businesses. AI-drafted replies, review requests, surveys, social, and an AI phone receptionist all in one workspace.",
    url: process.env.NEXT_PUBLIC_APP_URL ?? "https://repulabs.com",
    images: [
      {
        url: "/repulabs-logo.png",
        width: 1200,
        height: 630,
        alt: "Repulabs",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Repulabs Run your reputation like a system.",
    description:
      "AI-drafted replies, review requests, surveys, social, and an AI phone receptionist all in one workspace.",
    images: ["/repulabs-logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${text.variable} ${head.variable} ${num.variable} ${geistMono.variable}`}
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

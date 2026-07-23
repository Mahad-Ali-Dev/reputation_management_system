import type { MetadataRoute } from "next";

/**
 * Marketing sitemap for repulabs.com.
 *
 * ONLY public marketing pages belong here — everything rendered with
 * `AppShellServer` is the logged-in product and is excluded (and blocked in
 * robots.txt). Device redirect routes (/r/*) are never listed: those URLs
 * carry per-device slugs and must not be indexed.
 *
 * Served at https://repulabs.com/sitemap.xml
 */

const SITE = (
  process.env.NEXT_PUBLIC_MARKETING_URL ??
  "https://repulabs.com"
).replace(/\/$/, "");

type Entry = { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] };

const PAGES: Entry[] = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/tour", priority: 0.9, changeFrequency: "monthly" },
  { path: "/customers", priority: 0.8, changeFrequency: "monthly" },
  { path: "/docs", priority: 0.7, changeFrequency: "weekly" },
  { path: "/docs/api", priority: 0.6, changeFrequency: "weekly" },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.6, changeFrequency: "yearly" },
  { path: "/signup", priority: 0.6, changeFrequency: "yearly" },
  { path: "/changelog", priority: 0.5, changeFrequency: "weekly" },
  { path: "/press", priority: 0.4, changeFrequency: "monthly" },
  { path: "/brand", priority: 0.3, changeFrequency: "yearly" },
  { path: "/status", priority: 0.3, changeFrequency: "daily" },
  { path: "/legal/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/cookies", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/dpa", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/security", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/subprocessors", priority: 0.2, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}

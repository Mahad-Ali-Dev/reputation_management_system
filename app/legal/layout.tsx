import { LegalShell } from "@/components/legal/legal-shell";

/**
 * Legal pages shell (privacy, terms, security, DPA). Uses the glassmorphism
 * LegalShell (components/legal/legal-shell.tsx): the landing nav, a blue hero
 * with a switcher between the four documents, a sticky "On this page" table of
 * contents, related-document cards and the marketing footer.
 *
 * Article content in each page.tsx is plain semantic <h1>/<h2>/<p>/<ul>; the
 * shell reads the current document from the URL and styles that markup.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <LegalShell>{children}</LegalShell>;
}

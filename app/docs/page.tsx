import { DocsView } from "@/components/marketing/pages/docs-view";

export const dynamic = "force-static";

export const metadata = {
  title: "Documentation · Repulabs",
  description:
    "Get up and running with Repulabs in 10 minutes. Setup guides and walkthroughs for every part of Repulabs.",
};

// Glass redesign (matches the landing, /legal and company pages). The page
// content lives in components/marketing/pages/docs-view.tsx.
export default function DocsPage() {
  return <DocsView />;
}

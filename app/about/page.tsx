import { AboutView } from "@/components/marketing/pages/about-view";

export const dynamic = "force-static";

export const metadata = {
  title: "About · Repulabs",
  description:
    "Repulabs is the reputation operating system for ambitious small businesses. Built in Melbourne, used worldwide.",
};

// Glass redesign (matches the landing and /legal pages). The page content lives
// in components/marketing/pages/about-view.tsx.
export default function AboutPage() {
  return <AboutView />;
}

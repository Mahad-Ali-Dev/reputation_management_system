import { PressView } from "@/components/marketing/pages/press-view";

export const dynamic = "force-static";

export const metadata = {
  title: "Press · Repulabs",
  description: "Press kit, media contacts, and recent coverage for Repulabs.",
};

// Glass redesign (matches the landing and /legal pages). The page content lives
// in components/marketing/pages/press-view.tsx.
export default function PressPage() {
  return <PressView />;
}

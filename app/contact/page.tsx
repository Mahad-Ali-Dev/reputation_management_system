import { ContactView } from "@/components/marketing/pages/contact-view";

export const dynamic = "force-static";

export const metadata = {
  title: "Contact · Repulabs",
  description:
    "Reach Repulabs for anything sales, support, security, partnerships, press. One inbox, real humans, fast replies.",
};

// Glass redesign (matches the landing and /legal pages). The page content lives
// in components/marketing/pages/contact-view.tsx.
export default function ContactPage() {
  return <ContactView />;
}

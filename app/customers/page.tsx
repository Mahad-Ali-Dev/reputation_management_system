import { CustomersView } from "@/components/marketing/pages/customers-view";

export const dynamic = "force-static";

export const metadata = {
  title: "Customers · Repulabs",
  description:
    "Cafes, dentists, gyms, salons, contractors see how Repulabs customers are running their reputation as a system.",
};

// Glass redesign (matches the landing and /legal pages). The page content lives
// in components/marketing/pages/customers-view.tsx.
export default function CustomersPage() {
  return <CustomersView />;
}

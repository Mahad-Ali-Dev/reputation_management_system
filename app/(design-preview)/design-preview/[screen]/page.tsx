import { DesignPreviewScreen, type ScreenSlug } from "@/components/repulabs-ui/product-preview";
import { notFound } from "next/navigation";

const staticScreenOrder = [
  "auth",
  "onboarding",
  "dashboard",
  "reviews-inbox",
  "campaigns",
  "sentiment",
  "analytics",
  "widgets",
  "locations",
  "team",
  "integrations",
  "settings",
  "billing",
  "system",
] satisfies ScreenSlug[];

export function generateStaticParams() {
  return staticScreenOrder.map((screen) => ({ screen }));
}

export default async function DesignPreviewScreenPage({
  params,
}: {
  params: Promise<{ screen: string }>;
}) {
  const { screen } = await params;
  if (!staticScreenOrder.includes(screen as ScreenSlug)) {
    notFound();
  }
  return <DesignPreviewScreen screen={screen as ScreenSlug} />;
}

import { redirect } from "next/navigation";

/**
 * Template create/edit is now a sheet on the Outreach hub
 * (app/outreach/_components/template-modal.tsx). This route stays so every old
 * link (/outreach/templates/new, /outreach/templates/<id>) opens that sheet.
 */
export const dynamic = "force-dynamic";

export default async function TemplateEditorRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/outreach?tab=templates&template=${encodeURIComponent(id)}`);
}

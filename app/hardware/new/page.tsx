import { redirect } from "next/navigation";

/**
 * The Generate-QR flow is now a sheet on the Device Manager
 * (app/hardware/_components/generate-qr-modal.tsx). This route stays so every
 * old link, the docs, and generateSelfServiceQr's ?error redirect still work.
 */
export default async function NewQrPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  redirect(error ? "/hardware?generate=1&error=1" : "/hardware?generate=1");
}

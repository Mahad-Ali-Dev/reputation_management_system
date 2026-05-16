import Link from "next/link";

export default async function NotActivatedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const sp = await searchParams;
  const isOwner = ["inactive", "no_target", "signature"].includes(sp.reason ?? "");

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="text-6xl">⌛</div>
        <h1 className="text-2xl font-bold">This Review Stand isn't active yet</h1>
        <p className="text-muted-foreground">
          The business owner hasn't finished setting up this device. Please come back in a few
          minutes, or leave a review the regular way.
        </p>
        {isOwner && (
          <div className="mt-6 rounded-md border border-dashed bg-white p-4 text-sm text-left">
            <p className="font-semibold mb-2">Are you the business owner?</p>
            <p>
              Sign in at{" "}
              <Link href="/dashboard" className="text-primary underline">
                Repulabs.io
              </Link>{" "}
              and go to <strong>Hardware → Activate device</strong>. Enter the activation code
              printed on the card inside your package.
            </p>
          </div>
        )}
        <Link href="https://www.google.com" className="block text-sm text-muted-foreground hover:underline">
          Go to Google →
        </Link>
      </div>
    </main>
  );
}

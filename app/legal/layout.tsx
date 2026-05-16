import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight">
            Repulabs
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/legal/subprocessors" className="hover:text-foreground">Sub-processors</Link>
          </nav>
        </div>
      </header>
      <article className="container py-12 max-w-3xl prose prose-slate prose-sm sm:prose-base">
        {children}
      </article>
    </div>
  );
}

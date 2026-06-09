import { Icon } from "@/components/shell/icon";
import { acceptInvite, lookupInvite } from "@/lib/account/actions";
import { auth } from "@/lib/auth/config";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * /accept-invite?token=<plaintext>
 *
 * Pre-membership confirmation page for an invited teammate. Centered, AppShell-free
 * layout (the user may not belong to any workspace yet — they can't render the app
 * shell). Mirrors the auth pages' visual language.
 *
 * Flow:
 *   1. Unauthenticated → bounce to /login?callbackUrl=/accept-invite?token=...
 *      so they sign in with the invited email and land back here.
 *   2. Authenticated → validate (without consuming) and either render a confirm
 *      card with an Accept button (POSTs to the acceptInvite server action), or a
 *      clear error state (expired / already used / wrong email / not found).
 */

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  member: "Member",
  viewer: "Viewer",
};

function CenteredShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--bg, #f8fafc)",
      }}
    >
      <div className="ds-card" style={{ width: "100%", maxWidth: 440, padding: 32 }}>
        <div className="row" style={{ gap: 10, marginBottom: 24 }}>
          <Image
            src="/favicon.png?v=2"
            alt=""
            width={34}
            height={34}
            priority
            style={{ borderRadius: 9, objectFit: "contain" }}
          />
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.025em" }}>
            repu<span style={{ color: "var(--pri)" }}>labs</span>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}

function ErrorState({ title, body }: { title: string; body: string }) {
  return (
    <>
      <div className="lbl-mono" style={{ color: "var(--bad, #dc2626)", marginBottom: 10, fontWeight: 600 }}>
        INVITATION UNAVAILABLE
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.025em", color: "var(--ink)" }}>
        {title}
      </h1>
      <p className="dim" style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.55 }}>
        {body}
      </p>
      <div className="col" style={{ gap: 10, marginTop: 24 }}>
        <Link
          href="/dashboard"
          className="btn btn--pri btn--lg"
          style={{ width: "100%", justifyContent: "center" }}
        >
          Go to dashboard
        </Link>
      </div>
    </>
  );
}

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = (sp.token ?? "").trim();

  if (!token) {
    return (
      <CenteredShell>
        <ErrorState
          title="Missing invitation"
          body="This link is missing its invitation token. Ask whoever invited you to resend the invite."
        />
      </CenteredShell>
    );
  }

  // Not signed in → send them to login with a return path, so they authenticate
  // as the invited email and come straight back here.
  const session = await auth();
  if (!session?.user?.email) {
    const callback = `/accept-invite?token=${encodeURIComponent(token)}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(callback)}`);
  }

  const result = await lookupInvite(token);

  if (!result.ok) {
    const states = {
      not_found: {
        title: "Invitation not found",
        body: "We couldn't find this invitation. The link may be incorrect, or the invite may have been revoked.",
      },
      expired: {
        title: "Invitation expired",
        body: "This invitation has expired. Ask the workspace owner to send you a fresh invite.",
      },
      used: {
        title: "Invitation already used",
        body: "This invitation has already been accepted. If that was you, just sign in and head to your dashboard.",
      },
      wrong_email: {
        title: "Wrong account",
        body: `This invitation was sent to a different email address than the one you're signed in with (${session.user.email}). Sign out and sign back in with the invited email.`,
      },
    } as const;
    const s = states[result.reason];
    return (
      <CenteredShell>
        <ErrorState title={s.title} body={s.body} />
      </CenteredShell>
    );
  }

  const roleLabel = ROLE_LABELS[result.role] ?? result.role;

  return (
    <CenteredShell>
      <div className="lbl-mono" style={{ color: "var(--pri)", marginBottom: 10, fontWeight: 600 }}>
        YOU'VE BEEN INVITED
      </div>
      <h1 style={{ fontSize: 23, fontWeight: 600, margin: 0, letterSpacing: "-0.025em", color: "var(--ink)" }}>
        Join {result.orgName}
      </h1>
      <p className="dim" style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.55 }}>
        You've been invited to join <strong style={{ color: "var(--ink)" }}>{result.orgName}</strong> as{" "}
        <strong style={{ color: "var(--ink)" }}>{roleLabel}</strong>. Accept to add this workspace to your
        account.
      </p>

      <div
        className="ds-card ds-card--pri"
        style={{ padding: 14, fontSize: 12.5, lineHeight: 1.5, marginTop: 20 }}
      >
        <div className="row" style={{ gap: 6 }}>
          <Icon name="mail" size={14} style={{ color: "var(--pri)" }} />
          <span>
            Signed in as <strong>{result.email}</strong>
          </span>
        </div>
      </div>

      <form action={acceptInvite} className="col" style={{ gap: 12, marginTop: 24 }}>
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="btn btn--pri btn--lg"
          style={{ width: "100%", justifyContent: "center" }}
        >
          Accept invitation
          <Icon name="arrowR" size={13} />
        </button>
        <Link
          href="/dashboard"
          className="btn btn--ghost"
          style={{ width: "100%", justifyContent: "center" }}
        >
          Not now
        </Link>
      </form>
    </CenteredShell>
  );
}

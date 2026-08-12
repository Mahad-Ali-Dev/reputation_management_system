import { TRIAL_DAYS } from "@/lib/billing/plans";
import { SUPPORT_REPLY_TO } from "@/lib/email/reply-to";
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { Resend as ResendClient } from "resend";

import { prisma } from "@/lib/db/client";
import { magicLinkEmail } from "@/lib/email/templates";
import { logger } from "@/lib/logger";
import { assertSendableEmailConfig } from "@/lib/outreach/email-guard";

type AuthProvider = NonNullable<NextAuthConfig["providers"]>[number];

/**
 * Auth.js (NextAuth v5) config.
 *
 * - Email magic link via Resend (registered only if RESEND_API_KEY is set)
 * - Google SSO (registered only if AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET are set)
 * - Prisma adapter — uses the Auth.js adapter tables (User, Account, Session, VerificationToken)
 *
 * On first sign-in, we auto-create the user's first organization + owner membership.
 */

// Lazy Resend client — never instantiated unless used.
let _resend: ResendClient | null = null;
function getResend(): ResendClient {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not set");
    _resend = new ResendClient(key);
  }
  return _resend;
}

const providers: AuthProvider[] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: false,
    }),
  );
}

if (process.env.RESEND_API_KEY) {
  providers.push(
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM ?? "Repulabs <auth@repulabs.com>",
      async sendVerificationRequest({ identifier: email, url, provider }) {
        const fromAddress = provider.from ?? process.env.EMAIL_FROM ?? "auth@repulabs.com";
        // Magic link was the ONE sender that skipped this guard, so a
        // *.resend.dev sandbox `from` failed silently here: Resend accepts the
        // send and returns no error, but only delivers to the Resend account
        // owner — every other user just never receives their sign-in link.
        assertSendableEmailConfig(fromAddress);
        const { html, text } = magicLinkEmail(url);
        const { error } = await getResend().emails.send({
          from: fromAddress,
          replyTo: SUPPORT_REPLY_TO,
          to: email,
          subject: "Your sign-in link for Repulabs",
          html,
          text,
        });
        if (error) {
          logger.error({ error, event: "auth.magic_link.send_failed" });
          throw new Error("Failed to send magic link");
        }
      },
    }),
  );
}

if (providers.length === 0) {
  // Don't block the build — log a clear warning. Sign-in will fail until at least one provider is configured.
  logger.warn(
    { event: "auth.no_providers" },
    "No auth providers configured. Set RESEND_API_KEY for magic link OR AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET for Google.",
  );
}

/**
 * Cookie domain shared across all repulabs subdomains, derived from AUTH_URL.
 * The app uses subdomain routing (app./admin./r.) behind nginx; without a shared
 * domain, the OAuth PKCE/state cookie set during sign-in can be absent on the
 * callback → "pkceCodeVerifier cookie was missing" → ?error=Configuration.
 * Returns undefined for localhost / IP / no URL (so local dev is unaffected).
 */
function authCookieDomain(): string | undefined {
  const raw = process.env.AUTH_URL || process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return undefined;
  try {
    const host = new URL(raw).hostname;
    if (host === "localhost" || /^[\d.]+$/.test(host)) return undefined;
    return `.${host.replace(/^www\./, "")}`; // e.g. .repulabs.com
  } catch {
    return undefined;
  }
}

const USE_SECURE_COOKIES = process.env.NODE_ENV === "production";
const COOKIE_DOMAIN = authCookieDomain();
const COOKIE_PREFIX = USE_SECURE_COOKIES ? "__Secure-" : "";
const sharedCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: USE_SECURE_COOKIES,
  domain: COOKIE_DOMAIN,
};

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 }, // 30 days
  trustHost: true,
  useSecureCookies: USE_SECURE_COOKIES,
  // Pin cookies for the reverse-proxy + multi-subdomain setup. The PKCE/state
  // cookies in particular must survive the sign-in → Google → callback round-trip.
  cookies: {
    sessionToken: { name: `${COOKIE_PREFIX}authjs.session-token`, options: sharedCookie },
    callbackUrl: { name: `${COOKIE_PREFIX}authjs.callback-url`, options: sharedCookie },
    pkceCodeVerifier: {
      name: `${COOKIE_PREFIX}authjs.pkce.code_verifier`,
      options: { ...sharedCookie, maxAge: 900 },
    },
    state: { name: `${COOKIE_PREFIX}authjs.state`, options: { ...sharedCookie, maxAge: 900 } },
    nonce: { name: `${COOKIE_PREFIX}authjs.nonce`, options: sharedCookie },
  },
  providers,

  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
    error: "/login/error",
  },

  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      return true;
    },

    /**
     * Post-auth landing. By default Auth.js sends users to the base URL (the
     * marketing home). Send them into the app /dashboard instead, while still
     * honoring an explicit same-site callbackUrl (invite links, deep links).
     */
    async redirect({ url, baseUrl }) {
      try {
        const target = url.startsWith("/") ? new URL(url, baseUrl) : new URL(url);
        const base = new URL(baseUrl);
        const apex = base.hostname.replace(/^www\./, "");
        const sameSite =
          target.hostname === base.hostname ||
          target.hostname === apex ||
          target.hostname.endsWith(`.${apex}`);
        if (!sameSite) return `${baseUrl}/dashboard`;
        // Bare root → app dashboard; otherwise honor the requested path.
        if (target.pathname === "/" || target.pathname === "") {
          return `${target.origin}/dashboard`;
        }
        return target.toString();
      } catch {
        return `${baseUrl}/dashboard`;
      }
    },

    async session({ session, user }) {
      if (user?.id) {
        let membership = await prisma.membership.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "asc" },
          select: { organizationId: true, role: true },
        });
        // Self-heal: if a user somehow has no workspace (e.g. the createUser
        // event failed mid-signup), create one now so they're never stuck in a
        // login → no-org → login redirect loop.
        if (!membership && user.email) {
          try {
            membership = await ensureOrgForUser(user.id, user.email, user.name);
          } catch (err) {
            logger.error(
              { event: "tenant.ensure_failed", userId: user.id, err: String(err) },
              "failed to ensure tenant in session callback",
            );
          }
        }
        if (membership) {
          (session as { orgId?: string; role?: string }).orgId = membership.organizationId;
          (session as { orgId?: string; role?: string }).role = membership.role;
        }
      }
      return session;
    },
  },

  // Surface the real cause of any auth failure. Auth.js otherwise collapses
  // every server-side error into a generic `?error=Configuration` redirect;
  // this prints the underlying name/message/cause to our logs.
  logger: {
    error(error) {
      logger.error(
        {
          event: "authjs.error",
          name: error?.name,
          message: error?.message,
          cause: error?.cause ? String(error.cause) : undefined,
        },
        "Auth.js error",
      );
    },
  },

  events: {
    async createUser({ user }) {
      if (!user.id || !user.email) return;
      // Wrapped + swallowed on purpose: if this throws, Auth.js surfaces the
      // ENTIRE sign-in as `?error=Configuration`. The session callback re-creates
      // the org on the user's first authed request, so we log loudly and let
      // sign-in succeed instead of hard-failing brand-new signups.
      try {
        await ensureOrgForUser(user.id, user.email, user.name);
      } catch (err) {
        logger.error(
          { event: "tenant.create_failed", userId: user.id, err: String(err) },
          "failed to create tenant on signup (will retry on first request)",
        );
      }
    },
  },
};

/**
 * Idempotently ensure a user has a workspace + owner membership, returning their
 * primary membership. Safe to call from both the `createUser` event and the
 * `session` callback — if a membership already exists it's returned as-is.
 */
async function ensureOrgForUser(
  userId: string,
  email: string,
  name?: string | null,
): Promise<{ organizationId: string; role: string }> {
  const existing = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true, role: true },
  });
  if (existing) return existing;

  const slug = await uniqueSlug(email);
  const org = await prisma.organization.create({
    data: {
      name: name ?? email.split("@")[0] ?? "My Workspace",
      slug,
      plan: "trial",
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
      memberships: { create: { userId, role: "owner" } },
    },
    select: { id: true },
  });
  logger.info({ orgId: org.id, userId, event: "tenant.created" }, "tenant + owner created");
  return { organizationId: org.id, role: "owner" };
}

async function uniqueSlug(email: string): Promise<string> {
  const base =
    email
      .split("@")[0]
      ?.toLowerCase()
      ?.replace(/[^a-z0-9-]/g, "-")
      ?.slice(0, 30) ?? "workspace";
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? base : `${base}-${i}`;
    const existing = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${rand}`;
}

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);

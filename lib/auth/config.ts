import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { Resend as ResendClient } from "resend";

import { prisma } from "@/lib/db/client";
import { magicLinkEmail } from "@/lib/email/templates";
import { logger } from "@/lib/logger";

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
        const { html, text } = magicLinkEmail(url);
        const { error } = await getResend().emails.send({
          from: fromAddress,
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

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 }, // 30 days
  trustHost: true,
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

    async session({ session, user }) {
      if (user?.id) {
        const membership = await prisma.membership.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "asc" },
          select: { organizationId: true, role: true },
        });
        if (membership) {
          (session as { orgId?: string; role?: string }).orgId = membership.organizationId;
          (session as { orgId?: string; role?: string }).role = membership.role;
        }
      }
      return session;
    },
  },

  events: {
    async createUser({ user }) {
      if (!user.id || !user.email) return;
      const slug = await uniqueSlug(user.email);
      const org = await prisma.organization.create({
        data: {
          name: user.name ?? user.email.split("@")[0] ?? "My Workspace",
          slug,
          plan: "trial",
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          memberships: {
            create: {
              userId: user.id,
              role: "owner",
            },
          },
        },
      });
      logger.info(
        { orgId: org.id, userId: user.id, event: "tenant.created" },
        "tenant + owner created on first sign-in",
      );
    },
  },
};

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

"use server";

import { signIn } from "@/lib/auth/config";

/**
 * Server-action wrappers around NextAuth's server-side signIn. We call these
 * from <form action={...}> in app/login/page.tsx so the OAuth flow is fully
 * server-side and uses process.env.AUTH_URL from the runtime env.
 *
 * Why this exists: next-auth@5-beta's CLIENT helper from "next-auth/react"
 * (signIn from there) reads process.env.NEXTAUTH_URL at runtime in the
 * client bundle. That resolves to undefined and falls back to localhost,
 * so the redirect_uri sent to Google was wrong. Server actions avoid the
 * client SDK entirely.
 */
export async function googleSignIn(form?: FormData) {
  const raw = (form?.get("callbackUrl") as string) || "/dashboard";
  // Only allow same-site relative paths to avoid an open-redirect.
  const redirectTo = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
  await signIn("google", { redirectTo });
}

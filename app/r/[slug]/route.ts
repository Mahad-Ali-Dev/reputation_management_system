import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { isAllowedReviewHost, verifySlugSignature } from "@/lib/hardware/codes";
import { rememberPendingSlug } from "@/lib/hardware/pending-slug";
import { logger } from "@/lib/logger";
import { resolveReviewRequestClick } from "@/lib/outreach/tracking";
import { checkRateLimit } from "@/lib/ratelimit";
import { publicUrl } from "@/lib/url";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /r/{slug} — short-link redirect.
 *
 * On Hostinger VPS this is the live edge. (On AWS we'd front it with
 * CloudFront + Lambda@Edge; on Cloudflare we'd use a Worker at r.repulabs.com.)
 *
 * Pipeline:
 *   1. Per-IP-per-slug rate limit (60 req/min) to absorb abusive scrapers
 *   2. Look up device by short_slug
 *   3. Verify HMAC signature → defeats KV poisoning / DB tampering
 *   4. Emit scan event (deduped by scan_id)
 *   5. 302 to redirect_url
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const normalizedSlug = slug.toUpperCase();

  // Extract IP early — needed for rate limit + scan dedup.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  // Rate limit per (IP, slug). 60/min covers double-tap and bot retries
  // without blocking a busy storefront where many devices share an IP.
  const rl = await checkRateLimit("scan_redirect", `${ip}:${normalizedSlug}`);
  if (!rl.success) {
    return new NextResponse("Too many scans — slow down.", {
      status: 429,
      headers: { "retry-after": String(rl.retryAfterSeconds) },
    });
  }

  if (!/^[0-9A-HJKMNP-TV-Z]{10}$/.test(normalizedSlug)) {
    return NextResponse.redirect(publicUrl("/not-activated", req));
  }

  const device = await prisma.device.findUnique({
    where: { shortSlug: normalizedSlug },
  });

  if (!device) {
    // Not a hardware QR/NFC slug — try a review-request tracking link (every
    // review request sent since lib/outreach/dispatch.ts started routing
    // through here). Records the first click + notifies the requester.
    const rr = await resolveReviewRequestClick(normalizedSlug);
    if (rr.found) {
      if (!rr.allowedHost) {
        const url = publicUrl("/r/external", req);
        url.searchParams.set("slug", normalizedSlug);
        url.searchParams.set("to", rr.destination);
        return NextResponse.redirect(url, { status: 302 });
      }
      return NextResponse.redirect(rr.destination, { status: 302 });
    }

    logger.warn({ slug, event: "redirect.unknown_slug" });
    return NextResponse.redirect(publicUrl("/not-activated", req));
  }

  if (device.status !== "active") {
    // Pass the slug through so /not-activated can pre-fill the activate form
    // and the "Activate this QR" CTA routes the owner to the right place.
    //
    // ALSO stash it in a cookie. The query string survives exactly one click;
    // a new owner's real path to activation is scan → signup → magic link →
    // onboarding → add a business → /activate, and every hop there drops it.
    // The cookie is what lets /activate still know which unit they scanned, so
    // they only have to type the code. See lib/hardware/pending-slug.ts.
    const res = NextResponse.redirect(
      publicUrl(`/not-activated?reason=inactive&slug=${normalizedSlug}`, req),
    );
    rememberPendingSlug(res, normalizedSlug);
    return res;
  }

  // Multi-platform picker — instead of a 302 to one destination, redirect
  // to the picker page where the guest selects Airbnb / Google / TripAdvisor.
  // The picker page records its own ReviewPlatformChoice on click.
  //
  // We skip the redirect_url + signature checks here because picker devices
  // don't have a single redirect_url — the platform URLs live on the
  // attached Establishment row, which is what the picker page reads. The
  // HMAC signature was protection against poisoning of redirect_url; with
  // no single URL to poison, the protection is moot. Picker devices are
  // safe by construction.
  if (device.productKind === "multi_platform") {
    // Best-effort scan event (same pattern as the redirect branch below).
    const hourBucket = Math.floor(Date.now() / 3600_000);
    const scanId = createHash("sha256")
      .update(`${normalizedSlug}|${ip}|${hourBucket}`)
      .digest("hex")
      .slice(0, 32);
    prisma.deviceScan
      .upsert({
        where: { deviceId_scanId: { deviceId: device.id, scanId } },
        create: {
          deviceId: device.id,
          organizationId: device.organizationId,
          scanId,
          userAgent: req.headers.get("user-agent") ?? null,
          ip: ip !== "unknown" ? ip : null,
        },
        update: {},
      })
      .then(() =>
        prisma.device.update({
          where: { id: device.id },
          data: { scanCount: { increment: 1 }, lastScanAt: new Date() },
        }),
      )
      .catch((err) => {
        logger.error({ err: String(err), slug, event: "scan.write_failed" });
      });

    return NextResponse.redirect(publicUrl(`/r/pick/${normalizedSlug}`, req));
  }

  if (!device.redirectUrl) {
    return NextResponse.redirect(
      publicUrl(`/not-activated?reason=no_target&slug=${normalizedSlug}`, req),
    );
  }

  // Verify signature — defeats DB tampering / KV poisoning attacks.
  // Signature was computed at activation time over slug+redirect_url+expires_at.
  // For now we use a 5-year sliding expiry implicit in the signature. Re-sign on redirect changes.
  // TODO: store expires_at on device + check.
  // For Day 4 v1, we skip the expiry check (signature still binds slug+redirect_url).
  // Defensive: a corrupted "active" row without activatedAt would crash the
  // process with the prior `!` non-null assertion. Treat as inactive instead.
  if (!device.activatedAt) {
    logger.warn({ slug, deviceId: device.id, event: "redirect.no_activated_at" });
    return NextResponse.redirect(publicUrl("/not-activated?reason=inactive", req));
  }
  const expiresAtUnix = Math.floor(device.activatedAt.getTime() / 1000) + 60 * 60 * 24 * 365 * 5;
  if (
    !verifySlugSignature(device.shortSlug, device.redirectUrl, expiresAtUnix, device.slugSignature)
  ) {
    logger.error(
      { slug, deviceId: device.id, event: "redirect.signature_invalid" },
      "slug signature verification failed — possible tampering",
    );
    return NextResponse.redirect(publicUrl("/not-activated?reason=signature", req));
  }

  // Emit scan event. Idempotent on (device_id, scan_id) where scan_id is a per-visit nonce.
  // We generate scan_id deterministically per (slug, ip, hour) to dedupe rapid double-taps.
  const hourBucket = Math.floor(Date.now() / 3600_000);
  const scanId = createHash("sha256")
    .update(`${normalizedSlug}|${ip}|${hourBucket}`)
    .digest("hex")
    .slice(0, 32);

  // Fire-and-forget the scan write; don't block redirect on it.
  prisma.deviceScan
    .upsert({
      where: {
        deviceId_scanId: { deviceId: device.id, scanId },
      },
      create: {
        deviceId: device.id,
        organizationId: device.organizationId,
        scanId,
        userAgent: req.headers.get("user-agent") ?? null,
        ip: ip !== "unknown" ? ip : null,
      },
      update: {},
    })
    .then(() =>
      prisma.device.update({
        where: { id: device.id },
        data: { scanCount: { increment: 1 }, lastScanAt: new Date() },
      }),
    )
    .catch((err) => {
      logger.error({ err: String(err), slug, event: "scan.write_failed" });
    });

  // ---- H-1 OPEN-REDIRECT DEFENSE ----
  // If the destination isn't a known Google review host, route through an
  // interstitial page that shows the destination + a confirmation click.
  // This stops bot-driven phishing flows that use repulabs.com as a free
  // first-hop, while keeping legit Google review redirects fast.
  if (!isAllowedReviewHost(device.redirectUrl)) {
    const url = publicUrl("/r/external", req);
    url.searchParams.set("slug", normalizedSlug);
    url.searchParams.set("to", device.redirectUrl);
    return NextResponse.redirect(url, { status: 302 });
  }

  return NextResponse.redirect(device.redirectUrl, { status: 302 });
}

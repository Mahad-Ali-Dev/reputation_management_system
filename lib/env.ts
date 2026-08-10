/**
 * Runtime environment validation.
 *
 * Imported once at startup via `instrumentation.ts` and accessed by app code
 * via `import { env } from "@/lib/env"`. Fails fast with a readable error if
 * a required production variable is missing or malformed — preventing the
 * silent fallback bugs that bit us when QRs embedded `localhost` because
 * `NEXT_PUBLIC_APP_URL` was unset.
 *
 * Conventions:
 *   - "required-everywhere"  → must be present in dev AND prod
 *   - "required-in-prod"     → must be present when NODE_ENV === "production"
 *   - "optional"             → may be empty/missing in any env
 *
 * Server-only vars are exported as `env`. NEXT_PUBLIC_* vars are inlined at
 * build time by Next.js; we re-validate them here so a missing one surfaces
 * at runtime instead of producing `undefined` in components.
 */

import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

// ---- Helpers ----
const optionalString = z.string().optional().default("");
const optionalUrl = z
  .union([z.string().url(), z.literal(""), z.undefined()])
  .transform((v) => (v && v.length > 0 ? v : undefined));

const required = (name: string) => z.string().min(1, { message: `${name} is required` });

/**
 * A string var required only in production. In dev/test it may be empty.
 */
const prodRequired = (name: string) =>
  isProd
    ? z.string().min(1, { message: `${name} is required in production` })
    : z.string().optional().default("");

/**
 * A URL var required only in production. In dev/test it may be empty;
 * if provided in dev, it still has to parse as a URL.
 */
const prodRequiredUrl = (name: string) =>
  isProd
    ? z.string().url({ message: `${name} must be a valid URL in production` })
    : z
        .union([z.string().url(), z.literal(""), z.undefined()])
        .transform((v) => (v && v.length > 0 ? v : ""))
        .default("");

// ---- Schema ----
const schema = z.object({
  // Core runtime
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  NEXT_TELEMETRY_DISABLED: z.string().optional(),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default(isProd ? "info" : "debug"),

  // App URLs — NEXT_PUBLIC_APP_URL is inlined at build time, but we re-read
  // it here at runtime to catch a misconfigured deploy before any QR or email
  // ships with a localhost URL baked in.
  NEXT_PUBLIC_APP_URL: prodRequiredUrl("NEXT_PUBLIC_APP_URL"),
  NEXT_PUBLIC_SHOPIFY_STORE_URL: z.string().url().default("https://repulabs.com.au"),
  APP_DOMAIN: optionalString,
  ADMIN_DOMAIN: optionalString,
  REDIRECT_DOMAIN: optionalString,

  // Database
  DATABASE_URL: required("DATABASE_URL"),
  DIRECT_URL: optionalString,

  // Auth.js v5
  AUTH_SECRET: prodRequired("AUTH_SECRET"),
  AUTH_URL: prodRequiredUrl("AUTH_URL"),
  /**
   * CRITICAL for Hostinger VPS / any reverse-proxy deployment.
   * Auth.js v5 refuses to use X-Forwarded-Host/Proto unless this is "true".
   * Without it, login redirects break behind Nginx.
   */
  AUTH_TRUST_HOST: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1")
    .default(isProd ? "true" : "false"),
  AUTH_GOOGLE_ID: optionalString,
  AUTH_GOOGLE_SECRET: optionalString,

  // Email
  RESEND_API_KEY: prodRequired("RESEND_API_KEY"),
  EMAIL_FROM: z.string().default("Repulabs <auth@repulabs.com>"),

  // Stripe
  STRIPE_SECRET_KEY: prodRequired("STRIPE_SECRET_KEY"),
  STRIPE_PUBLISHABLE_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: prodRequired("STRIPE_WEBHOOK_SECRET"),
  STRIPE_PRO_PRICE_ID: optionalString,
  STRIPE_HARDWARE_STAND_PRICE_ID: optionalString,

  // Cron / queue
  CRON_SECRET: prodRequired("CRON_SECRET"),

  // Anthropic
  ANTHROPIC_API_KEY: prodRequired("ANTHROPIC_API_KEY"),
  AI_TENANT_DAILY_CAP_MICROS: z.coerce.number().int().default(4_000_000),

  // Upstash (rate limiting + queues) — optional, falls back to in-memory limiter
  UPSTASH_REDIS_REST_URL: optionalString,
  UPSTASH_REDIS_REST_TOKEN: optionalString,
  QSTASH_TOKEN: optionalString,
  QSTASH_CURRENT_SIGNING_KEY: optionalString,
  QSTASH_NEXT_SIGNING_KEY: optionalString,

  // Twilio
  TWILIO_ACCOUNT_SID: optionalString,
  TWILIO_AUTH_TOKEN: optionalString,
  TWILIO_FROM_NUMBER: optionalString,

  // Reputation Autopilot + Voice→Review (Module 15). Both optional with sensible
  // defaults when unset, so the build stays green and behavior is deterministic
  // without configuration.
  /** Default risk tolerance for a brand-new AutopilotConfig: conservative | balanced | aggressive. */
  AUTOPILOT_DEFAULT_RISK: z
    .enum(["conservative", "balanced", "aggressive"])
    .optional()
    .default("balanced"),
  /** Hours to wait after a resolved call before the Voice→Review request is sent. */
  VOICE_REVIEW_DELAY_HOURS: z.coerce.number().int().min(0).max(168).optional().default(3),

  // Encryption (32-byte base64 keys)
  ENCRYPTION_MASTER_KEY: prodRequired("ENCRYPTION_MASTER_KEY"),
  SLUG_HMAC_SECRET: prodRequired("SLUG_HMAC_SECRET"),
  OAUTH_STATE_SECRET: prodRequired("OAUTH_STATE_SECRET"),
  /**
   * Optional. If unset, code falls back to AUTH_SECRET (see lib/secrets.ts).
   * Set when you want to rotate unsubscribe-token signing independently.
   */
  UNSUBSCRIBE_SECRET: optionalString,

  // Cloudflare (edge redirect Worker)
  CLOUDFLARE_ACCOUNT_ID: optionalString,
  CLOUDFLARE_KV_NAMESPACE_ID: optionalString,
  CLOUDFLARE_API_TOKEN: optionalString,

  // Observability
  SENTRY_DSN: optionalUrl,
  SENTRY_AUTH_TOKEN: optionalString,
  AXIOM_TOKEN: optionalString,
  AXIOM_DATASET: z.string().default("repulabs"),

  // Voyage embeddings
  VOYAGE_API_KEY: optionalString,
  // HasData — scrapes PUBLIC Google Maps reviews from a Place ID, so reviews can
  // sync without per-tenant OAuth or Google's GBP API allow-listing. Optional:
  // absent, the HasData sync is skipped and only the GBP OAuth path runs.
  HASDATA_API_KEY: optionalString,

  // ElevenLabs
  ELEVENLABS_API_KEY: optionalString,

  // Vercel Blob (or alternative blob storage)
  BLOB_READ_WRITE_TOKEN: optionalString,

  // Social publishing + metrics (Module 10). ALL optional — publishing/metrics
  // are OFF by default and no-op without these (no live paid call). `META_APP_*`
  // (read directly in lib/connections/adapters/meta) gate Meta OAuth; the two
  // below additionally gate live publish/metrics calls.
  META_GRAPH_ENABLED: optionalString, // "true" to enable live Meta publish/metrics
  META_GRAPH_TOKEN: optionalString,
  // Live X (Twitter) publishing/mentions. Requires the X API paid tier
  // ($100+/mo) — OFF by default; no live call without this flag + a connection.
  TWITTER_PUBLISH_ENABLED: optionalString, // "true" to enable live X publish/read
  // Live LinkedIn publishing. OFF by default; no live call without this flag +
  // a connection. Requires LinkedIn Marketing Developer Platform approval.
  LINKEDIN_PUBLISH_ENABLED: optionalString, // "true" to enable live LinkedIn publish
  // OAuth CONNECT creds for X (Twitter) + LinkedIn. Optional — the connect
  // routes (app/api/connections/{twitter,linkedin}) fail SOFT to
  // ?error=*_not_configured without them, and the registry only flips the tile
  // "ready" once both id + secret exist. Distinct from the *_PUBLISH_ENABLED
  // flags above, which additionally gate the live (paid) publish calls.
  X_CLIENT_ID: optionalString,
  X_CLIENT_SECRET: optionalString,
  LINKEDIN_CLIENT_ID: optionalString,
  LINKEDIN_CLIENT_SECRET: optionalString,
  // AI Image Creatives (Module 10) — Pro + env gated, ships disabled by default.
  // Unset IMAGE_GEN_PROVIDER ⇒ feature is "not enabled" (no paid call ever).
  IMAGE_GEN_PROVIDER: optionalString, // "openai" | "stability" | "" (disabled)
  IMAGE_GEN_MODEL: optionalString,
  OPENAI_API_KEY: optionalString,
  STABILITY_API_KEY: optionalString,

  // SEO & Visibility (Module 13). ALL optional — each adapter no-ops and
  // returns { available:false } with ZERO network calls when its creds are
  // unset, so the build + default code paths never make a live/paid call.
  // GA4 (Google Analytics Data API) — service-account creds; per-org property
  // id lives on `Ga4Connection`, these are the global fallback + auth.
  GA4_CLIENT_EMAIL: optionalString,
  GA4_PRIVATE_KEY: optionalString,
  GA4_PROPERTY_ID: optionalString,
  // PageSpeed Insights (Core Web Vitals) — Google API key.
  PAGESPEED_API_KEY: optionalString,
  // Rank tracking + geo grid + competitor data (the PAID tier). Unset provider
  // ⇒ keyword ranks / geo grid / competitor suggest all no-op (no paid call).
  RANK_TRACKER_PROVIDER: optionalString, // "dataforseo" | "brightlocal" | "" (disabled)
  RANK_TRACKER_API_KEY: optionalString,

  // AWS / S3 (when deploying to AWS or using S3-compatible blob storage)
  AWS_REGION: optionalString,
  AWS_S3_BUCKET_UPLOADS: optionalString,

  // Hostinger / generic VPS
  /** Comma-separated list of IPs whitelisted to hit admin routes. Optional. */
  ADMIN_IP_ALLOWLIST: optionalString,
  /** S3-compatible bucket name for nightly .env.local + uploads backups. Optional. */
  BACKUP_S3_BUCKET: optionalString,
});

// ---- Validation ----
function validateEnv(): z.infer<typeof schema> {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    // eslint-disable-next-line no-console
    console.error(
      `\n[31m✗ Environment validation failed (NODE_ENV=${process.env.NODE_ENV ?? "unset"}):[0m\n${issues}\n\nSee .env.example for the full list of required variables.\n`,
    );
    if (isProd) {
      // Hard exit in prod — refuse to serve a misconfigured deploy.
      process.exit(1);
    }
    // In dev, log loudly but allow the dev to continue working.
    return schema.partial().parse(process.env) as z.infer<typeof schema>;
  }
  return parsed.data;
}

export const env = validateEnv();
export type Env = typeof env;

/**
 * Convenience: run validation explicitly (e.g. from instrumentation.ts) so
 * a misconfigured deploy crashes during boot rather than on first request.
 */
export function assertEnv(): void {
  // Importing this module already invokes validateEnv() at module load.
  // This function exists so the side-effect import has an explicit caller.
  if (!env) throw new Error("env not initialized");
}

import pino from "pino";

/**
 * Structured logger with PII redaction.
 *
 * See INFRASTRUCTURE.md §5.3 — Pino redaction is mandatory across every service so we don't end
 * up with 7-year audit-log retention containing leaked OAuth tokens.
 *
 * Add new redaction paths here when introducing new sensitive fields. Never `console.log` in prod.
 */

const REDACT_PATHS = [
  // Auth / session
  "req.headers.authorization",
  "req.headers.cookie",
  // Top-level PII — Pino paths are exact; "body.email" does NOT match a top-level
  // `email` field, so log {email} at the root must be redacted explicitly.
  "email",
  "phone",
  "*.password",
  "*.password_hash",
  "*.passwordHash",
  "*.totp_secret",
  "*.totpSecret",

  // OAuth / API tokens
  "*.access_token",
  "*.refresh_token",
  "*.access_token_ct",
  "*.refresh_token_ct",
  "*.dek_ciphertext",
  "*.id_token",
  "*.session_state",
  "*.client_secret",

  // Stripe / payment
  "*.stripe_payment_intent",
  "*.stripe_secret",
  "*.stripeSecret",

  // Hardware activation
  "*.activation_code",
  "*.activation_code_hash",
  "*.activationCode",
  "*.slug_signature",

  // PII in request bodies
  "body.email",
  "body.phone",
  "body.recipient",
  "body.recipient_email",
  "body.recipient_phone",
  "*.shipping_address",
  "*.shippingAddress",

  // Webhook secrets
  "*.signing_key",
  "*.webhook_secret",

  // Encryption material
  "*.master_key",
  "*.dek",
  "*.iv",
];

const baseConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: "Repulabs",
    env: process.env.NODE_ENV ?? "development",
  },
};

const transport =
  process.env.NODE_ENV === "development" && !process.env.NEXT_RUNTIME
    ? pino.transport({
        target: "pino-pretty",
        options: { colorize: true, singleLine: true, translateTime: "HH:MM:ss" },
      })
    : undefined;

export const logger = transport ? pino(baseConfig, transport) : pino(baseConfig);

/**
 * Child logger with bound context (org_id, request_id, etc).
 * Always prefer this over the root logger inside request handlers.
 */
export function withContext(ctx: Record<string, unknown>): pino.Logger {
  return logger.child(ctx);
}

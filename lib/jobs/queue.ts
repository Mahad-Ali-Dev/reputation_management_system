/**
 * Job queue wrapper around Upstash QStash.
 *
 * QStash is HTTP-based: you POST a job, QStash sends it back to your worker
 * URL at the scheduled time with at-least-once delivery + automatic retries.
 *
 * Why QStash over Inngest:
 *   - Already in `package.json` (`@upstash/qstash`).
 *   - Pricing is per-message ($1/100k), no per-month base.
 *   - Vercel-native: workers are just Next.js API routes.
 *
 * Pattern:
 *   1. Call `enqueueJob({ topic, payload, delaySeconds })` from any code path
 *      that wants to defer work.
 *   2. QStash hits `/api/jobs/[topic]` at the scheduled time.
 *   3. The handler verifies the signature, parses the payload, executes the job.
 *
 * Idempotency: every job includes a `jobId` (UUID) in payload. Handlers must
 * upsert their effects keyed on jobId so retries don't double-apply.
 */

import { Client, Receiver } from "@upstash/qstash";
import { randomUUID } from "node:crypto";

let _client: Client | null = null;
function getClient(): Client {
  if (_client) return _client;
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    throw new Error("QSTASH_TOKEN not set. Get one at https://console.upstash.com/qstash");
  }
  _client = new Client({ token });
  return _client;
}

let _receiver: Receiver | null = null;
function getReceiver(): Receiver {
  if (_receiver) return _receiver;
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentKey || !nextKey) {
    throw new Error("QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY not set");
  }
  _receiver = new Receiver({
    currentSigningKey: currentKey,
    nextSigningKey: nextKey,
  });
  return _receiver;
}

export type JobTopic =
  | "review-sync"           // pull reviews from one establishment's GBP
  | "outreach-dispatch"     // send one queued review request
  | "topic-extract"         // run topic extraction for one review
  | "social-post"           // publish one social post to its platforms
  | "digest-org"            // build + send digest for one org
  | "autopilot-digest-org"  // build + send the weekly Autopilot digest for one org
  | "url-crawl"             // crawl + index one URL into chatbot KB
  | "chat-automation-tick"; // run automation rules for active widget visitors

export type JobPayload = Record<string, unknown> & { jobId: string };

/**
 * Enqueue a job to be processed asynchronously by `/api/jobs/[topic]/route.ts`.
 */
export async function enqueueJob(args: {
  topic: JobTopic;
  payload: Omit<JobPayload, "jobId">;
  delaySeconds?: number;
  /** For deduplication — if you pass a stable key, QStash won't enqueue twice */
  deduplicationId?: string;
}): Promise<{ messageId: string; jobId: string }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL not set");

  const jobId = randomUUID();
  const fullPayload: JobPayload = { ...args.payload, jobId };

  const result = await getClient().publishJSON({
    url: `${appUrl}/api/jobs/${args.topic}`,
    body: fullPayload,
    delay: args.delaySeconds,
    deduplicationId: args.deduplicationId,
    retries: 3,
  });

  return { messageId: result.messageId, jobId };
}

/**
 * Worker-side: verify the QStash signature on an incoming request.
 *
 * Use in every `/api/jobs/[topic]/route.ts` before parsing the payload:
 *
 *   const body = await req.text();
 *   const signature = req.headers.get("upstash-signature") ?? "";
 *   const valid = await verifyQStashSignature({ body, signature, url: req.url });
 *   if (!valid) return new Response("invalid signature", { status: 401 });
 *   const payload = JSON.parse(body);
 */
export async function verifyQStashSignature(args: {
  body: string;
  signature: string;
  url: string;
}): Promise<boolean> {
  try {
    return await getReceiver().verify({
      body: args.body,
      signature: args.signature,
      url: args.url,
    });
  } catch {
    return false;
  }
}

/**
 * Convenience: throw on invalid signature. Use at the top of every job handler.
 */
export async function assertQStashSignature(req: Request): Promise<JobPayload> {
  const body = await req.text();
  const signature = req.headers.get("upstash-signature") ?? "";
  const valid = await verifyQStashSignature({ body, signature, url: req.url });
  if (!valid) throw new Error("invalid_qstash_signature");
  return JSON.parse(body) as JobPayload;
}

/**
 * Dev escape hatch: when QStash isn't configured, run the handler inline.
 * Useful for local dev where you don't want to point qstash.dev at localhost.
 */
export function isQStashConfigured(): boolean {
  return !!process.env.QSTASH_TOKEN;
}

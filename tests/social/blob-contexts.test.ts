import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Upload contexts (Module 10, Wave 3d) — the two new contexts added to
 * `lib/uploads/blob.ts`.
 *
 *  - `content_library`: 50 MB cap, image + video allowed.
 *  - `ai_creative`: 10 MB cap, image only (rejects video + >10 MB).
 *  - dev fallback (no BLOB token) → `uploadToBlob` returns a `data:` URL so the
 *    UI works locally.
 *
 * Pure functions — no mocks needed beyond clearing the blob token env.
 */

import { isUploadAllowed, uploadToBlob } from "@/lib/uploads/blob";

const MB = 1024 * 1024;
let savedToken: string | undefined;

beforeEach(() => {
  savedToken = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
});
afterEach(() => {
  if (savedToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = savedToken;
});

describe("content_library context", () => {
  it("accepts a 40 MB image", () => {
    expect(isUploadAllowed({ context: "content_library", mimeType: "image/png", sizeBytes: 40 * MB }).ok).toBe(true);
  });
  it("accepts an mp4 video", () => {
    expect(isUploadAllowed({ context: "content_library", mimeType: "video/mp4", sizeBytes: 10 * MB }).ok).toBe(true);
  });
  it("rejects > 50 MB", () => {
    const res = isUploadAllowed({ context: "content_library", mimeType: "image/png", sizeBytes: 60 * MB });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/file_too_large/);
  });
});

describe("ai_creative context", () => {
  it("accepts a small png", () => {
    expect(isUploadAllowed({ context: "ai_creative", mimeType: "image/png", sizeBytes: 2 * MB }).ok).toBe(true);
  });
  it("rejects > 10 MB", () => {
    const res = isUploadAllowed({ context: "ai_creative", mimeType: "image/png", sizeBytes: 11 * MB });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/file_too_large/);
  });
  it("rejects video (image only)", () => {
    const res = isUploadAllowed({ context: "ai_creative", mimeType: "video/mp4", sizeBytes: 1 * MB });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/mime_type_not_allowed/);
  });
});

describe("dev fallback (no Blob token)", () => {
  it("uploadToBlob returns a data: URL for content_library", async () => {
    const buffer = Buffer.from("hello");
    const res = await uploadToBlob({
      orgId: "11111111-1111-4111-8111-111111111111",
      context: "content_library",
      buffer,
      mimeType: "image/png",
      filename: "x.png",
    });
    expect(res.url.startsWith("data:image/png;base64,")).toBe(true);
    expect(res.pathname).toMatch(/^dev-fallback\//);
  });

  it("uploadToBlob returns a data: URL for ai_creative", async () => {
    const buffer = Buffer.from("img");
    const res = await uploadToBlob({
      orgId: "11111111-1111-4111-8111-111111111111",
      context: "ai_creative",
      buffer,
      mimeType: "image/png",
      filename: "creative.png",
    });
    expect(res.url.startsWith("data:image/png;base64,")).toBe(true);
  });
});

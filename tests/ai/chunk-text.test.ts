import { describe, expect, it } from "vitest";
import { chunkText } from "@/lib/ai/ingest";

/**
 * chunkText (ingest v2): header-aware sectioning across ALL markdown levels,
 * sentence-aware sliding window with snapped overlap, and empty handling.
 */
describe("chunkText", () => {
  it("returns no chunks for empty / whitespace content", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  \t ")).toEqual([]);
  });

  it("keeps a short single-section doc as one chunk", () => {
    const chunks = chunkText("We are a small bakery in Springfield. Open daily.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.position).toBe(0);
    expect(chunks[0]?.metadata.section).toBeUndefined();
  });

  it("splits on every heading level (#, ##, ###) into titled sections", () => {
    const doc = [
      "# Acme Dental",
      "Welcome to the practice.",
      "## Services",
      "Cleanings and whitening.",
      "### Pricing",
      "Cleaning is $90.",
    ].join("\n");
    const chunks = chunkText(doc);
    // Three headings → three titled sections.
    const sections = chunks.map((c) => c.metadata.section);
    expect(sections).toContain("Acme Dental");
    expect(sections).toContain("Services");
    expect(sections).toContain("Pricing");
    // The heading words stay in the embedded text (retrieval signal).
    const pricing = chunks.find((c) => c.metadata.section === "Pricing");
    expect(pricing?.text).toContain("Cleaning is $90.");
  });

  it("captures intro text that precedes the first heading", () => {
    const doc = ["Intro copy before any header.", "## Hours", "Mon-Fri 9-5."].join("\n");
    const chunks = chunkText(doc);
    expect(chunks[0]?.text).toContain("Intro copy before any header.");
    expect(chunks[0]?.metadata.section).toBeUndefined();
  });

  it("sliding-windows an over-long section with forward progress + overlap", () => {
    // ~2.6k chars of sentences under one heading → multiple overlapping chunks.
    const sentence = "Our team handles every kind of repair with great care. ";
    const body = sentence.repeat(50);
    const chunks = chunkText(`## Repairs\n${body}`);
    expect(chunks.length).toBeGreaterThan(1);
    // Positions are strictly increasing (no infinite loop, no dupes).
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.position).toBe(chunks[i - 1]!.position + 1);
    }
    // Every chunk inherits the section label.
    for (const c of chunks) expect(c.metadata.section).toBe("Repairs");
    // No chunk starts mid-word (overlap snaps to a boundary).
    for (const c of chunks) expect(/^\S/.test(c.text)).toBe(true);
  });
});

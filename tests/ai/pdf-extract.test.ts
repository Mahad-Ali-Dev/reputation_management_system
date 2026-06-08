import { describe, expect, it } from "vitest";
import { extractPdfText } from "@/lib/ai/pdf-extract";

/**
 * extractPdfText: returns extracted text for a simple uncompressed-stream PDF,
 * and "" for non-PDF / unextractable input (caller treats "" as "no usable
 * text"). The optional `unpdf` dep isn't installed in CI, so these exercise the
 * in-house naive fallback path.
 */

/** Build a minimal PDF whose content stream shows a literal via `Tj`. */
function makePdf(text: string): Buffer {
  // Repeat so the extracted text clears the 20-char minimum.
  const shown = `(${text}) Tj (${text}) Tj (${text}) Tj`;
  const body = `%PDF-1.4
1 0 obj<< /Type /Catalog >>endobj
2 0 obj<< /Length ${shown.length + 20} >>
stream
BT /F1 12 Tf 72 720 Td ${shown} ET
endstream
endobj
trailer<< /Root 1 0 R >>
%%EOF`;
  return Buffer.from(body, "latin1");
}

describe("extractPdfText", () => {
  it("extracts text from a simple uncompressed PDF stream", async () => {
    const buf = makePdf("Hello world from PDF");
    const text = await extractPdfText(buf);
    expect(text).toContain("Hello world from PDF");
  });

  it("returns '' for non-PDF input", async () => {
    expect(await extractPdfText(Buffer.from("just some plain text, not a pdf"))).toBe("");
  });

  it("returns '' for an empty buffer", async () => {
    expect(await extractPdfText(Buffer.alloc(0))).toBe("");
  });

  it("returns '' for a PDF with no extractable text (image-only)", async () => {
    const buf = Buffer.from("%PDF-1.4\n1 0 obj<< /Type /XObject /Subtype /Image >>endobj\n%%EOF", "latin1");
    expect(await extractPdfText(buf)).toBe("");
  });
});

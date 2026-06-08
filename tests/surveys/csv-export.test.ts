import { describe, expect, it } from "vitest";
import { formatCsv, neutralizeCell } from "@/lib/surveys/export";

/**
 * CSV export must be RFC-4180 correct AND defend against CSV injection
 * (build-plan §Risks). Pure `formatCsv` / `neutralizeCell` — no DB, no download.
 */
describe("neutralizeCell (CSV injection defense)", () => {
  it("prefixes formula-trigger leading chars with a single quote", () => {
    expect(neutralizeCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(neutralizeCell("+1")).toBe("'+1");
    expect(neutralizeCell("-1")).toBe("'-1");
    expect(neutralizeCell("@cmd")).toBe("'@cmd");
  });

  it("leaves benign text untouched", () => {
    expect(neutralizeCell("Great service!")).toBe("Great service!");
    expect(neutralizeCell("alex@example.com")).toBe("alex@example.com"); // @ not leading
  });
});

describe("formatCsv", () => {
  it("writes the header row first", () => {
    const csv = formatCsv(["A", "B"], []);
    expect(csv).toBe("A,B");
  });

  it("emits one line per row with CRLF separators", () => {
    const csv = formatCsv(["A", "B"], [["1", "2"], ["3", "4"]]);
    expect(csv).toBe("A,B\r\n1,2\r\n3,4");
    expect(csv.split("\r\n")).toHaveLength(3);
  });

  it("quotes fields containing commas", () => {
    const csv = formatCsv(["Comment"], [["fast, friendly, clean"]]);
    expect(csv).toBe('Comment\r\n"fast, friendly, clean"');
  });

  it("doubles embedded double-quotes and wraps the field", () => {
    const csv = formatCsv(["Comment"], [['He said "wow"']]);
    expect(csv).toBe('Comment\r\n"He said ""wow"""');
  });

  it("quotes fields containing newlines", () => {
    const csv = formatCsv(["Comment"], [["line one\nline two"]]);
    expect(csv).toBe('Comment\r\n"line one\nline two"');
  });

  it("renders null/undefined as empty cells", () => {
    const csv = formatCsv(["A", "B", "C"], [[null, undefined, "x"]]);
    expect(csv).toBe("A,B,C\r\n,,x");
  });

  it("renders numbers", () => {
    const csv = formatCsv(["NPS"], [[10], [0]]);
    expect(csv).toBe("NPS\r\n10\r\n0");
  });

  it("neutralizes a formula AND quotes when it also contains a comma", () => {
    const csv = formatCsv(["Comment"], [["=1+2, really"]]);
    // leading '=' neutralized → '=1+2, really ; then comma forces quoting
    expect(csv).toBe(`Comment\r\n"'=1+2, really"`);
  });
});

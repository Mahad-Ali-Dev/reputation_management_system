import { describe, expect, it } from "vitest";

/**
 * Inbox Automations — rule-builder pure-logic tests (Module 09).
 *
 * vitest runs node-only here, so we test the PURE form→columns mapping and the
 * input sanitizers — not React render. These live in `lib/chat/automation-shared`,
 * a client-safe module that only imports `zod` (the server actions that consume
 * them live in `lib/chat/automation-actions`), so no server-only stubs are needed.
 */

import {
  AI_BEHAVIOURS,
  normalizeAiBehaviour,
  parseRuleForm,
  sanitizeChannels,
} from "@/lib/chat/automation-shared";

/** Build a FormData from a plain spec; arrays append (e.g. channels). */
function fd(spec: Record<string, string | string[] | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(spec)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) for (const item of v) f.append(k, item);
    else f.set(k, v);
  }
  return f;
}

const baseValid = {
  name: "After-hours reply",
  channels: ["webchat", "facebook_msg"],
  trigger: "all",
  aiBehaviour: "kb_reply",
};

describe("sanitizeChannels", () => {
  it("keeps only canonical inbox channels, de-duped + order-stable", () => {
    const out = sanitizeChannels([
      "webchat",
      "facebook_msg",
      "webchat", // dup
      "bogus", // not a channel
      "  sms  ", // trimmed
      "",
    ]);
    expect(out).toEqual(["webchat", "facebook_msg", "sms"]);
  });

  it("drops everything when no valid channels are present", () => {
    expect(sanitizeChannels(["nope", 42 as unknown as string, null as unknown as string])).toEqual([]);
  });
});

describe("normalizeAiBehaviour", () => {
  it("passes through known behaviours", () => {
    for (const b of AI_BEHAVIOURS) expect(normalizeAiBehaviour(b)).toBe(b);
  });
  it("falls back to kb_reply for unknown/garbage", () => {
    expect(normalizeAiBehaviour("something_else")).toBe("kb_reply");
    expect(normalizeAiBehaviour(undefined)).toBe("kb_reply");
    expect(normalizeAiBehaviour(123)).toBe("kb_reply");
  });
});

describe("parseRuleForm", () => {
  it("parses a minimal valid 'all messages' + kb_reply rule", () => {
    const d = parseRuleForm(fd(baseValid));
    expect(d.id).toBeNull();
    expect(d.name).toBe("After-hours reply");
    expect(d.trigger).toBe("all");
    expect(d.triggerKeyword).toBeNull();
    expect(d.channels).toEqual(["webchat", "facebook_msg"]);
    expect(d.aiBehaviour).toBe("kb_reply");
    expect(d.fixedTemplate).toBeNull();
    expect(d.maxRepliesPerConversation).toBe(3); // default
    expect(d.escalateAfterTurns).toBe(0);
    expect(d.isActive).toBe(false); // checkbox not "on"
  });

  it("treats isActive=on as enabled", () => {
    expect(parseRuleForm(fd({ ...baseValid, isActive: "on" })).isActive).toBe(true);
    expect(parseRuleForm(fd({ ...baseValid, isActive: "true" })).isActive).toBe(true);
  });

  it("requires a name", () => {
    expect(() => parseRuleForm(fd({ ...baseValid, name: "   " }))).toThrow(/name/i);
  });

  it("requires at least one valid channel", () => {
    expect(() => parseRuleForm(fd({ ...baseValid, channels: ["bogus"] }))).toThrow(/channel/i);
    expect(() => parseRuleForm(fd({ ...baseValid, channels: [] }))).toThrow(/channel/i);
  });

  it("keyword trigger requires a keyword and keeps it", () => {
    expect(() =>
      parseRuleForm(fd({ ...baseValid, trigger: "keyword", triggerKeyword: "  " })),
    ).toThrow(/keyword/i);

    const d = parseRuleForm(fd({ ...baseValid, trigger: "keyword", triggerKeyword: "refund" }));
    expect(d.trigger).toBe("keyword");
    expect(d.triggerKeyword).toBe("refund");
  });

  it("nulls the keyword when trigger is 'all' even if one was submitted", () => {
    const d = parseRuleForm(fd({ ...baseValid, trigger: "all", triggerKeyword: "stale" }));
    expect(d.triggerKeyword).toBeNull();
  });

  it("fixed_template requires a template and keeps it", () => {
    expect(() =>
      parseRuleForm(fd({ ...baseValid, aiBehaviour: "fixed_template", fixedTemplate: "" })),
    ).toThrow(/template/i);

    const d = parseRuleForm(
      fd({ ...baseValid, aiBehaviour: "fixed_template", fixedTemplate: "Hi {{first_name}}!" }),
    );
    expect(d.aiBehaviour).toBe("fixed_template");
    expect(d.fixedTemplate).toBe("Hi {{first_name}}!");
  });

  it("nulls the template for non-fixed behaviours", () => {
    const d = parseRuleForm(
      fd({ ...baseValid, aiBehaviour: "kb_reply", fixedTemplate: "ignored" }),
    );
    expect(d.fixedTemplate).toBeNull();
  });

  it("keeps escalateAfterTurns only for kb_then_escalate", () => {
    const escalate = parseRuleForm(
      fd({ ...baseValid, aiBehaviour: "kb_then_escalate", escalateAfterTurns: "4" }),
    );
    expect(escalate.aiBehaviour).toBe("kb_then_escalate");
    expect(escalate.escalateAfterTurns).toBe(4);

    const other = parseRuleForm(fd({ ...baseValid, escalateAfterTurns: "9" }));
    expect(other.escalateAfterTurns).toBe(0); // zeroed for kb_reply
  });

  it("clamps the reply cap into [1,20] via zod", () => {
    expect(parseRuleForm(fd({ ...baseValid, maxRepliesPerConversation: "5" })).maxRepliesPerConversation).toBe(5);
    expect(() => parseRuleForm(fd({ ...baseValid, maxRepliesPerConversation: "0" }))).toThrow();
    expect(() => parseRuleForm(fd({ ...baseValid, maxRepliesPerConversation: "999" }))).toThrow();
  });

  it("preserves a valid edit id", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    expect(parseRuleForm(fd({ ...baseValid, id })).id).toBe(id);
  });
});

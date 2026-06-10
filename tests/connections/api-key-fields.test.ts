import { describe, expect, it } from "vitest";

/**
 * Pure field-spec + validation tests for the generic api_key connect form
 * (Module 14). `validateApiKeyFields` is the server-authoritative validator the
 * `connectApiKeyProvider` action relies on, so its mapping logic (trim, length,
 * pattern, externalId/token derivation) is unit-tested in isolation — no DB, no
 * server, no secrets.
 */

import {
  API_KEY_SPECS,
  defaultAccountLabel,
  getApiKeySpec,
  isApiKeyProvider,
  validateApiKeyFields,
} from "@/app/connections/_lib/api-key-fields";

describe("getApiKeySpec / isApiKeyProvider", () => {
  it("resolves known api_key providers", () => {
    expect(isApiKeyProvider("whatsapp")).toBe(true);
    expect(isApiKeyProvider("brevo")).toBe(true);
    expect(getApiKeySpec("activecampaign")?.displayName).toBe("ActiveCampaign");
  });

  it("returns null / false for non-api_key providers", () => {
    expect(getApiKeySpec("hubspot")).toBeNull();
    expect(isApiKeyProvider("google_business")).toBe(false);
  });

  it("every spec's externalIdField/tokenField reference real fields", () => {
    for (const spec of Object.values(API_KEY_SPECS) as import("@/app/connections/_lib/api-key-fields").ApiKeyProviderSpec[]) {
      const names = new Set(spec.fields.map((f) => f.name));
      const tokenField = spec.tokenField ?? "apiKey";
      expect(names.has(tokenField)).toBe(true);
      if (spec.externalIdField) expect(names.has(spec.externalIdField)).toBe(true);
    }
  });
});

describe("validateApiKeyFields — WhatsApp (two-field case)", () => {
  const spec = API_KEY_SPECS.whatsapp;

  it("accepts a valid phone number id + token and derives externalId/token", () => {
    const res = validateApiKeyFields(spec, {
      phoneNumberId: "  109876543210987 ",
      accessToken: "permanent-system-user-token-abcdef",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.externalId).toBe("109876543210987"); // trimmed
      expect(res.token).toBe("permanent-system-user-token-abcdef");
      expect(res.values.phoneNumberId).toBe("109876543210987");
    }
  });

  it("rejects a non-numeric phone number id (pattern)", () => {
    const res = validateApiKeyFields(spec, {
      phoneNumberId: "+1 555 0100",
      accessToken: "permanent-system-user-token-abcdef",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.field).toBe("phoneNumberId");
  });

  it("rejects a too-short token (minLength)", () => {
    const res = validateApiKeyFields(spec, {
      phoneNumberId: "109876543210987",
      accessToken: "short",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.field).toBe("accessToken");
  });

  it("rejects a missing required field", () => {
    const res = validateApiKeyFields(spec, { accessToken: "permanent-token-abcdefghij" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.field).toBe("phoneNumberId");
  });
});

describe("validateApiKeyFields — single-key providers", () => {
  it("accepts a valid key and has no externalId when the spec declares none", () => {
    const spec = API_KEY_SPECS.brevo;
    const res = validateApiKeyFields(spec, { apiKey: "  xkeysib-abcdef123456  " });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.externalId).toBeNull();
      expect(res.token).toBe("xkeysib-abcdef123456");
    }
  });

  it("rejects a too-short key", () => {
    const res = validateApiKeyFields(API_KEY_SPECS.brevo, { apiKey: "abc" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.field).toBe("apiKey");
  });
});

describe("validateApiKeyFields — ActiveCampaign (account id + key)", () => {
  const spec = API_KEY_SPECS.activecampaign;

  it("derives the account name as externalId and the key as the token", () => {
    const res = validateApiKeyFields(spec, {
      accountId: "youraccount",
      apiKey: "ac-key-abcdef123456",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.externalId).toBe("youraccount");
      expect(res.token).toBe("ac-key-abcdef123456");
    }
  });

  it("rejects a missing account name", () => {
    const res = validateApiKeyFields(spec, { apiKey: "ac-key-abcdef123456" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.field).toBe("accountId");
  });
});

describe("defaultAccountLabel", () => {
  it("includes the externalId when present", () => {
    expect(defaultAccountLabel(API_KEY_SPECS.whatsapp, "109876543210987")).toBe(
      "WhatsApp Business 109876543210987",
    );
  });
  it("falls back to the display name when there is no externalId", () => {
    expect(defaultAccountLabel(API_KEY_SPECS.brevo, null)).toBe("Brevo");
  });
});

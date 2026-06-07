import {
  addressLine,
  deriveCardState,
  relativeTime,
  shouldShowDevicePrompt,
  titleFromKind,
} from "@/app/establishments/_components/card-state";
import type { EstablishmentCardData } from "@/lib/establishments/queries";
import { describe, expect, it } from "vitest";

/**
 * Pure state-derivation tests for the My Establishments redesign.
 *
 * These pin down the two render states (empty vs connected) and the
 * device-prompt visibility rule WITHOUT touching Prisma — the page is a thin
 * shell over `deriveCardState`/`shouldShowDevicePrompt`, so the branch logic
 * lives here. Mirrors the repo's "test the pure core, not the network" style.
 */

const ORG_PLACE = "ChIJexampleplaceid123";

function row(overrides: Partial<EstablishmentCardData> = {}): EstablishmentCardData {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Summit Dental Studio",
    category: "Dental clinic",
    address: { line1: "12 King St", city: "Sydney", region: "NSW", postal: "2000" },
    phone: "+61 2 5550 1234",
    imageUrl: "https://cdn.example.com/photo.jpg",
    googlePlaceId: ORG_PLACE,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    connections: [],
    reviews: [],
    devices: [],
    ...overrides,
  };
}

describe("deriveCardState — connected detection", () => {
  it("is NOT connected when there are no connections", () => {
    const s = deriveCardState(row());
    expect(s.connected).toBe(false);
    expect(s.connectionId).toBeNull();
    expect(s.lastSyncedAt).toBeNull();
  });

  it("is connected when an active google_business connection exists", () => {
    const synced = new Date("2026-06-07T09:00:00Z");
    const s = deriveCardState(
      row({
        connections: [
          {
            id: "conn-1",
            provider: "google_business",
            status: "active",
            accountLabel: "Summit Dental",
            lastSyncedAt: synced,
          },
        ],
      }),
    );
    expect(s.connected).toBe(true);
    expect(s.connectionId).toBe("conn-1");
    expect(s.lastSyncedAt).toEqual(synced);
  });

  it("is NOT connected when the only google connection is revoked", () => {
    // Defense-in-depth: even if a revoked row leaks past the query filter,
    // the derivation must not count it as connected.
    const s = deriveCardState(
      row({
        connections: [
          {
            id: "conn-1",
            provider: "google_business",
            status: "revoked",
            accountLabel: null,
            lastSyncedAt: null,
          },
        ],
      }),
    );
    expect(s.connected).toBe(false);
  });

  it("does NOT treat a non-google active connection as Connected", () => {
    const s = deriveCardState(
      row({
        connections: [
          {
            id: "conn-meta",
            provider: "meta",
            status: "active",
            accountLabel: "FB Page",
            lastSyncedAt: new Date(),
          },
        ],
      }),
    );
    expect(s.connected).toBe(false);
  });
});

describe("deriveCardState — review aggregates", () => {
  it("reports zero reviews and null rating when there are none", () => {
    const s = deriveCardState(row({ reviews: [] }));
    expect(s.totalReviews).toBe(0);
    expect(s.avgRating).toBeNull();
  });

  it("counts reviews and averages the rating to 1dp", () => {
    const s = deriveCardState(row({ reviews: [{ rating: 5 }, { rating: 4 }, { rating: 5 }] }));
    expect(s.totalReviews).toBe(3);
    // (5+4+5)/3 = 4.666… → 4.7
    expect(s.avgRating).toBe(4.7);
  });

  it("handles an exact average without floating dust", () => {
    const s = deriveCardState(row({ reviews: [{ rating: 4 }, { rating: 4 }] }));
    expect(s.avgRating).toBe(4);
  });
});

describe("deriveCardState — identity normalization", () => {
  it("passes through name, phone, photo, and place id", () => {
    const s = deriveCardState(row());
    expect(s.name).toBe("Summit Dental Studio");
    expect(s.phone).toBe("+61 2 5550 1234");
    expect(s.imageUrl).toBe("https://cdn.example.com/photo.jpg");
    expect(s.googlePlaceId).toBe(ORG_PLACE);
  });

  it("composes the address line from the JSON blob", () => {
    expect(deriveCardState(row()).addressLine).toBe("12 King St, Sydney, NSW, 2000");
  });

  it("maps devices through to plain summaries", () => {
    const s = deriveCardState(
      row({
        devices: [
          {
            id: "dev-1",
            productKind: "qr",
            productSku: "qr-stand-acrylic",
            status: "active",
            scanCount: 42,
            lastScanAt: new Date("2026-06-06T00:00:00Z"),
          },
        ],
      }),
    );
    expect(s.devices).toHaveLength(1);
    const dev = s.devices[0];
    expect(dev).toBeDefined();
    expect(dev).toMatchObject({ id: "dev-1", scanCount: 42, status: "active" });
  });
});

describe("shouldShowDevicePrompt — banner vs linked-devices row", () => {
  it("shows the device prompt when there are zero linked devices", () => {
    expect(shouldShowDevicePrompt({ devices: { length: 0 } })).toBe(true);
  });

  it("hides the device prompt (shows the row instead) when a device is linked", () => {
    expect(shouldShowDevicePrompt({ devices: { length: 1 } })).toBe(false);
    expect(shouldShowDevicePrompt({ devices: { length: 3 } })).toBe(false);
  });
});

describe("addressLine", () => {
  it("returns an em-dash for null / non-object input", () => {
    expect(addressLine(null)).toBe("—");
    expect(addressLine(undefined)).toBe("—");
    expect(addressLine("not an object")).toBe("—");
    expect(addressLine({})).toBe("—");
  });

  it("tolerates the legacy street/postcode shape", () => {
    expect(addressLine({ street: "9 Bridge Rd", city: "Melbourne", postcode: "3000" })).toBe(
      "9 Bridge Rd, Melbourne, 3000",
    );
  });

  it("skips blank parts rather than emitting stray commas", () => {
    expect(addressLine({ line1: "", city: "Perth", region: "" })).toBe("Perth");
  });
});

describe("relativeTime", () => {
  it("returns an em-dash for null", () => {
    expect(relativeTime(null)).toBe("—");
  });

  it("formats minutes / hours / days ago", () => {
    const now = Date.now();
    expect(relativeTime(new Date(now - 5 * 60_000))).toBe("5m ago");
    expect(relativeTime(new Date(now - 3 * 3_600_000))).toBe("3h ago");
    expect(relativeTime(new Date(now - 2 * 86_400_000))).toBe("2d ago");
  });

  it("clamps just-now and future timestamps", () => {
    expect(relativeTime(new Date(Date.now() + 5_000))).toBe("just now");
    expect(relativeTime(new Date(Date.now() - 1_000))).toBe("just now");
  });
});

describe("titleFromKind — device labels", () => {
  it("names plaques, stands, cards, and nfc tags", () => {
    expect(titleFromKind({ productKind: "qr", productSku: "wall-plaque-brass" })).toBe("Wall Plaque");
    expect(titleFromKind({ productKind: "qr", productSku: "counter-stand" })).toBe("Counter Stand");
    expect(titleFromKind({ productKind: "qr", productSku: "counter-card" })).toBe("Counter Card");
    expect(titleFromKind({ productKind: "nfc", productSku: "tag-round" })).toBe("NFC Tag");
  });

  it("distinguishes a WiFi card from a review card", () => {
    expect(titleFromKind({ productKind: "wifi", productSku: "wifi-card" })).toBe("WiFi Card");
  });

  it("falls back to a generic label for unknown skus", () => {
    expect(titleFromKind({ productKind: "qr", productSku: "mystery-sku" })).toBe("QR Device");
  });
});

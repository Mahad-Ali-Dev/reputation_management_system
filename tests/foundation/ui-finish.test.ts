import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ui-finish sweep — source-level contract guards.
 *
 * ── Why source assertions, not React render ──
 * The vitest config (`vitest.config.ts`) runs `environment: "node"` — there is
 * NO DOM and NO CSS engine, and the task forbids changing it. The deliverables
 * in this sweep are (a) a CSS rule and (b) a handful of static relabels in
 * server-component JSX. Neither is reachable through a node unit test by
 * rendering. So we assert them at the source level: read the file text and
 * verify the exact contract is present. A regression (someone reverts the pill
 * rule, or flips a label back to "Listings") fails here.
 */

const ROOT = resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("TabBar active-pill — design-system.css contract", () => {
  const css = read("app/design-system.css");

  it("adds a `.tabbar .tabs__t.is-active` blue-tint pill rule", () => {
    // The active tab inside a TabBar must read as a blue-tint pill, NOT the
    // default ink underline. The selector is scoped to `.tabbar` so bare
    // `.tabs` usages elsewhere keep their underline style.
    expect(css).toMatch(/\.tabbar\s+\.tabs__t\.is-active\s*\{/);
  });

  it("fills with a Material tonal container (secondary-container, --pri-50 fallback)", () => {
    // Material You: the active TabBar pill fills with the M3 SECONDARY tonal
    // container (the sidebar nav-drawer item uses the PRIMARY container) — both
    // fall back to the legacy --pri-50 blue tint, so it stays on-brand if the
    // M3 tokens are ever absent.
    const block = css.match(/\.tabbar\s+\.tabs__t\.is-active\s*\{([^}]*)\}/);
    expect(block).not.toBeNull();
    const body = block?.[1] ?? "";
    expect(body).toMatch(/background:\s*var\(--m3-secondary-container,\s*var\(--pri-50\)\)/);
    expect(body).toMatch(/color:\s*var\(--m3-on-secondary-container/);
  });

  it("neutralizes the underline border + bottom margin inside `.tabbar`", () => {
    // Pill style must drop the `.tabs` underline affordances when scoped to the
    // TabBar so the active tab doesn't render BOTH a pill and an underline.
    const tStyle = css.match(/\.tabbar\s+\.tabs__t\s*\{([^}]*)\}/);
    expect(tStyle).not.toBeNull();
    const body = tStyle?.[1] ?? "";
    expect(body).toMatch(/border-radius:\s*var\(--r-sm\)/);
  });

  it("keeps the default (non-tabbar) `.tabs__t.is-active` underline rule intact", () => {
    // The bare underline rule must still exist for any future standalone `.tabs`
    // strip — we only ADDED a scoped override, we didn't remove the base.
    // (The premium palette pass recoloured the underline from --ink to the --pri
    // accent; the base rule is still present, which is what this guards.)
    expect(css).toMatch(
      /\.tabs__t\.is-active\s*\{[^}]*border-bottom-color:\s*var\(--pri\)/,
    );
  });
});

describe("Sidebar relabel — Listings → My Establishments", () => {
  const nav = read("components/sidebar-nav.tsx");

  it("labels the establishments item 'My Establishments'", () => {
    expect(nav).toContain('label: "My Establishments"');
  });

  it("keeps the href at /establishments (no route migration)", () => {
    expect(nav).toMatch(/href:\s*"\/establishments",\s*label:\s*"My Establishments"/);
  });

  it("no longer ships a nav item literally labeled 'Listings'", () => {
    expect(nav).not.toContain('label: "Listings"');
  });
});

describe("Add-business page relabel — Listings/Add listing → Establishments/Add New Business", () => {
  const page = read("app/establishments/new/page.tsx");

  it("titles the page 'Add New Business'", () => {
    expect(page).toContain('title="Add New Business"');
  });

  it("breadcrumbs through 'Establishments' (topbar crumbs)", () => {
    expect(page).toMatch(/crumbs=\{\[\s*"Workspace",\s*"Establishments"\s*\]\}/);
  });

  it("drops the old 'Add listing' / 'Listings' wording", () => {
    expect(page).not.toContain("Add listing");
    expect(page).not.toMatch(/label:\s*"Listings"/);
  });

  it("preserves the createEstablishment field names (form contract intact)", () => {
    for (const name of [
      "name",
      "category",
      "timezone",
      "address_line1",
      "address_city",
      "address_region",
      "address_postal",
      "address_country",
    ]) {
      expect(page).toContain(`name="${name}"`);
    }
  });
});

describe("Public pages stay shell-free + v3-toned", () => {
  it("the survey-response page does not pull in the dashboard app shell", () => {
    const s = read("app/s/[token]/page.tsx");
    expect(s).not.toContain("AppShellServer");
    // v3 cool-slate canvas token present in the standalone styles.
    expect(s).toContain("#f7f8fb");
  });

  it("the review-picker page stays self-contained (no app shell)", () => {
    const pick = read("app/r/pick/[slug]/page.tsx");
    expect(pick).not.toContain("AppShellServer");
    expect(pick).toContain("#f7f8fb");
  });

  it("the welcome page stays self-contained (no app shell)", () => {
    const welcome = read("app/r/welcome/[slug]/page.tsx");
    expect(welcome).not.toContain("AppShellServer");
    expect(welcome).toContain("#f7f8fb");
  });
});

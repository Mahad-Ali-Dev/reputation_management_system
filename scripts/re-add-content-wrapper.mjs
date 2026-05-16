#!/usr/bin/env node
/**
 * Fix: the duplicate-header-strip script accidentally ate the
 * `<div className="space-y-6">` wrapper that opens the content area.
 * Without it, the closing `</div>` before `</AppShellServer>` is orphaned.
 *
 * This script finds pages that have:
 *   - <PageHeader ... />
 *   - followed by content (no `<div className="space-y-6">`)
 *   - ending in `</div>\n    </AppShellServer>`
 *
 * And re-inserts `<div className="space-y-6">` right after PageHeader.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function findPages(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      findPages(full, results);
    } else if (entry.name === "page.tsx") {
      const content = fs.readFileSync(full, "utf8");
      if (content.includes("AppShellServer") && content.includes("PageHeader")) {
        results.push(full);
      }
    }
  }
  return results;
}

// Match a `<PageHeader ... />` closing tag (self-closing or with content) followed
// by whitespace and then a non-wrapper element (not `<div className="space-y-6">`).
const HEADER_CLOSE_RE = /(<PageHeader[\s\S]*?\/>\s*)/;

let touched = 0;
let skipped = 0;

const files = findPages(path.join(ROOT, "app"));
console.log(`Checking ${files.length} pages\n`);

for (const file of files) {
  const rel = path.relative(ROOT, file);
  let content = fs.readFileSync(file, "utf8");

  // Skip if it already has the wrapper after PageHeader
  if (/\<PageHeader[\s\S]*?\/>\s*<div className="space-y-6">/.test(content)) {
    skipped++;
    console.log(`  - already has wrapper: ${rel}`);
    continue;
  }

  // Skip if there's no `</div>\s*</AppShellServer>` close (page doesn't need the wrapper)
  if (!/<\/div>\s*<\/AppShellServer>/.test(content)) {
    skipped++;
    console.log(`  - no orphan </div>: ${rel}`);
    continue;
  }

  // Insert wrapper right after PageHeader's closing />
  if (!HEADER_CLOSE_RE.test(content)) {
    skipped++;
    console.log(`  - PageHeader close not matched: ${rel}`);
    continue;
  }

  content = content.replace(HEADER_CLOSE_RE, `$1\n      <div className="space-y-6">\n`);

  fs.writeFileSync(file, content);
  touched++;
  console.log(`  ✓ wrapper restored: ${rel}`);
}

console.log(`\n${touched} fixed · ${skipped} skipped`);

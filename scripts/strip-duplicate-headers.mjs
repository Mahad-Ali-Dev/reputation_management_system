#!/usr/bin/env node
/**
 * Strip the inline `<div><h1>...</h1>...</div>` block that follows
 * `<PageHeader />` on the 38 refactored pages.
 *
 * The block looks like:
 *   <div>
 *     <h1 className="text-3xl font-bold tracking-tight">Title</h1>
 *     <p className="text-muted-foreground">Description</p>
 *   </div>
 *
 * Pattern: appears right after `<div className="space-y-6">` (where the
 * AppShell wrapper opens) and is now redundant because PageHeader renders
 * its own h1.
 *
 * Idempotent: re-running has no effect.
 */

import fs from "node:fs";
import path from "node:path";
import { globSync } from "node:fs";

const ROOT = process.cwd();

// Find every page.tsx that uses PageHeader
function findPages(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // skip node_modules etc.
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      findPages(full, results);
    } else if (entry.name === "page.tsx") {
      const content = fs.readFileSync(full, "utf8");
      if (content.includes("PageHeader") && content.includes("AppShellServer")) {
        results.push(full);
      }
    }
  }
  return results;
}

// Match the `<div>...<h1 className="text-3xl ...">...</h1>...<p className="text-muted-foreground">...</p>...</div>` block.
// Various flavors exist — some have a status badge after the title block, some have only h1+p.
const DUPLICATE_DIV_RE =
  /\s*<div(?:\s+className="[^"]*")?>(?:\s*<div[^>]*>)?\s*<h1 className="text-3xl font-bold tracking-tight">[^<]*<\/h1>\s*<p className="text-muted-foreground">[\s\S]*?<\/p>(?:\s*<\/div>)?\s*<\/div>/m;

let touched = 0;
let skipped = 0;

const files = findPages(path.join(ROOT, "app"));
console.log(`Found ${files.length} pages to check\n`);

for (const file of files) {
  const rel = path.relative(ROOT, file);
  let content = fs.readFileSync(file, "utf8");

  if (!DUPLICATE_DIV_RE.test(content)) {
    console.log(`  - no duplicate found in ${rel}`);
    skipped++;
    continue;
  }

  // Remove the duplicate block
  const before = content.length;
  content = content.replace(DUPLICATE_DIV_RE, "");
  const after = content.length;

  fs.writeFileSync(file, content);
  console.log(`  ✓ stripped ${before - after} chars from ${rel}`);
  touched++;
}

console.log(`\n${touched} stripped · ${skipped} skipped (no duplicate found)`);

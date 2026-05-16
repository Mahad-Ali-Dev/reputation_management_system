#!/usr/bin/env node
/**
 * Wrap every `<table className="w-full text-sm">` in a `<div className="overflow-x-auto">`
 * so it scrolls horizontally on mobile instead of overflowing the viewport.
 *
 * Idempotent: skips tables already inside an overflow wrapper.
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
    } else if (/\.(tsx|jsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

const TABLE_RE = /(<table className="w-full[^"]*"[^>]*>)([\s\S]*?)(<\/table>)/g;

let touched = 0;
let tablesWrapped = 0;

const files = findPages(path.join(ROOT, "app"));
console.log(`Checking ${files.length} files\n`);

for (const file of files) {
  const rel = path.relative(ROOT, file);
  let content = fs.readFileSync(file, "utf8");
  let dirty = false;

  content = content.replace(TABLE_RE, (match, open, inner, close, offset) => {
    // Skip if already wrapped
    const lookback = content.slice(Math.max(0, offset - 100), offset);
    if (/<div\s+className="[^"]*overflow-x-auto[^"]*"[^>]*>\s*$/.test(lookback)) {
      return match;
    }
    tablesWrapped++;
    dirty = true;
    return `<div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">\n          ${open}${inner}${close}\n        </div>`;
  });

  if (dirty) {
    fs.writeFileSync(file, content);
    touched++;
    console.log(`  ✓ wrapped tables in ${rel}`);
  }
}

console.log(`\n${touched} files updated · ${tablesWrapped} tables wrapped`);

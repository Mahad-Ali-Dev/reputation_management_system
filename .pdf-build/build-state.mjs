/**
 * One-shot PDF builder for the "State of Repulabs" snapshot.
 *
 * Output: ./Repulabs_State_2026-05-15.pdf at repo root.
 *
 * Bundles:
 *   1. STATE_OF_REPULABS.md  — implementation inventory, architecture, verification
 *   2. API.md                — full API reference
 *   3. DEPLOY_HOSTINGER.md   — production runbook
 *   4. SHIP_CHECKLIST.md     — pre-deploy gate
 *
 * Run from this directory:
 *   node build-state.mjs
 */

import hljs from "highlight.js";
import { Marked } from "marked";
import { gfmHeadingId } from "marked-gfm-heading-id";
import { markedHighlight } from "marked-highlight";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const today = new Date().toISOString().split("T")[0];
const OUTPUT = resolve(ROOT, `Repulabs_State_${today}.pdf`);

// Embed the real brand logo as a base64 data URI so the PDF is fully
// self-contained — no external file://, no broken cover image.
const logoPath = resolve(ROOT, "public/repulabs-logo.png");
const logoBase64 = readFileSync(logoPath).toString("base64");
const logoDataUri = `data:image/png;base64,${logoBase64}`;

const sections = [
  {
    file: "docs/STATE_OF_REPULABS.md",
    title: "State of Repulabs",
    subtitle: "What's built · what works · how it's wired",
  },
  {
    file: "docs/API.md",
    title: "API Reference",
    subtitle: "Every endpoint, auth scheme, rate limit, error code",
  },
  {
    file: "docs/DEPLOY_HOSTINGER.md",
    title: "Deploy Runbook",
    subtitle: "End-to-end Hostinger VPS deployment",
  },
  {
    file: "docs/SHIP_CHECKLIST.md",
    title: "Ship Checklist",
    subtitle: "Pre-deploy gate to run before every production push",
  },
];

// ---------------- markdown setup ----------------
const marked = new Marked(
  gfmHeadingId({ prefix: "h-" }),
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      if (lang === "mermaid") return code;
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    },
  }),
);
marked.use({ gfm: true, breaks: false });

const renderer = new marked.Renderer();
const origCode = renderer.code.bind(renderer);
renderer.code = function (token) {
  const lang = token.lang || "";
  if (lang === "mermaid") {
    const txt = token.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<pre class="mermaid">${txt}</pre>\n`;
  }
  return origCode(token);
};
marked.use({ renderer });

// Demote all heading levels by one so the injected section H1 stays the only top-level.
function bumpHeadings(md) {
  return md
    .replace(/^(#{1,5}) /gm, (m, hashes) => "#".repeat(hashes.length + 1) + " ")
    .replace(/^# /gm, "## ");
}

// ---------------- combine ----------------
let combined = "";
let sectionIdx = 1;
const tocItems = [];

for (const section of sections) {
  const path = resolve(ROOT, section.file);
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch (e) {
    console.error(`✗ Cannot read ${path}`);
    process.exit(1);
  }

  // Strip leading H1 — we inject our own section title
  content = content.replace(/^#\s+.*$/m, "").trimStart();
  content = bumpHeadings(content);

  const sectionId = `section-${sectionIdx}`;
  tocItems.push({ id: sectionId, title: section.title, subtitle: section.subtitle, idx: sectionIdx });

  combined += `\n<div class="page-break"></div>\n\n`;
  combined += `<header class="section-header">\n`;
  combined += `<div class="section-num-large">${String(sectionIdx).padStart(2, "0")}</div>\n`;
  combined += `<h1 id="${sectionId}" class="section-title">${section.title}</h1>\n`;
  combined += `<p class="section-sub">${section.subtitle}</p>\n`;
  combined += `</header>\n\n`;
  combined += content;
  combined += "\n\n";
  sectionIdx++;
}

const bodyHTML = marked.parse(combined);

// ---------------- TOC ----------------
const tocHTML = `
<div class="page-break"></div>
<section id="toc">
  <div class="toc-eyebrow">Contents</div>
  <h1 class="toc-h">In this document</h1>
  <ol class="toc-list">
    ${tocItems
      .map(
        (t) => `<li>
        <a href="#${t.id}">
          <span class="toc-num">${String(t.idx).padStart(2, "0")}</span>
          <span class="toc-body">
            <span class="toc-title">${t.title}</span>
            <span class="toc-subtitle">${t.subtitle}</span>
          </span>
        </a>
      </li>`,
      )
      .join("\n    ")}
  </ol>
</section>
`;

// ---------------- cover ----------------
const coverHTML = `
<section id="cover">
  <div class="cover-grid">
    <div class="cover-eyebrow">System Snapshot</div>
    <div class="cover-mark">
      <img class="cover-logo" src="${logoDataUri}" alt="Repulabs" />
    </div>
    <h1 class="cover-title">Repulabs</h1>
    <div class="cover-sub">Reputation OS for local business · multi-tenant SaaS</div>
    <div class="cover-pill">What's implemented · what works · how it's wired · how to ship</div>
    <div class="cover-meta">
      <div><strong>Snapshot</strong><span>${today}</span></div>
      <div><strong>Build</strong><span>Production-ready</span></div>
      <div><strong>Deploy target</strong><span>Hostinger VPS</span></div>
      <div><strong>Lines of code</strong><span>40,558 TS/TSX</span></div>
    </div>
    <div class="cover-stats">
      <div class="cover-stat"><span class="cover-stat-n">64</span><span class="cover-stat-l">Pages</span></div>
      <div class="cover-stat"><span class="cover-stat-n">37</span><span class="cover-stat-l">API routes</span></div>
      <div class="cover-stat"><span class="cover-stat-n">62</span><span class="cover-stat-l">DB models</span></div>
      <div class="cover-stat"><span class="cover-stat-n">15</span><span class="cover-stat-l">Migrations</span></div>
    </div>
  </div>
</section>
`;

// ---------------- HTML shell ----------------
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Repulabs — State of the System (${today})</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/styles/github.min.css">
<style>
  :root {
    --ink: #0f172a;
    --ink-2: #334155;
    --muted: #64748b;
    --accent: #2563eb;
    --accent-2: #6366f1;
    --accent-soft: #eff6ff;
    --border: #e2e8f0;
    --border-soft: #f1f5f9;
    --code-bg: #f8fafc;
    --ok: #15803d;
    --warn: #a16207;
    --bad: #b91c1c;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif;
    color: var(--ink);
    font-size: 10.5pt;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }

  /* ---- cover ---- */
  #cover {
    height: 100vh;
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at 30% 20%, rgba(99,102,241,.35), transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(37,99,235,.40), transparent 55%),
      linear-gradient(140deg, #1e293b 0%, #0f172a 100%);
    color: #fff;
    page-break-after: always;
    position: relative;
    overflow: hidden;
  }
  .cover-grid {
    text-align: center;
    padding: 0 60px;
    max-width: 720px;
  }
  .cover-eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.28em;
    font-size: 9pt;
    opacity: 0.65;
    margin-bottom: 28px;
    font-weight: 600;
  }
  .cover-mark {
    width: 104px;
    height: 104px;
    margin: 0 auto 22px;
    background: #ffffff;
    border-radius: 24px;
    display: grid;
    place-items: center;
    box-shadow:
      0 30px 80px -20px rgba(99,102,241,.55),
      0 0 0 1px rgba(255,255,255,.10);
    padding: 8px;
  }
  .cover-logo {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  .cover-title {
    font-size: 76pt;
    font-weight: 800;
    margin: 0;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .cover-sub {
    font-size: 14pt;
    opacity: 0.85;
    margin-top: 14px;
    font-weight: 300;
  }
  .cover-pill {
    display: inline-block;
    padding: 9px 20px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(255, 255, 255, 0.20);
    font-size: 10pt;
    margin-top: 28px;
    backdrop-filter: blur(6px);
  }
  .cover-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 18px;
    margin: 56px auto 0;
    max-width: 600px;
  }
  .cover-stat {
    background: rgba(255,255,255,.06);
    border: 1px solid rgba(255,255,255,.10);
    border-radius: 14px;
    padding: 18px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .cover-stat-n {
    font-size: 28pt;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #fff;
  }
  .cover-stat-l {
    font-size: 8.5pt;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.6;
    font-weight: 600;
  }
  .cover-meta {
    display: grid;
    grid-template-columns: repeat(4, auto);
    gap: 28px;
    justify-content: center;
    margin-top: 40px;
    font-size: 9pt;
  }
  .cover-meta > div { display: flex; flex-direction: column; gap: 4px; }
  .cover-meta strong {
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 7.5pt;
    opacity: 0.55;
    font-weight: 700;
  }
  .cover-meta span { font-size: 10pt; font-weight: 500; opacity: 0.92; }

  /* ---- TOC ---- */
  #toc { padding: 64px 64px 40px; }
  .toc-eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--accent);
    font-weight: 700;
    font-size: 9.5pt;
    margin-bottom: 6px;
  }
  .toc-h {
    font-size: 30pt;
    font-weight: 800;
    margin: 0 0 40px;
    letter-spacing: -0.025em;
    color: var(--ink);
  }
  .toc-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .toc-list li { margin: 0; }
  .toc-list a {
    display: flex;
    align-items: center;
    text-decoration: none;
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 16px 20px;
    gap: 18px;
  }
  .toc-num {
    color: var(--accent);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    font-size: 16pt;
    width: 36px;
    flex-shrink: 0;
  }
  .toc-body { display: flex; flex-direction: column; gap: 2px; flex: 1; }
  .toc-title { font-size: 13pt; font-weight: 700; color: var(--ink); }
  .toc-subtitle { font-size: 10pt; color: var(--muted); font-weight: 400; }

  /* ---- section header ---- */
  .section-header {
    display: flex;
    flex-direction: column;
    margin: 0 0 32px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--border);
    position: relative;
  }
  .section-num-large {
    font-family: "SF Mono", "Roboto Mono", Consolas, monospace;
    color: var(--accent);
    font-size: 12pt;
    font-weight: 700;
    background: var(--accent-soft);
    padding: 4px 12px;
    border-radius: 8px;
    width: fit-content;
    margin-bottom: 14px;
    letter-spacing: 0.04em;
  }
  h1.section-title {
    font-size: 32pt;
    font-weight: 800;
    letter-spacing: -0.025em;
    margin: 0;
    line-height: 1.05;
    color: var(--ink);
  }
  .section-sub {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 12pt;
    font-weight: 400;
    letter-spacing: -0.005em;
  }

  /* ---- general content ---- */
  main { padding: 56px 56px 40px; }
  h2 {
    font-size: 16pt;
    margin: 32px 0 12px;
    padding-top: 4px;
    color: var(--ink);
    font-weight: 700;
    letter-spacing: -0.015em;
  }
  h3 {
    font-size: 12.5pt;
    margin: 22px 0 8px;
    font-weight: 700;
    color: var(--ink);
  }
  h4 {
    font-size: 10pt;
    margin: 18px 0 6px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  p { margin: 0 0 10px; }
  a { color: var(--accent); text-decoration: none; }
  strong { font-weight: 600; color: var(--ink); }

  ul, ol { margin: 0 0 12px; padding-left: 22px; }
  li { margin-bottom: 4px; }

  blockquote {
    border-left: 3px solid var(--accent);
    background: var(--accent-soft);
    margin: 14px 0;
    padding: 10px 16px;
    color: var(--ink-2);
    border-radius: 0 8px 8px 0;
  }
  blockquote p:last-child { margin-bottom: 0; }

  hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 26px 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0 18px;
    font-size: 9pt;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid var(--border);
    padding: 7px 10px;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: var(--accent-soft);
    color: var(--ink);
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  tbody tr:nth-child(even) { background: var(--border-soft); }

  code {
    font-family: "SF Mono", "Roboto Mono", Consolas, monospace;
    background: var(--code-bg);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 8.8pt;
    border: 1px solid var(--border);
    color: #be185d;
  }
  pre {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 14px;
    overflow: visible;
    font-size: 8.5pt;
    line-height: 1.55;
    page-break-inside: avoid;
    margin: 10px 0 14px;
  }
  pre code {
    background: none;
    border: none;
    padding: 0;
    color: var(--ink);
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* mermaid */
  pre.mermaid {
    background: #ffffff;
    border: 1px solid var(--border);
    text-align: center;
    padding: 14px;
    page-break-inside: avoid;
  }
  pre.mermaid svg { max-width: 100%; height: auto; }

  /* page break helper */
  .page-break { page-break-before: always; }

  /* avoid orphan headings */
  h1, h2, h3, h4 { page-break-after: avoid; break-after: avoid-page; }
  table, pre, blockquote { page-break-inside: avoid; }

  /* print sizing */
  @page {
    size: A4;
    margin: 14mm 12mm 18mm 12mm;
  }
  @page :first { margin: 0; }
</style>
</head>
<body>
${coverHTML}
<main>
${tocHTML}
${bodyHTML}
</main>

<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
  mermaid.initialize({
    startOnLoad: false,
    theme: "default",
    flowchart: { useMaxWidth: true, htmlLabels: true, curve: "basis" },
    sequence: { useMaxWidth: true, mirrorActors: false },
    themeVariables: {
      primaryColor: "#eff6ff",
      primaryTextColor: "#0f172a",
      primaryBorderColor: "#2563eb",
      lineColor: "#2563eb",
      fontFamily: "Inter, -apple-system, sans-serif",
    },
  });
  await mermaid.run({ querySelector: "pre.mermaid" });
  window.__mermaidDone = true;
</script>
</body>
</html>`;

const htmlPath = resolve(__dirname, "combined-state.html");
writeFileSync(htmlPath, html, "utf8");
console.log(`✔ Wrote combined HTML (${(html.length / 1024).toFixed(0)} KB)`);

// ---------------- print ----------------
console.log("⚙ Launching headless Chromium…");
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const page = await browser.newPage();
await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, {
  waitUntil: "networkidle0",
  timeout: 120000,
});

await page
  .waitForFunction("window.__mermaidDone === true", { timeout: 60000 })
  .catch(() => {
    console.warn("⚠ mermaid render flag did not appear — continuing anyway");
  });

await new Promise((r) => setTimeout(r, 1500));

console.log("⚙ Printing PDF…");
await page.pdf({
  path: OUTPUT,
  format: "A4",
  printBackground: true,
  margin: { top: "14mm", right: "12mm", bottom: "18mm", left: "12mm" },
  displayHeaderFooter: true,
  headerTemplate: `<div></div>`,
  footerTemplate: `
    <div style="font-size:7.5pt; color:#64748b; width:100%; padding:0 12mm; display:flex; justify-content:space-between; font-family:-apple-system,Segoe UI,sans-serif;">
      <span>Repulabs · State of the System · ${today}</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`,
  preferCSSPageSize: false,
});

await browser.close();
console.log(`✔ PDF written → ${OUTPUT}`);

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import { gfmHeadingId } from "marked-gfm-heading-id";
import hljs from "highlight.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUTPUT = resolve(ROOT, "RepuBoost_PRD.pdf");

const sections = [
  { file: "README.md",                              title: "Overview" },
  { file: "docs/PRD.md",                            title: "Product Requirements" },
  { file: "docs/architecture/ARCHITECTURE.md",      title: "System Architecture" },
  { file: "docs/architecture/DATA_MODEL.md",        title: "Data Model" },
  { file: "docs/architecture/TECH_STACK.md",        title: "Tech Stack" },
  { file: "docs/architecture/INFRASTRUCTURE.md",    title: "Infrastructure & Security" },
  { file: "docs/architecture/AI_STRATEGY.md",       title: "AI Strategy" },
  { file: "docs/api/API_SURFACE.md",                title: "API Surface" },
  { file: "docs/BILLING_AND_HARDWARE.md",           title: "Billing & Hardware" },
  { file: "docs/SECURITY_AND_OPS_REVIEW.md",        title: "Security & Ops Review" },
  { file: "docs/SLOs.md",                           title: "Service Level Objectives" },
  { file: "docs/runbooks/INDEX.md",                 title: "Runbook Index" },
  { file: "docs/ROADMAP.md",                        title: "Delivery Roadmap (9-month)" },
  { file: "docs/NINE_DAY_PLAN.md",                  title: "9-Day Solo Founder Plan" },
];

// ---------------- markdown setup ----------------
const marked = new Marked(
  gfmHeadingId({ prefix: "h-" }),
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      if (lang === "mermaid") return code; // pass through
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    },
  }),
);
marked.use({ gfm: true, breaks: false });

// Custom renderer: mermaid fences -> <div class="mermaid"> blocks
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

// ---------------- combine sections ----------------
function bumpHeadings(md) {
  // shift ## -> ###, ### -> #### etc — leaving # for the section title we inject
  return md
    .replace(/^(#{1,5}) /gm, (m, hashes) => "#".repeat(hashes.length + 1) + " ")
    .replace(/^# /gm, "## "); // any top-level "# " becomes "## "
}

let combined = "";
let sectionIdx = 1;
const tocItems = [];
for (const section of sections) {
  const path = resolve(ROOT, section.file);
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch (e) {
    console.error(`Cannot read ${path}`);
    process.exit(1);
  }

  // Remove first H1 (we'll inject our own)
  content = content.replace(/^#\s+.*$/m, "").trimStart();
  // Demote remaining headings by one level so our injected H1 is the only top-level
  content = bumpHeadings(content);

  const sectionId = `section-${sectionIdx}`;
  tocItems.push({ id: sectionId, title: section.title, idx: sectionIdx });

  combined += `\n<div class="page-break"></div>\n\n`;
  combined += `<h1 id="${sectionId}" class="section-title"><span class="section-num">${String(sectionIdx).padStart(2, "0")}</span>${section.title}</h1>\n\n`;
  combined += content;
  combined += "\n\n";
  sectionIdx++;
}

const bodyHTML = marked.parse(combined);

// ---------------- TOC ----------------
const tocHTML = `
<div class="page-break"></div>
<section id="toc">
  <h1 class="section-title"><span class="section-num">00</span>Table of Contents</h1>
  <ol class="toc-list">
    ${tocItems
      .map(
        (t) =>
          `<li><a href="#${t.id}"><span class="toc-num">${String(t.idx).padStart(2, "0")}</span><span class="toc-title">${t.title}</span></a></li>`,
      )
      .join("\n    ")}
  </ol>
</section>
`;

// ---------------- cover ----------------
const today = new Date().toISOString().split("T")[0];
const coverHTML = `
<section id="cover">
  <div class="cover-wrap">
    <div class="cover-eyebrow">Product Requirements Document</div>
    <h1 class="cover-title">RepuBoost</h1>
    <div class="cover-sub">Multi-tenant Reputation Management SaaS</div>
    <div class="cover-pill">Hardware-software bundle · AI replies · Multi-location · Security-reviewed</div>
    <div class="cover-meta">
      <div><strong>Version</strong><span>0.3 (Production-Ready)</span></div>
      <div><strong>Date</strong><span>${today}</span></div>
      <div><strong>Status</strong><span>Approved for Architecture</span></div>
      <div><strong>Author</strong><span>Senior Architect</span></div>
    </div>
  </div>
</section>
`;

// ---------------- HTML shell ----------------
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>RepuBoost — PRD</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/styles/github.min.css">
<style>
  :root {
    --ink: #0f172a;
    --muted: #475569;
    --accent: #4f46e5;
    --accent-soft: #eef2ff;
    --border: #e2e8f0;
    --code-bg: #f8fafc;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif;
    color: var(--ink);
    font-size: 11pt;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }

  /* ---- cover ---- */
  #cover {
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #2563eb 100%);
    color: #fff;
    page-break-after: always;
  }
  .cover-wrap { text-align: center; padding: 0 60px; }
  .cover-eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.25em;
    font-size: 11pt;
    opacity: 0.8;
    margin-bottom: 24px;
    font-weight: 600;
  }
  .cover-title {
    font-size: 84pt;
    font-weight: 800;
    margin: 0;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .cover-sub {
    font-size: 20pt;
    opacity: 0.95;
    margin-top: 16px;
    font-weight: 400;
  }
  .cover-pill {
    display: inline-block;
    padding: 10px 20px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
    border: 1px solid rgba(255, 255, 255, 0.35);
    font-size: 11pt;
    margin-top: 36px;
    backdrop-filter: blur(6px);
  }
  .cover-meta {
    display: grid;
    grid-template-columns: repeat(4, auto);
    gap: 36px;
    justify-content: center;
    margin-top: 80px;
    font-size: 10pt;
  }
  .cover-meta > div { display: flex; flex-direction: column; gap: 6px; }
  .cover-meta strong {
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 8pt;
    opacity: 0.7;
    font-weight: 700;
  }
  .cover-meta span { font-size: 11pt; font-weight: 500; }

  /* ---- TOC ---- */
  #toc { padding: 60px 60px 40px; }
  .toc-list { list-style: none; padding: 0; margin: 32px 0 0; counter-reset: none; }
  .toc-list li { margin-bottom: 14px; }
  .toc-list a {
    display: flex;
    align-items: baseline;
    text-decoration: none;
    color: var(--ink);
    border-bottom: 1px dotted var(--border);
    padding-bottom: 10px;
  }
  .toc-num {
    color: var(--accent);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    margin-right: 16px;
    font-size: 11pt;
  }
  .toc-title { font-size: 13pt; font-weight: 500; }

  /* ---- general content ---- */
  main { padding: 60px 60px 40px; }
  h1.section-title {
    font-size: 32pt;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin: 0 0 36px;
    padding-bottom: 18px;
    border-bottom: 3px solid var(--accent);
    display: flex;
    align-items: baseline;
    gap: 16px;
    line-height: 1.1;
  }
  .section-num {
    font-family: "SF Mono", "Roboto Mono", Consolas, monospace;
    color: var(--accent);
    font-size: 18pt;
    font-weight: 700;
    background: var(--accent-soft);
    padding: 4px 12px;
    border-radius: 8px;
  }
  h2 {
    font-size: 18pt;
    margin: 32px 0 14px;
    padding-top: 8px;
    color: var(--ink);
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  h3 {
    font-size: 14pt;
    margin: 24px 0 10px;
    font-weight: 700;
    color: var(--ink);
  }
  h4 {
    font-size: 11.5pt;
    margin: 20px 0 8px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  p { margin: 0 0 12px; }
  a { color: var(--accent); text-decoration: none; }

  ul, ol { margin: 0 0 14px; padding-left: 22px; }
  li { margin-bottom: 4px; }

  blockquote {
    border-left: 4px solid var(--accent);
    background: var(--accent-soft);
    margin: 16px 0;
    padding: 12px 18px;
    color: var(--muted);
    border-radius: 0 8px 8px 0;
  }
  blockquote p:last-child { margin-bottom: 0; }

  hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 28px 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0 18px;
    font-size: 9.5pt;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid var(--border);
    padding: 8px 10px;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: var(--accent-soft);
    color: var(--ink);
    font-weight: 700;
  }
  tbody tr:nth-child(even) { background: #f8fafc; }

  code {
    font-family: "SF Mono", "Roboto Mono", Consolas, monospace;
    background: var(--code-bg);
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 9.5pt;
    border: 1px solid var(--border);
    color: #be185d;
  }
  pre {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    overflow: visible;
    font-size: 9pt;
    line-height: 1.5;
    page-break-inside: avoid;
    margin: 12px 0;
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
    padding: 16px;
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
    margin: 18mm 14mm 22mm 14mm;
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
      primaryColor: "#eef2ff",
      primaryTextColor: "#0f172a",
      primaryBorderColor: "#4f46e5",
      lineColor: "#4f46e5",
      fontFamily: "Inter, -apple-system, sans-serif",
    },
  });
  await mermaid.run({ querySelector: "pre.mermaid" });
  window.__mermaidDone = true;
</script>
</body>
</html>`;

const htmlPath = resolve(__dirname, "combined.html");
writeFileSync(htmlPath, html, "utf8");
console.log(`✔ Wrote combined HTML (${(html.length / 1024).toFixed(0)} KB)`);

// ---------------- print ----------------
console.log("⚙ Launching headless Chromium…");
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const page = await browser.newPage();
await page.goto("file:///" + htmlPath.replace(/\\/g, "/"), {
  waitUntil: "networkidle0",
  timeout: 120000,
});

// wait for mermaid to finish
await page.waitForFunction("window.__mermaidDone === true", { timeout: 60000 }).catch(() => {
  console.warn("⚠ mermaid render flag did not appear — continuing anyway");
});

// extra settle
await new Promise((r) => setTimeout(r, 1500));

console.log("⚙ Printing PDF…");
await page.pdf({
  path: OUTPUT,
  format: "A4",
  printBackground: true,
  margin: { top: "18mm", right: "14mm", bottom: "22mm", left: "14mm" },
  displayHeaderFooter: true,
  headerTemplate: `<div></div>`,
  footerTemplate: `
    <div style="font-size:8pt; color:#64748b; width:100%; padding:0 14mm; display:flex; justify-content:space-between; font-family:-apple-system,Segoe UI,sans-serif;">
      <span>RepuBoost · PRD v0.3 · ${today}</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`,
  preferCSSPageSize: false,
});

await browser.close();
console.log(`✔ PDF written → ${OUTPUT}`);

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outDir = join(root, "public", "assets", "repulabs", "design-mockups");
const illustrationsDir = join(root, "public", "assets", "repulabs", "illustrations");
const logoPath = join(root, "public", "repulabs-logo.png");

const runtimeNodeModules =
  process.env.CODEX_RUNTIME_NODE_MODULES ??
  "C:\\Users\\lastb\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";
const sharpPackageRoot = join(runtimeNodeModules, ".pnpm", "sharp@0.34.5", "node_modules");
const runtimeRequire = createRequire(join(sharpPackageRoot, "runtime-require.cjs"));
const sharp = runtimeRequire("sharp");

const screens = [
  {
    id: "dashboard",
    name: "Dashboard",
    nav: "Home",
    letter: "D",
    kicker: "Command center",
    title: "Visibility health for every location",
    desc: "A calm command center for ratings, response coverage, outreach, and AI work.",
    cta: "Finish setup",
    art: "dashboard-welcome.svg",
    value: "Connect the first location and Repulabs will build the daily visibility briefing.",
    steps: ["Connect Google Business Profile", "Import contacts", "Send the first review request"],
  },
  {
    id: "reviews",
    name: "Reviews",
    nav: "Reviews",
    letter: "R",
    kicker: "Reputation",
    title: "Reviews that are ready to act on",
    desc: "Triage new reviews, approve AI replies, and spot sentiment before it spreads.",
    cta: "Connect Google",
    art: "reviews-empty.svg",
    value: "Pull every new review into one feed with response guidance already drafted.",
    steps: ["Connect review sources", "Choose brand voice", "Approve the first AI reply"],
  },
  {
    id: "outreach",
    name: "Review Requests",
    nav: "Requests",
    letter: "O",
    kicker: "Outreach",
    title: "Send the right request at the right moment",
    desc: "Campaigns, templates, QR flows, and deliverability in one review request hub.",
    cta: "Create campaign",
    art: "requests-empty.svg",
    value: "Turn happy visits into public reviews without chasing customers manually.",
    steps: ["Add recipients", "Pick SMS or email", "Schedule a first campaign"],
  },
  {
    id: "ai-kb",
    name: "AI Knowledge Base",
    nav: "AI KB",
    letter: "K",
    kicker: "AI training",
    title: "Train AI on how the business actually works",
    desc: "Business facts, voice, pricing, and test prompts keep every response on-brand.",
    cta: "Start auto-setup",
    art: "kb-brain.png",
    value: "Give the assistant a trusted source of truth before it drafts replies.",
    steps: ["Import the website", "Confirm services and pricing", "Test a customer question"],
  },
  {
    id: "disputes",
    name: "Disputes",
    nav: "Disputes",
    letter: "X",
    kicker: "Protection",
    title: "Flag unfair reviews with stronger evidence",
    desc: "Package policy references, timelines, and AI-generated dispute arguments.",
    cta: "Review flagged items",
    art: "disputes-empty.svg",
    value: "When a review violates policy, build a focused dispute package in minutes.",
    steps: ["Connect sources", "Flag a review", "Review the AI argument"],
  },
  {
    id: "surveys",
    name: "Surveys",
    nav: "Surveys",
    letter: "S",
    kicker: "Feedback",
    title: "Collect private feedback before it becomes public",
    desc: "Route happy customers to reviews and unhappy customers to recovery workflows.",
    cta: "Create survey",
    art: "surveys-empty.svg",
    value: "Launch a simple NPS or CSAT flow and learn what customers need next.",
    steps: ["Choose a template", "Set smart routing", "Share the survey link"],
  },
  {
    id: "inbox",
    name: "Unified Inbox",
    nav: "Inbox",
    letter: "I",
    kicker: "Engage",
    title: "One inbox for every customer conversation",
    desc: "Facebook, Instagram, SMS, Google, and webchat threads with AI replies and context.",
    cta: "Connect channels",
    art: "messages-empty.svg",
    value: "Bring scattered messages into one queue your team can keep clean.",
    steps: ["Connect Meta and SMS", "Add webchat widget", "Create an automation rule"],
  },
  {
    id: "social",
    name: "Social",
    nav: "Social",
    letter: "P",
    kicker: "Publishing",
    title: "Plan social posts around proof",
    desc: "Compose, preview, schedule, and reuse AI-generated captions and creative ideas.",
    cta: "Create post",
    art: "social-empty.svg",
    value: "Turn reviews, promos, and local moments into a lightweight content calendar.",
    steps: ["Connect profiles", "Generate captions", "Schedule the first post"],
  },
  {
    id: "contacts",
    name: "Contacts",
    nav: "Contacts",
    letter: "C",
    kicker: "Customers",
    title: "Segments that make outreach feel personal",
    desc: "Profiles, tags, timelines, imports, exports, and review request eligibility.",
    cta: "Import contacts",
    art: "contacts-empty.svg",
    value: "Build a customer list that powers requests, surveys, and recovery workflows.",
    steps: ["Upload CSV", "Map fields", "Create a first segment"],
  },
  {
    id: "analytics",
    name: "Analytics",
    nav: "Analytics",
    letter: "A",
    kicker: "Intelligence",
    title: "Know what is moving reputation forward",
    desc: "Ratings, local rank, competitor movement, and weekly summaries executives can read.",
    cta: "Generate report",
    art: "insights-empty.svg",
    value: "Connect data sources and turn reputation movement into a weekly narrative.",
    steps: ["Set report range", "Add competitors", "Schedule delivery"],
  },
  {
    id: "autopilot",
    name: "Autopilot",
    nav: "Autopilot",
    letter: "B",
    kicker: "Automation",
    title: "Let safe loops handle repeat work",
    desc: "Auto-reply, auto-request, and auto-post with guardrails, approvals, and a ledger.",
    cta: "Enable autopilot",
    art: "autopilot-hero.png",
    value: "Start with guarded automations that save time without losing team control.",
    steps: ["Pick loops", "Set approval rules", "Review the action ledger"],
  },
  {
    id: "connections",
    name: "Connections",
    nav: "Connections",
    letter: "G",
    kicker: "Setup",
    title: "Connect the systems reputation depends on",
    desc: "Google, Meta, Twilio, GA4, and SEO providers with visible health status.",
    cta: "Add connection",
    art: "integrations-empty.svg",
    value: "Wire the core channels once and monitor every integration in one place.",
    steps: ["Connect Google", "Add messaging provider", "Confirm sync health"],
  },
  {
    id: "establishments",
    name: "Establishments",
    nav: "Locations",
    letter: "L",
    kicker: "Locations",
    title: "Manage every business profile from one place",
    desc: "Completeness, ratings, addresses, devices, and local ranking health.",
    cta: "Add business",
    art: "listings-empty.svg",
    value: "Add a location so reviews, requests, devices, and reports roll up cleanly.",
    steps: ["Enter business details", "Verify the address", "Attach channels"],
  },
  {
    id: "devices",
    name: "Devices",
    nav: "Devices",
    letter: "Q",
    kicker: "QR and NFC",
    title: "Turn the counter into a review engine",
    desc: "QR stands, NFC cards, previews, batch generation, and activation status.",
    cta: "Add device",
    art: "qr-stands-empty.svg",
    value: "Create a branded QR or NFC flow customers can tap before they leave.",
    steps: ["Choose QR or NFC", "Assign a location", "Preview tap destination"],
  },
  {
    id: "phone",
    name: "Phone",
    nav: "Phone",
    letter: "V",
    kicker: "Voice",
    title: "Answer calls and turn great moments into reviews",
    desc: "Number provisioning, AI receptionist settings, call logs, and review conversion.",
    cta: "Provision number",
    art: "phone-empty.svg",
    value: "Set up an AI receptionist that captures context and routes follow-up requests.",
    steps: ["Choose a number", "Train voice behavior", "Review first transcript"],
  },
  {
    id: "settings",
    name: "Settings",
    nav: "Settings",
    letter: "T",
    kicker: "Workspace",
    title: "Keep the workspace controlled and billable",
    desc: "Profiles, roles, plan status, invoices, usage meters, and account controls.",
    cta: "Invite teammate",
    art: "billing-empty.svg",
    value: "Invite the team and choose a plan before automations go live.",
    steps: ["Invite an owner", "Set roles", "Confirm billing details"],
  },
  {
    id: "onboarding",
    name: "Onboarding",
    nav: "Setup",
    letter: "N",
    kicker: "Setup",
    title: "Launch reputation operations in three steps",
    desc: "Business setup, connection, and first request flow with progress saved automatically.",
    cta: "Continue setup",
    art: "onboarding-steps.svg",
    value: "A guided path keeps new tenants from staring at an empty product.",
    steps: ["Add business", "Connect Google", "Send first request"],
  },
  {
    id: "auth",
    name: "Auth",
    nav: "Access",
    letter: "U",
    kicker: "Access",
    title: "A premium entry point for operators",
    desc: "Dark trust hero paired with a focused warm-canvas login and signup form.",
    cta: "Create account",
    art: "login-hero.svg",
    value: "Sign in or start a workspace with clear trust signals and one focused form.",
    steps: ["Enter email", "Choose workspace", "Connect first channel"],
  },
  {
    id: "marketing-home",
    name: "Marketing Home",
    nav: "Public",
    letter: "M",
    kicker: "Public site",
    title: "Run your reputation like a system",
    desc: "Hero, feature bento, how-it-works, integrations, pricing, proof, and CTA.",
    cta: "Start free",
    art: "home-hero.png",
    value: "A premium long-form page that shows the product outcome quickly.",
    steps: ["Clarify value", "Show feature depth", "Drive the CTA"],
  },
  {
    id: "system-states",
    name: "System States",
    nav: "States",
    letter: "Z",
    kicker: "States",
    title: "Reusable states that still feel like Repulabs",
    desc: "404, error, success, and loading surfaces that keep users oriented.",
    cta: "Return home",
    art: "not-found.svg",
    value: "System states should keep users oriented instead of feeling like dead ends.",
    steps: ["Show clear status", "Offer one next action", "Keep visuals consistent"],
  },
];

const navItems = [
  ["Home", "D"],
  ["Reviews", "R"],
  ["Requests", "O"],
  ["Inbox", "I"],
  ["Social", "P"],
  ["AI KB", "K"],
  ["Analytics", "A"],
  ["Auto", "B"],
  ["Setup", "N"],
];

const baseMetrics = [
  ["Average rating", "4.82", "+0.12"],
  ["New reviews", "286", "+24%"],
  ["Response rate", "96%", "+8%"],
  ["Requests sent", "1,248", "+31%"],
];

const dataRows = {
  reviews: [
    ["Maya Patel", "Google review", "5 stars", "AI draft ready"],
    ["Leo Grant", "SMS feedback", "4 stars", "Needs reply"],
    ["Ari Chen", "Webchat review", "5 stars", "Published"],
  ],
  contacts: [
    ["Nora Shah", "VIP", "Review sent today"],
    ["Ben Ortiz", "Service", "Survey completed"],
    ["Gia Morales", "Promoter", "Opened request"],
    ["Sam Reed", "Recovery", "Needs follow-up"],
  ],
  providers: [
    ["Google", "Healthy", "Live sync"],
    ["Meta", "Healthy", "Comments and DMs"],
    ["Twilio", "Healthy", "SMS verified"],
    ["GA4", "Connected", "Weekly events"],
    ["DataForSEO", "Connect", "Rank tracking"],
  ],
};

const imageCache = new Map();

mkdirSync(outDir, { recursive: true });

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function assetData(fileName, base = illustrationsDir) {
  const key = `${base}:${fileName}`;
  if (imageCache.has(key)) return imageCache.get(key);
  const filePath = join(base, fileName);
  if (!existsSync(filePath)) {
    throw new Error(`Missing asset: ${filePath}`);
  }
  const ext = extname(fileName).toLowerCase();
  const mime = ext === ".svg" ? "image/svg+xml" : "image/png";
  const data = `data:${mime};base64,${readFileSync(filePath).toString("base64")}`;
  imageCache.set(key, data);
  return data;
}

function logoData() {
  if (!existsSync(logoPath)) return "";
  return `data:image/png;base64,${readFileSync(logoPath).toString("base64")}`;
}

function wrapText(value, maxChars) {
  const words = String(value).split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function text(value, x, y, options = {}) {
  const {
    size = 14,
    fill = "#475569",
    weight = 500,
    width = 0,
    lineHeight = 1.28,
    anchor = "start",
    family = "Inter, Segoe UI, Arial, sans-serif",
    spacing = 0,
  } = options;
  const maxChars = width ? Math.max(12, Math.floor(width / (size * 0.54))) : 999;
  const lines = wrapText(value, maxChars);
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${family}" font-size="${size}" font-weight="${weight}" letter-spacing="${spacing}" text-anchor="${anchor}">${lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : size * lineHeight}">${esc(line)}</tspan>`)
    .join("")}</text>`;
}

function rect(x, y, w, h, fill, options = {}) {
  const { rx = 0, stroke = "none", sw = 1, opacity = 1, filter = "" } = options;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" ${filter ? `filter="${filter}"` : ""}/>`;
}

function image(fileName, x, y, w, h, options = {}) {
  const href =
    options.logo === true ? logoData() : assetData(fileName, options.base ?? illustrationsDir);
  const preserve = options.cover ? "xMidYMid slice" : "xMidYMid meet";
  return `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${preserve}"/>`;
}

function defs() {
  return `
    <defs>
      <linearGradient id="canvas" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fbfaf6"/>
        <stop offset="56%" stop-color="#f4f8f5"/>
        <stop offset="100%" stop-color="#eef7f4"/>
      </linearGradient>
      <radialGradient id="tealGlow" cx="78%" cy="7%" r="45%">
        <stop offset="0%" stop-color="#12b998" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#12b998" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="blueGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#2457ff"/>
        <stop offset="52%" stop-color="#5267ff"/>
        <stop offset="100%" stop-color="#1b3fd1"/>
      </linearGradient>
      <linearGradient id="buttonGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2457ff"/>
        <stop offset="100%" stop-color="#1b3fd1"/>
      </linearGradient>
      <linearGradient id="tealBlue" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#2457ff"/>
        <stop offset="100%" stop-color="#12b998"/>
      </linearGradient>
      <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#0f172a" flood-opacity="0.06"/>
        <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#0f172a" flood-opacity="0.10"/>
      </filter>
      <filter id="blueShadow" x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#2457ff" flood-opacity="0.30"/>
      </filter>
      <style>
        .mono { font-variant-numeric: tabular-nums; }
      </style>
    </defs>`;
}

function svg(width, height, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${defs()}
      <rect width="${width}" height="${height}" fill="url(#canvas)"/>
      <rect width="${width}" height="${height}" fill="url(#tealGlow)"/>
      ${body}
    </svg>`;
}

function button(label, x, y, w = 150) {
  return `${rect(x, y, w, 44, "url(#buttonGrad)", { rx: 22, filter: "url(#blueShadow)" })}
    ${text(label, x + w / 2, y + 28, { size: 13, fill: "#ffffff", weight: 850, anchor: "middle" })}`;
}

function lightButton(label, x, y, w = 150) {
  return `${rect(x, y, w, 42, "#ffffff", { rx: 21, stroke: "#e7edf2" })}
    ${text(label, x + w / 2, y + 27, { size: 13, fill: "#1e293b", weight: 800, anchor: "middle" })}`;
}

function pill(label, x, y, options = {}) {
  const w = options.width ?? label.length * 7 + 28;
  const fill = options.fill ?? "#eff6ff";
  const color = options.color ?? "#2457ff";
  const stroke = options.stroke ?? "#dbeafe";
  return `${rect(x, y, w, 30, fill, { rx: 15, stroke })}
    ${text(label, x + w / 2, y + 20, { size: 11, fill: color, weight: 850, anchor: "middle" })}`;
}

function card(x, y, w, h, body = "", options = {}) {
  return `${rect(x, y, w, h, options.fill ?? "rgba(255,255,255,0.94)", {
    rx: options.rx ?? 22,
    stroke: options.stroke ?? "#e7edf2",
    filter: options.shadow === false ? "" : "url(#cardShadow)",
  })}${body}`;
}

function rail(active) {
  let out = card(24, 28, 104, 844, "", { rx: 30, fill: "rgba(255,255,255,0.76)" });
  out += rect(51, 48, 50, 50, "url(#buttonGrad)", { rx: 18 });
  out += text("R", 76, 81, { size: 22, fill: "#ffffff", weight: 900, anchor: "middle" });
  let y = 122;
  for (const [label, letter] of navItems) {
    const isActive = active === label;
    out += rect(42, y, 68, 58, isActive ? "#eff6ff" : "transparent", { rx: 18 });
    out += rect(61, y + 8, 30, 30, isActive ? "#2457ff" : "#f7f8fb", {
      rx: 12,
      stroke: isActive ? "#2457ff" : "#e7edf2",
    });
    out += text(letter, 76, y + 29, {
      size: 13,
      fill: isActive ? "#ffffff" : "#64748b",
      weight: 900,
      anchor: "middle",
    });
    out += text(label, 76, y + 50, {
      size: 9,
      fill: isActive ? "#2457ff" : "#64748b",
      weight: 800,
      anchor: "middle",
    });
    y += 70;
  }
  out += rect(61, 814, 30, 30, "#f7f8fb", { rx: 12, stroke: "#e7edf2" });
  out += text("?", 76, 835, { size: 13, fill: "#64748b", weight: 900, anchor: "middle" });
  return out;
}

function topbar() {
  return `${rect(154, 28, 440, 46, "rgba(255,255,255,0.82)", { rx: 23, stroke: "#e7edf2" })}
    ${text("Search customers, reviews, locations", 178, 57, { size: 13, fill: "#94a3b8", weight: 700 })}
    ${rect(1136, 28, 44, 44, "rgba(255,255,255,0.86)", { rx: 22, stroke: "#e7edf2" })}
    ${text("!", 1158, 57, { size: 14, fill: "#64748b", weight: 900, anchor: "middle" })}
    ${rect(1194, 28, 160, 44, "rgba(255,255,255,0.86)", { rx: 22, stroke: "#e7edf2" })}
    ${text("BrightSmile Dental", 1274, 56, { size: 13, fill: "#1e293b", weight: 800, anchor: "middle" })}
    ${rect(1368, 28, 44, 44, "#0f172a", { rx: 22 })}
    ${text("NS", 1390, 57, { size: 12, fill: "#ffffff", weight: 900, anchor: "middle" })}`;
}

function pageHeader(screen) {
  return `${text(screen.kicker.toUpperCase(), 154, 120, { size: 12, fill: "#2457ff", weight: 900, spacing: 1.2 })}
    ${text(screen.title, 154, 158, { size: 35, fill: "#0f172a", weight: 850, width: 790, lineHeight: 1.12 })}
    ${text(screen.desc, 154, 214, { size: 15, fill: "#64748b", weight: 500, width: 760, lineHeight: 1.5 })}
    ${button(screen.cta, 1236, 150, 176)}`;
}

function shell(screen, body) {
  return svg(1440, 900, `${rail(screen.nav)}${topbar()}${pageHeader(screen)}${body}`);
}

function beforeBoard(screen) {
  const steps = screen.steps
    .map((step, index) => {
      const y = 340 + index * 76;
      return `${rect(1052, y, 310, 58, "#fbfaf6", { rx: 16, stroke: "#e7edf2" })}
        ${rect(1068, y + 12, 34, 34, "#eff6ff", { rx: 17 })}
        ${text(String(index + 1), 1085, y + 34, { size: 12, fill: "#2457ff", weight: 900, anchor: "middle" })}
        ${text(step, 1116, y + 35, { size: 13, fill: "#1e293b", weight: 780, width: 220 })}`;
    })
    .join("");

  const emptyCard = card(
    154,
    248,
    860,
    624,
    `${image(screen.art, 374, 292, 420, 260)}
      ${text(screen.value, 272, 600, { size: 26, fill: "#0f172a", weight: 850, width: 620, anchor: "start", lineHeight: 1.18 })}
      ${text(screen.desc, 292, 684, { size: 15, fill: "#64748b", weight: 500, width: 580, lineHeight: 1.45 })}
      ${button(screen.cta, 504, 758, 160)}`,
  );

  const setup = card(
    1032,
    248,
    360,
    624,
    `${text("Getting started", 1056, 292, { size: 17, fill: "#0f172a", weight: 850 })}
      ${text("Before state - first useful actions", 1056, 316, { size: 12, fill: "#94a3b8", weight: 760 })}
      ${steps}
      ${rect(1052, 630, 310, 150, "#eff6ff", { rx: 18, stroke: "#dbeafe" })}
      ${text("AI setup can complete this checklist with approval and keep every step reversible.", 1074, 666, { size: 14, fill: "#475569", weight: 550, width: 260, lineHeight: 1.45 })}`,
  );

  return shell(screen, `${emptyCard}${setup}`);
}

function metric(label, value, trend, x, y, w = 252) {
  return card(
    x,
    y,
    w,
    108,
    `${text(label, x + 18, y + 30, { size: 12, fill: "#64748b", weight: 850 })}
      ${text(value, x + 18, y + 70, { size: 29, fill: "#0f172a", weight: 850 })}
      ${text(trend, x + 18, y + 94, { size: 12, fill: "#12b998", weight: 900 })}`,
    { rx: 18 },
  );
}

function panel(title, sub, x, y, w, h, body = "", icon = "*") {
  return card(
    x,
    y,
    w,
    h,
    `${rect(x + 18, y + 18, 34, 34, "#eff6ff", { rx: 13 })}
      ${text(icon, x + 35, y + 40, { size: 13, fill: "#2457ff", weight: 900, anchor: "middle" })}
      ${text(title, x + 64, y + 35, { size: 16, fill: "#0f172a", weight: 850 })}
      ${text(sub, x + 64, y + 53, { size: 12, fill: "#94a3b8", weight: 730 })}
      ${body}`,
    { rx: 22 },
  );
}

function chart(x, y, w, h) {
  return `${rect(x, y, w, h, "#f8fafc", { rx: 16, stroke: "#e7edf2" })}
    <path d="M ${x + 22} ${y + h - 34} C ${x + 110} ${y + 84}, ${x + 160} ${y + 150}, ${x + 230} ${y + 94} S ${x + 372} ${y + 92}, ${x + w - 28} ${y + 32}" fill="none" stroke="#2457ff" stroke-width="7" stroke-linecap="round"/>
    <path d="M ${x + 22} ${y + h - 62} C ${x + 120} ${y + 122}, ${x + 188} ${y + 134}, ${x + 260} ${y + 104} S ${x + 386} ${y + 98}, ${x + w - 28} ${y + 58}" fill="none" stroke="#12b998" stroke-width="5" stroke-linecap="round" opacity="0.65"/>`;
}

function bars(x, y, w, h) {
  const values = [38, 58, 42, 74, 62, 88, 72];
  const gap = 12;
  const bw = (w - gap * (values.length - 1)) / values.length;
  return values
    .map((value, i) => {
      const bh = (h * value) / 100;
      return rect(x + i * (bw + gap), y + h - bh, bw, bh, "url(#tealBlue)", { rx: 9 });
    })
    .join("");
}

function score(x, y, value = "91") {
  return `<circle cx="${x + 66}" cy="${y + 66}" r="52" fill="none" stroke="rgba(255,255,255,0.24)" stroke-width="10"/>
    <path d="M ${x + 66} ${y + 14} a 52 52 0 1 1 -44 80" fill="none" stroke="#12b998" stroke-width="10" stroke-linecap="round"/>
    ${text(value, x + 66, y + 72, { size: 32, fill: "#ffffff", weight: 900, anchor: "middle" })}
    ${text("SCORE", x + 66, y + 93, { size: 10, fill: "rgba(255,255,255,0.72)", weight: 850, anchor: "middle" })}`;
}

function heroBand() {
  return `${rect(154, 248, 1238, 174, "url(#blueGrad)", { rx: 26, filter: "url(#blueShadow)" })}
    ${pill("Live visibility health", 180, 276, { fill: "rgba(255,255,255,0.16)", stroke: "rgba(255,255,255,0.24)", color: "#ffffff", width: 156 })}
    ${text("Strong and improving across 3 locations", 180, 332, { size: 28, fill: "#ffffff", weight: 850, width: 520 })}
    ${text("AI closed 18 reply gaps and review velocity is up 22% this week.", 180, 398, { size: 14, fill: "rgba(255,255,255,0.76)", weight: 500, width: 520 })}
    ${score(930, 269)}
    ${rect(1092, 286, 122, 86, "rgba(255,255,255,0.12)", { rx: 16, stroke: "rgba(255,255,255,0.18)" })}
    ${text("Unanswered", 1110, 314, { size: 11, fill: "rgba(255,255,255,0.72)", weight: 850 })}
    ${text("3", 1110, 350, { size: 28, fill: "#ffffff", weight: 900 })}
    ${rect(1228, 286, 122, 86, "rgba(255,255,255,0.12)", { rx: 16, stroke: "rgba(255,255,255,0.18)" })}
    ${text("Queue", 1246, 314, { size: 11, fill: "rgba(255,255,255,0.72)", weight: 850 })}
    ${text("128", 1246, 350, { size: 28, fill: "#ffffff", weight: 900 })}`;
}

function rows(items, x, y, w, options = {}) {
  const rowH = options.rowH ?? 58;
  return items
    .map((item, index) => {
      const yy = y + index * (rowH + 10);
      const tagColor = item[2]?.includes("Healthy") || item[2]?.includes("Live") || item[2]?.includes("Done") ? "green" : "blue";
      return `${rect(x, yy, w, rowH, "#fbfaf6", { rx: 16, stroke: "#e7edf2" })}
        ${rect(x + 14, yy + 10, 38, 38, "#eff6ff", { rx: 19 })}
        ${text(item[0][0], x + 33, yy + 35, { size: 13, fill: "#2457ff", weight: 900, anchor: "middle" })}
        ${text(item[0], x + 64, yy + 27, { size: 13, fill: "#1e293b", weight: 800, width: w - 170 })}
        ${text(item[1], x + 64, yy + 45, { size: 11, fill: "#64748b", weight: 600, width: w - 170 })}
        ${pill(item[2] ?? "Ready", x + w - 104, yy + 16, {
          width: 84,
          fill: tagColor === "green" ? "#dff8ed" : "#eff6ff",
          stroke: tagColor === "green" ? "rgba(18,185,152,0.25)" : "#dbeafe",
          color: tagColor === "green" ? "#0b8f6d" : "#2457ff",
        })}`;
    })
    .join("");
}

function table(headers, bodyRows, x, y, w) {
  const colW = w / headers.length;
  let out = rect(x, y, w, 44 + bodyRows.length * 42, "#fbfaf6", { rx: 16, stroke: "#e7edf2" });
  headers.forEach((header, i) => {
    out += text(header.toUpperCase(), x + i * colW + 14, y + 28, { size: 10, fill: "#94a3b8", weight: 900 });
  });
  bodyRows.forEach((row, r) => {
    const yy = y + 44 + r * 42;
    out += `<line x1="${x}" y1="${yy}" x2="${x + w}" y2="${yy}" stroke="#e7edf2"/>`;
    row.forEach((cell, i) => {
      out += text(cell, x + i * colW + 14, yy + 27, { size: 12, fill: "#475569", weight: 700, width: colW - 20 });
    });
  });
  return out;
}

function kanban(labels, x, y, w, h) {
  const gap = 12;
  const colW = (w - gap * (labels.length - 1)) / labels.length;
  return labels
    .map((label, i) => {
      const xx = x + i * (colW + gap);
      return `${rect(xx, y, colW, h, "#fbfaf6", { rx: 16, stroke: "#e7edf2" })}
        ${text(label, xx + 14, y + 28, { size: 12, fill: "#1e293b", weight: 850 })}
        ${rect(xx + 14, y + 48, colW - 28, 64, "#ffffff", { rx: 12, stroke: "#e7edf2" })}
        ${text(i === 0 ? "Ready for review" : i === 1 ? "AI drafted next step" : "No blockers", xx + 26, y + 78, { size: 12, fill: "#475569", weight: 650, width: colW - 52 })}`;
    })
    .join("");
}

function flow(label, value, x, y, w) {
  return `${rect(x, y, w, 72, "#ffffff", { rx: 18, stroke: "#e7edf2" })}
    ${rect(x + 16, y + 18, 36, 36, "#eff6ff", { rx: 13 })}
    ${text("+", x + 34, y + 42, { size: 17, fill: "#2457ff", weight: 900, anchor: "middle" })}
    ${text(label, x + 66, y + 30, { size: 13, fill: "#1e293b", weight: 850 })}
    ${text(value, x + 66, y + 50, { size: 12, fill: "#64748b", weight: 600, width: w - 86 })}`;
}

function qr(x, y) {
  let out = rect(x, y, 180, 180, "#ffffff", { rx: 20, stroke: "#dbeafe", sw: 10 });
  const gap = 5;
  const size = 22;
  for (let i = 0; i < 25; i++) {
    out += rect(x + 20 + (i % 5) * (size + gap), y + 20 + Math.floor(i / 5) * (size + gap), size, size, i % 2 === 0 || i % 7 === 0 ? "#0f172a" : "#dbeafe", { rx: 4 });
  }
  out += rect(x + 68, y + 68, 44, 44, "#2457ff", { rx: 22 });
  out += text("R", x + 90, y + 96, { size: 16, fill: "#ffffff", weight: 900, anchor: "middle" });
  return out;
}

function calendar(x, y) {
  let out = "";
  for (let i = 0; i < 21; i++) {
    out += rect(x + (i % 7) * 42, y + Math.floor(i / 7) * 42, 34, 34, i === 8 || i === 15 ? "url(#buttonGrad)" : "#f7f8fb", { rx: 10, stroke: i === 8 || i === 15 ? "#2457ff" : "#e7edf2" });
  }
  return out;
}

function mediaGrid(images, x, y, w) {
  const gap = 14;
  const itemW = (w - gap * (images.length - 1)) / images.length;
  return images
    .map((img, i) =>
      card(x + i * (itemW + gap), y, itemW, 132, image(img, x + i * (itemW + gap), y, itemW, 132, { cover: true }), { rx: 18 }),
    )
    .join("");
}

function afterBoard(screen) {
  if (screen.id === "auth") return authBoard(screen, "after");
  if (screen.id === "marketing-home") return marketingBoard(screen, "after");
  if (screen.id === "system-states") return systemBoard(screen);

  let body = "";
  switch (screen.id) {
    case "dashboard":
      body = `${heroBand()}
        ${baseMetrics.map((m, i) => metric(m[0], m[1], m[2], 154 + i * 270, 444)).join("")}
        ${panel("Rating trend", "Last 90 days", 154, 572, 640, 300, chart(180, 646, 588, 184), "T")}
        ${panel("Review velocity", "Weekly volume", 812, 572, 270, 300, bars(840, 650, 214, 170), "V")}
        ${panel("AI briefing", "Recommended focus", 1100, 572, 292, 300, `${text("Lakeview is winning on speed and staff mentions. North Auto needs pickup-time recovery and two pending replies approved today.", 1124, 654, { size: 14, fill: "#475569", width: 240, lineHeight: 1.45 })}`, "AI")}`;
      break;
    case "reviews":
      body = `${panel("Review feed", "Filter by platform, rating, and status", 154, 248, 810, 624, `${pill("All platforms", 182, 324, { width: 104 })}${pill("Needs reply", 296, 324, { width: 96 })}${rows(dataRows.reviews, 182, 378, 754)}`, "R")}
        ${panel("AI draft composer", "Approve and publish", 984, 248, 408, 624, `${card(1010, 326, 356, 190, `${text("Thanks, Maya. We are glad the team made the visit clear and on time. We will share this with Dr. Nora and the hygiene team.", 1030, 366, { size: 14, fill: "#475569", width: 310, lineHeight: 1.45 })}`, { fill: "#fbfaf6", shadow: false, rx: 18 })}${button("Approve and publish", 1080, 548, 210)}${pill("Positive", 1010, 628, { width: 82, fill: "#dff8ed", stroke: "rgba(18,185,152,0.25)", color: "#0b8f6d" })}${pill("Staff mention", 1102, 628, { width: 112 })}${pill("Speed", 1224, 628, { width: 70, fill: "#fff1cc", stroke: "rgba(214,166,58,0.32)", color: "#8a6818" })}`, "AI")}`;
      break;
    case "outreach":
      body = `${panel("Campaigns", "Review request programs", 154, 248, 380, 300, rows([["Post-visit hygiene", "SMS and email", "Live"], ["Auto-shop pickup", "Scheduled", "Ready"], ["Cafe loyalty QR", "QR and NFC", "Draft"]], 182, 326, 324, { rowH: 54 }), "O")}
        ${panel("Template editor", "Merge tags and preview", 552, 248, 470, 300, `${pill("SMS", 580, 324, { width: 58 })}${pill("Email", 648, 324, { width: 66 })}${rect(580, 380, 390, 18, "#e7edf2", { rx: 9 })}${rect(580, 414, 330, 18, "#e7edf2", { rx: 9 })}${rect(580, 448, 250, 18, "#e7edf2", { rx: 9 })}`, "M")}
        ${panel("Deliverability", "Last 7 days", 1040, 248, 352, 300, `${metric("Delivered", "98.4%", "+1.9%", 1064, 326, 140)}${metric("Clicks", "41%", "+8%", 1214, 326, 140)}`, "D")}
        ${panel("Recipients", "Next send queue", 154, 568, 1238, 304, table(["Customer", "Channel", "Segment", "Schedule"], [["Maya Patel", "SMS", "Dental promoter", "Today 3:00 PM"], ["Leo Grant", "Email", "Service complete", "Tomorrow 9:00 AM"], ["Ari Chen", "QR", "Cafe regular", "On visit"]], 182, 646, 1182), "U")}`;
      break;
    case "ai-kb":
      body = `${rect(154, 248, 1238, 174, "url(#tealBlue)", { rx: 26, filter: "url(#blueShadow)" })}
        ${image("kb-brain.png", 180, 266, 210, 136)}
        ${pill("Brain readiness 87%", 420, 282, { fill: "rgba(255,255,255,0.16)", stroke: "rgba(255,255,255,0.24)", color: "#ffffff", width: 150 })}
        ${text("AI can answer most customer questions safely.", 420, 334, { size: 28, fill: "#ffffff", weight: 850, width: 640 })}
        ${text("Pricing and emergency policy still need confirmation.", 420, 372, { size: 14, fill: "rgba(255,255,255,0.76)", width: 560 })}
        ${panel("Training tabs", "Business info, voice, pricing, test", 154, 444, 780, 428, `${pill("Business info", 182, 520, { width: 120 })}${pill("Voice and style", 312, 520, { width: 126 })}${pill("Pricing", 448, 520, { width: 82 })}${table(["Area", "Status", "Owner"], [["Hours and services", "Verified", "Nora"], ["Implant pricing", "Needs review", "Manager"], ["Cancellation policy", "Gap detected", "AI queue"]], 182, 580, 724)}`, "K")}
        ${panel("Knowledge gaps", "Needs human confirmation", 954, 444, 438, 428, rows([["Emergency deposit", "Policy missing", "Open"], ["Insurance list", "Updated plan names", "Review"], ["Refund language", "Voice risk", "Open"]], 982, 522, 382), "!")}`;
      break;
    case "disputes":
      body = `${panel("Flagged reviews", "Potential policy issues", 154, 248, 390, 624, rows([["Unknown reviewer", "No CRM match", "Open"], ["Duplicate complaint", "Cross-platform", "Review"], ["Policy language", "Draft ready", "Ready"]], 182, 326, 334), "X")}
        ${panel("AI dispute draft", "Evidence package", 562, 248, 390, 624, `${rect(590, 330, 320, 18, "#e7edf2", { rx: 9 })}${rect(590, 370, 280, 18, "#e7edf2", { rx: 9 })}${rect(590, 410, 210, 18, "#e7edf2", { rx: 9 })}${text("Includes appointment log, refund note, and GBP policy reference.", 590, 488, { size: 14, fill: "#475569", width: 300 })}`, "AI")}
        ${panel("Status pipeline", "Draft to decision", 970, 248, 422, 624, kanban(["Draft", "Submitted", "Won", "Lost"], 998, 330, 366, 210), "P")}`;
      break;
    case "surveys":
      body = `${panel("Survey builder", "NPS and CSAT flow", 154, 248, 600, 360, `${pill("Question", 182, 324, { width: 86 })}${pill("Routing", 278, 324, { width: 80 })}${rect(182, 390, 510, 18, "#e7edf2", { rx: 9 })}${rect(182, 430, 390, 18, "#e7edf2", { rx: 9 })}${flow("Happy", "Public review", 182, 490, 250)}${flow("Unhappy", "Private recovery", 442, 490, 250)}`, "S")}
        ${panel("Scores", "This month", 774, 248, 280, 360, `${metric("NPS", "71", "+9", 802, 326, 220)}${metric("CSAT", "94%", "+5%", 802, 452, 220)}`, "N")}
        ${panel("Insights", "AI themes", 1072, 248, 320, 360, rows([["Wait time", "Improving", "Live"], ["Staff warmth", "Top driver", "Good"], ["Pricing clarity", "Watch", "Open"]], 1100, 326, 264, { rowH: 54 }), "I")}
        ${panel("Responses", "Recent feedback", 154, 628, 1238, 244, table(["Customer", "Score", "Route", "Status"], [["Ari Chen", "10", "Review", "Sent"], ["Leo Grant", "7", "Private", "Assigned"], ["Maya Patel", "9", "Review", "Posted"]], 182, 706, 1182), "U")}`;
      break;
    case "inbox":
      body = `${panel("Conversations", "All channels", 154, 248, 320, 624, `${pill("FB", 182, 324, { width: 46 })}${pill("SMS", 238, 324, { width: 58 })}${pill("Webchat", 306, 324, { width: 82 })}${rows([["Maya Patel", "Can I move my appointment?", "Live"], ["North Auto", "Estimate question", "Open"], ["Ari Chen", "Cafe loyalty ask", "New"]], 182, 378, 264)}`, "I")}
        ${panel("Thread", "AI-assisted reply", 492, 248, 590, 624, `${card(522, 332, 430, 92, `${text("Customer: Can I move my cleaning from Friday to Monday?", 546, 370, { size: 14, fill: "#475569", width: 360 })}`, { fill: "#fbfaf6", shadow: false, rx: 20 })}${card(630, 450, 420, 92, `${text("Team: Monday has 10:30 AM or 2:15 PM open.", 654, 488, { size: 14, fill: "#ffffff", width: 350 })}`, { fill: "#2457ff", shadow: false, stroke: "#2457ff", rx: 20 })}${rect(522, 690, 530, 90, "#eff6ff", { rx: 18, stroke: "#dbeafe" })}${text("AI suggests confirming insurance details before rescheduling.", 550, 742, { size: 14, fill: "#475569", width: 460 })}`, "T")}
        ${panel("Customer context", "Maya Patel", 1100, 248, 292, 624, rows([["Profile", "Promoter, 3 visits", "VIP"], ["Timeline", "Survey completed", "Live"], ["Next step", "Confirm insurance", "Open"]], 1128, 326, 236), "C")}`;
      break;
    case "social":
      body = `${panel("Write", "Caption workspace", 154, 248, 360, 360, `${rect(182, 330, 285, 18, "#e7edf2", { rx: 9 })}${rect(182, 368, 245, 18, "#e7edf2", { rx: 9 })}${rect(182, 406, 190, 18, "#e7edf2", { rx: 9 })}${lightButton("Generate captions", 182, 474, 170)}`, "W")}
        ${panel("Preview", "Per-platform mockup", 532, 248, 360, 360, phonePreview(636, 324), "P")}
        ${panel("Schedule", "Content calendar", 910, 248, 482, 360, calendar(952, 338), "C")}
        ${panel("Creative library", "Reusable proof assets", 154, 628, 1238, 244, mediaGrid(["voice-review.png", "feat-surveys.png", "feat-analytics.png", "feat-reviews.png"], 182, 706, 1182), "L")}`;
      break;
    case "contacts":
      body = `${panel("Segments", "Audience groups", 154, 248, 320, 624, rows([["Recent promoters", "Ready for requests", "Live"], ["Needs recovery", "Private follow-up", "Open"], ["No request 90d", "Winback", "Draft"]], 182, 326, 264), "C")}
        ${panel("Contacts table", "CRM records", 492, 248, 590, 624, table(["Name", "Tag", "Last activity"], dataRows.contacts, 520, 326, 534), "T")}
        ${panel("Profile drawer", "Nora Shah", 1100, 248, 292, 624, rows([["Owner", "BrightSmile Dental", "VIP"], ["Timeline", "3 visits", "Live"], ["Eligibility", "Request sent", "Done"]], 1128, 326, 236), "P")}`;
      break;
    case "analytics":
      body = `${[["Reputation score", "89", "+6"], ["Local rank", "#2", "+1"], ["Competitor gap", "0.18", "-0.04"], ["Reports", "12", "sent"]].map((m, i) => metric(m[0], m[1], m[2], 154 + i * 270, 248)).join("")}
        ${panel("Rating trend", "90 days", 154, 378, 640, 300, chart(180, 452, 588, 184), "T")}
        ${panel("Local 3-pack", "Map ranking", 812, 378, 270, 300, mapCard(858, 454), "M")}
        ${panel("Competitor compare", "Nearby businesses", 1100, 378, 292, 300, bars(1128, 456, 236, 170), "B")}
        ${panel("Executive summary", "Weekly report", 154, 698, 1238, 174, `${text("Ratings improved after response time dropped below four hours. Competitor A gained review volume, but sentiment remains weaker.", 182, 780, { size: 15, fill: "#475569", width: 1000 })}`, "E")}`;
      break;
    case "autopilot":
      body = `${["Auto-reply", "Auto-request", "Auto-post"].map((name, i) => panel(name, "Guardrails on", 154 + i * 412, 248, 394, 220, `${flow("ON", `${name} loop`, 182 + i * 412, 326, 330)}${text("Owner-safe checks enabled", 204 + i * 412, 424, { size: 14, fill: "#475569", width: 280 })}`, "B")).join("")}
        ${panel("Action ledger", "Recent automation", 154, 492, 800, 380, rows([["Review replied", "Maya Patel", "Live"], ["Requests sent", "84 customers", "Done"], ["Post queued", "Friday promo", "Ready"]], 182, 570, 744), "L")}
        ${panel("ROI estimate", "This month", 972, 492, 420, 380, `${metric("Hours saved", "38", "this month", 1000, 570, 160)}${metric("Value protected", "$8.4k", "+18%", 1170, 570, 160)}`, "$")}`;
      break;
    case "connections":
      body = `${panel("Provider grid", "Connect and monitor", 154, 248, 810, 624, rows(dataRows.providers, 182, 326, 754, { rowH: 54 }), "G")}
        ${panel("Configuration", "Health settings", 984, 248, 408, 624, rows([["Google", "Sync every 15 min", "Healthy"], ["Meta", "Moderation on", "Live"], ["Twilio", "Callbacks verified", "Healthy"]], 1012, 326, 352), "S")}`;
      break;
    case "establishments":
      body = `${["BrightSmile Lakeview", "Loop Cafe West", "North Auto Repair"].map((name, i) => panel(name, i === 0 ? "4.9 rating, 98% complete" : "4.7 rating, setup needs attention", 154 + i * 412, 248, 394, 310, mapCard(260 + i * 412, 336), "L")).join("")}
        ${panel("Add-business flow", "Details to launch", 154, 582, 1238, 290, kanban(["Details", "Verify", "Connect", "Launch"], 182, 660, 1182, 150), "F")}`;
      break;
    case "devices":
      body = `${panel("Device list", "QR and NFC fleet", 154, 248, 700, 360, table(["Device", "Location", "Type", "Status"], [["Counter stand", "Lakeview", "QR", "Live"], ["Table tent batch", "Loop Cafe", "QR", "Printing"], ["Service card", "North Auto", "NFC", "Ready"]], 182, 326, 644), "Q")}
        ${panel("QR preview", "Center-logo code", 874, 248, 280, 360, qr(924, 328), "R")}
        ${panel("NFC config", "Tap destination", 1172, 248, 220, 360, flow("Tap", "Review picker", 1200, 328, 164), "N")}
        ${panel("Batch generator", "Admin hardware", 154, 628, 1238, 244, `${metric("Labels generated", "250", "ready", 182, 706, 230)}${pill("Download batch", 450, 734, { width: 128 })}${pill("Print proof", 590, 734, { width: 98 })}${pill("Assign location", 700, 734, { width: 126 })}`, "B")}`;
      break;
    case "phone":
      body = `${panel("Number provisioning", "Local voice line", 154, 248, 380, 300, `${metric("Main line", "(312) 555-0184", "live", 182, 326, 220)}${lightButton("Buy local number", 182, 466, 180)}`, "V")}
        ${panel("Call log", "Recent calls", 552, 248, 840, 300, table(["Caller", "Intent", "Outcome", "Review"], [["Maya Patel", "Reschedule", "Booked", "Queued"], ["Ben Ortiz", "Estimate", "Handoff", "No"], ["Ari Chen", "Hours", "Answered", "Sent"]], 580, 326, 784), "C")}
        ${panel("Transcript to review", "AI receptionist", 154, 568, 1238, 304, `${text("Caller praised the front desk after a same-day booking. AI queued a friendly review request after the call ended.", 182, 650, { size: 16, fill: "#475569", width: 950 })}${image("voice-review.png", 1010, 606, 300, 200)}`, "AI")}`;
      break;
    case "settings":
      body = `${panel("Profile", "Workspace owner", 154, 248, 360, 300, rows([["Nora Shah", "Owner", "Live"], ["BrightSmile", "3 locations", "Active"]], 182, 326, 304), "P")}
        ${panel("Team roles", "RBAC", 532, 248, 520, 300, table(["Name", "Role", "Access"], [["Nora Shah", "Owner", "All"], ["Ivy Kim", "Manager", "Lakeview"], ["Sam Reed", "Billing", "Invoices"]], 560, 326, 464), "T")}
        ${panel("Plan", "Growth", 1070, 248, 322, 300, `${image("upgrade.svg", 1124, 310, 210, 112)}${metric("Monthly", "$149", "active", 1100, 442, 210)}`, "$")}
        ${panel("Usage meters", "Account limits", 154, 568, 1238, 304, `${progress("AI replies", 68, 182, 650, 1120)}${progress("SMS requests", 84, 182, 714, 1120)}${progress("Locations", 42, 182, 778, 1120)}`, "U")}`;
      break;
    case "onboarding":
      body = `${rect(154, 248, 1238, 174, "url(#blueGrad)", { rx: 26, filter: "url(#blueShadow)" })}
        ${pill("Step 2 of 3", 180, 276, { fill: "rgba(255,255,255,0.16)", stroke: "rgba(255,255,255,0.24)", color: "#ffffff", width: 100 })}
        ${text("Connect Google and send your first request", 180, 334, { size: 28, fill: "#ffffff", weight: 850, width: 660 })}
        ${text("Repulabs will pull reviews, train AI on your voice, and prepare a starter campaign.", 180, 372, { size: 14, fill: "rgba(255,255,255,0.76)", width: 660 })}
        ${image("onboarding-steps.svg", 1030, 266, 280, 136)}
        ${panel("Wizard path", "Business to launch", 154, 444, 780, 428, kanban(["Business", "Connect", "First request", "Invite team"], 182, 522, 724, 190), "W")}
        ${panel("Checklist", "Saved progress", 954, 444, 438, 428, rows([["Business profile", "Saved", "Done"], ["Google", "Pending", "Open"], ["SMS template", "Ready", "Ready"]], 982, 522, 382), "C")}`;
      break;
    default:
      body = `${panel(screen.name, "Populated state", 154, 248, 1238, 624, chart(182, 326, 1180, 420), screen.letter)}`;
      break;
  }
  return shell(screen, body);
}

function phonePreview(x, y) {
  return `${rect(x, y, 158, 250, "#0f172a", { rx: 28 })}
    ${rect(x + 55, y + 12, 48, 8, "#334155", { rx: 4 })}
    ${rect(x + 14, y + 30, 130, 204, "#ffffff", { rx: 20 })}
    ${rect(x + 26, y + 44, 106, 112, "url(#tealBlue)", { rx: 15 })}
    ${rect(x + 28, y + 174, 92, 9, "#e7edf2", { rx: 5 })}
    ${rect(x + 28, y + 194, 70, 9, "#e7edf2", { rx: 5 })}`;
}

function mapCard(x, y) {
  return `${rect(x, y, 180, 160, "#eff6ff", { rx: 18, stroke: "#dbeafe" })}
    <path d="M ${x + 20} ${y + 46} C ${x + 62} ${y + 18}, ${x + 108} ${y + 82}, ${x + 158} ${y + 44}" fill="none" stroke="#93c5fd" stroke-width="5" stroke-linecap="round"/>
    <path d="M ${x + 28} ${y + 118} C ${x + 74} ${y + 78}, ${x + 116} ${y + 142}, ${x + 154} ${y + 100}" fill="none" stroke="#cbd5e1" stroke-width="5" stroke-linecap="round"/>
    ${rect(x + 72, y + 52, 44, 44, "#2457ff", { rx: 22 })}
    ${text("#2", x + 94, y + 80, { size: 14, fill: "#ffffff", weight: 900, anchor: "middle" })}`;
}

function progress(label, value, x, y, w) {
  return `${text(label, x, y, { size: 12, fill: "#64748b", weight: 850 })}
    ${text(`${value}%`, x + w, y, { size: 12, fill: "#64748b", weight: 850, anchor: "end" })}
    ${rect(x, y + 14, w, 10, "#e7edf2", { rx: 5 })}
    ${rect(x, y + 14, (w * value) / 100, 10, "url(#tealBlue)", { rx: 5 })}`;
}

function authBoard(screen, state) {
  const title =
    state === "before"
      ? "Start a reputation workspace with less friction."
      : "Welcome back to a clean command center.";
  const formTitle = state === "before" ? "Launch BrightSmile Dental" : "Continue as Nora Shah";
  return svg(
    1440,
    900,
    `${rect(0, 0, 778, 900, "#0f172a")}
      <circle cx="600" cy="150" r="310" fill="#2457ff" opacity="0.18"/>
      ${image("repulabs-logo.png", 36, 36, 42, 42, { logo: true })}
      ${text("Repulabs", 92, 64, { size: 16, fill: "#ffffff", weight: 900 })}
      ${card(48, 128, 250, 104, `${text("4.9 avg", 70, 172, { size: 24, fill: "#ffffff", weight: 900 })}${text("Across 3 active locations", 70, 196, { size: 12, fill: "rgba(255,255,255,0.72)", weight: 800 })}`, { fill: "rgba(255,255,255,0.10)", stroke: "rgba(255,255,255,0.16)", rx: 18 })}
      ${image(state === "before" ? "login-hero.svg" : "home-hero.png", 238, 246, 500, 350)}
      ${text(title, 48, 752, { size: 42, fill: "#ffffff", weight: 850, width: 600, lineHeight: 1.08 })}
      ${text(screen.kicker.toUpperCase(), 888, 220, { size: 12, fill: "#2457ff", weight: 900, spacing: 1.2 })}
      ${text(formTitle, 888, 268, { size: 32, fill: "#0f172a", weight: 850, width: 430 })}
      ${field("Work email", "nora@brightsmile.co", 888, 314)}
      ${field("Password", "************", 888, 394)}
      ${state === "before" ? field("Workspace", "BrightSmile Dental", 888, 474) : ""}
      ${button(state === "before" ? "Start setup" : "Continue", 888, state === "before" ? 574 : 494, 430)}
      ${text("Secure access, role-based permissions, and full activity history for every workspace.", 888, state === "before" ? 650 : 570, { size: 13, fill: "#64748b", width: 420, lineHeight: 1.45 })}`,
  );
}

function field(label, value, x, y) {
  return `${rect(x, y, 430, 62, "#ffffff", { rx: 16, stroke: "#e7edf2" })}
    ${text(label, x + 18, y + 23, { size: 12, fill: "#94a3b8", weight: 850 })}
    ${text(value, x + 18, y + 46, { size: 14, fill: "#1e293b", weight: 750 })}`;
}

function marketingBoard(_screen, state) {
  const title =
    state === "before"
      ? "A calmer way to start reputation operations"
      : "Run your reputation like a system";
  return svg(
    1440,
    900,
    `${image("repulabs-logo.png", 48, 34, 42, 42, { logo: true })}
      ${text("Repulabs", 104, 62, { size: 16, fill: "#0f172a", weight: 900 })}
      ${text("Product", 920, 62, { size: 13, fill: "#475569", weight: 850 })}
      ${text("Integrations", 1000, 62, { size: 13, fill: "#475569", weight: 850 })}
      ${text("Pricing", 1114, 62, { size: 13, fill: "#475569", weight: 850 })}
      ${button("Start free", 1238, 34, 150)}
      ${text("REPUTATION OS FOR LOCAL TEAMS", 48, 160, { size: 12, fill: "#2457ff", weight: 900, spacing: 1.2 })}
      ${text(title, 48, 246, { size: 58, fill: "#0f172a", weight: 880, width: 610, lineHeight: 1.03 })}
      ${text("Reviews, AI replies, requests, inbox, phone, social, local SEO, and autopilot in one premium workspace.", 48, 376, { size: 17, fill: "#64748b", width: 610, lineHeight: 1.5 })}
      ${button("Book a demo", 48, 452, 150)}
      ${image("home-hero.png", 690, 124, 640, 390)}
      ${[
        ["feat-reviews.png", "AI reviews"],
        ["feat-ai-phone.png", "AI phone"],
        ["feat-qr-nfc.png", "QR and NFC"],
        ["feat-inbox.png", "Unified inbox"],
        ["feat-analytics.png", "Analytics"],
        ["feat-autopilot.png", "Autopilot"],
      ]
        .map(([img, label], i) => {
          const x = 48 + i * 224;
          return card(x, 612, 206, 226, `${image(img, x + 12, 624, 182, 122, { cover: true })}${text(label, x + 18, 790, { size: 13, fill: "#1e293b", weight: 850 })}`, { rx: 20 });
        })
        .join("")}`,
  );
}

function systemBoard(screen) {
  const cards = [
    ["not-found.svg", "404", "The page moved or was renamed."],
    ["error.svg", "Error", "We could not sync Google reviews."],
    ["success.svg", "Success", "Campaign scheduled for 426 recipients."],
    ["processing.svg", "Loading", "Skeleton cards keep layout stable."],
  ];
  const body = cards
    .map(([img, label, copy], i) => {
      const x = 154 + i * 310;
      return card(
        x,
        248,
        292,
        624,
        `${image(img, x + 44, 326, 204, 190)}
          ${text(label, x + 146, 570, { size: 22, fill: "#0f172a", weight: 850, anchor: "middle" })}
          ${text(copy, x + 42, 612, { size: 14, fill: "#64748b", width: 210, lineHeight: 1.45 })}
          ${lightButton("Primary action", x + 70, 720, 152)}`,
      );
    })
    .join("");
  return shell(screen, body);
}

function mobileBoard(screen, state) {
  const body =
    state === "before"
      ? `${text(screen.kicker.toUpperCase(), 18, 116, { size: 11, fill: "#2457ff", weight: 900, spacing: 1 })}
        ${text(screen.title, 18, 160, { size: 26, fill: "#0f172a", weight: 850, width: 350, lineHeight: 1.1 })}
        ${card(18, 220, 354, 500, `${image(screen.art, 58, 248, 274, 180)}${text(screen.value, 48, 480, { size: 18, fill: "#0f172a", weight: 850, width: 294, lineHeight: 1.18 })}${button(screen.cta, 48, 620, 294)}`, { rx: 22 })}`
      : mobileAfter(screen);
  return svg(
    390,
    844,
    `${rect(0, 0, 390, 76, "rgba(255,255,255,0.78)", { stroke: "#e7edf2" })}
      ${rect(18, 18, 40, 40, "url(#buttonGrad)", { rx: 14 })}
      ${text("R", 38, 44, { size: 16, fill: "#ffffff", weight: 900, anchor: "middle" })}
      ${text(screen.name, 72, 36, { size: 14, fill: "#0f172a", weight: 850 })}
      ${text("BrightSmile Dental", 72, 54, { size: 11, fill: "#64748b", weight: 700 })}
      ${rect(334, 19, 38, 38, "#ffffff", { rx: 19, stroke: "#e7edf2" })}
      ${text("!", 353, 44, { size: 13, fill: "#64748b", weight: 900, anchor: "middle" })}
      ${body}`,
  );
}

function mobileAfter(screen) {
  if (screen.id === "dashboard") {
    return `${text(screen.kicker.toUpperCase(), 18, 116, { size: 11, fill: "#2457ff", weight: 900, spacing: 1 })}
      ${text(screen.title, 18, 160, { size: 26, fill: "#0f172a", weight: 850, width: 350, lineHeight: 1.1 })}
      ${rect(18, 216, 354, 150, "url(#tealBlue)", { rx: 22, filter: "url(#blueShadow)" })}
      ${score(42, 236, "91")}
      ${text("Visibility strong", 166, 274, { size: 20, fill: "#ffffff", weight: 850 })}
      ${text("3 locations improving", 166, 298, { size: 12, fill: "rgba(255,255,255,0.76)", weight: 700 })}
      ${metric("Average rating", "4.82", "+0.12", 18, 390, 354)}
      ${metric("Response rate", "96%", "+8%", 18, 520, 354)}
      ${card(18, 650, 354, 150, `${text("AI briefing", 42, 694, { size: 16, fill: "#0f172a", weight: 850 })}${text("North Auto needs two replies approved today.", 42, 730, { size: 14, fill: "#64748b", width: 290 })}`, { rx: 22 })}`;
  }
  if (screen.id === "reviews") {
    return `${text(screen.kicker.toUpperCase(), 18, 116, { size: 11, fill: "#2457ff", weight: 900, spacing: 1 })}
      ${text(screen.title, 18, 160, { size: 26, fill: "#0f172a", weight: 850, width: 350, lineHeight: 1.1 })}
      ${pill("All", 18, 220, { width: 54 })}${pill("Needs reply", 82, 220, { width: 100 })}${pill("5 star", 192, 220, { width: 72 })}
      ${rows(dataRows.reviews.slice(0, 3), 18, 272, 354, { rowH: 74 })}`;
  }
  return `${text(screen.kicker.toUpperCase(), 18, 116, { size: 11, fill: "#2457ff", weight: 900, spacing: 1 })}
    ${text(screen.title, 18, 160, { size: 26, fill: "#0f172a", weight: 850, width: 350, lineHeight: 1.1 })}
    ${rows([["Maya Patel", "Can I move my appointment?", "Live"], ["AI reply", "Monday has two openings", "Ready"], ["Context", "Promoter, 3 visits", "VIP"]], 18, 232, 354, { rowH: 74 })}
    ${card(18, 510, 354, 170, `${text("AI reply is ready", 42, 560, { size: 17, fill: "#0f172a", weight: 850 })}${text("The suggestion uses the contact timeline and appointment context.", 42, 596, { size: 14, fill: "#64748b", width: 290, lineHeight: 1.45 })}${button("Approve reply", 42, 628, 160)}`, { rx: 22 })}`;
}

async function exportPng(fileName, svgSource) {
  const outPath = join(outDir, fileName);
  await sharp(Buffer.from(svgSource)).png().toFile(outPath);
  const size = statSync(outPath).size;
  if (size < 10_000) {
    throw new Error(`Export for ${fileName} looks too small (${size} bytes).`);
  }
  console.log(fileName);
}

for (const screen of screens) {
  const before = screen.id === "auth" ? authBoard(screen, "before") : screen.id === "marketing-home" ? marketingBoard(screen, "before") : beforeBoard(screen);
  const after = afterBoard(screen);
  await exportPng(`${screen.id}-before.png`, before);
  await exportPng(`${screen.id}-after.png`, after);
}

for (const screenId of ["dashboard", "reviews", "inbox"]) {
  const screen = screens.find((item) => item.id === screenId);
  await exportPng(`${screenId}-mobile-before.png`, mobileBoard(screen, "before"));
  await exportPng(`${screenId}-mobile-after.png`, mobileBoard(screen, "after"));
}

const exported = readdirSync(outDir).filter((name) => name.endsWith(".png"));
console.log(`Exported ${exported.length} PNG files to ${outDir}`);

import { mkdirSync, statSync } from "node:fs";
import { openSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outDir = resolve(root, "tasks/redesign-preview");
const runtimeRequire = createRequire(resolve(root, ".pdf-build/package.json"));
const puppeteer = runtimeRequire("puppeteer");

const baseUrl = process.env.PREVIEW_BASE_URL ?? "http://localhost:3107";
const shots = [
  {
    file: "00-kitchen-sink.png",
    height: 1100,
    route: "/kitchen-sink",
    width: 1440,
  },
  {
    file: "00-product-map.png",
    height: 1000,
    route: "/design-preview",
    width: 1440,
  },
  ...[
    ["01-auth", "/design-preview/auth"],
    ["02-onboarding", "/design-preview/onboarding"],
    ["03-dashboard", "/design-preview/dashboard"],
    ["04-reviews-inbox", "/design-preview/reviews-inbox"],
    ["05-campaigns", "/design-preview/campaigns"],
    ["06-sentiment", "/design-preview/sentiment"],
    ["07-analytics", "/design-preview/analytics"],
    ["08-widgets", "/design-preview/widgets"],
    ["09-locations", "/design-preview/locations"],
    ["10-team", "/design-preview/team"],
    ["11-integrations", "/design-preview/integrations"],
    ["12-settings", "/design-preview/settings"],
    ["13-billing", "/design-preview/billing"],
    ["14-system", "/design-preview/system"],
  ].map(([name, route]) => ({
    file: `${name}.png`,
    height: 1000,
    route,
    width: 1440,
  })),
  ...[
    ["03-dashboard-mobile", "/design-preview/dashboard"],
    ["04-reviews-inbox-mobile", "/design-preview/reviews-inbox"],
    ["13-billing-mobile", "/design-preview/billing"],
  ].map(([name, route]) => ({
    file: `${name}.png`,
    height: 900,
    route,
    width: 375,
  })),
];

mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function waitForServer(url) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      await sleep(1_000);
    }
  }
  throw new Error(`Preview server did not become ready at ${url}`);
}

let serverProcess;
if (process.env.PREVIEW_START_SERVER === "1") {
  const out = openSync(resolve(outDir, "preview-server.out.log"), "w");
  const err = openSync(resolve(outDir, "preview-server.err.log"), "w");
  serverProcess = spawn(
    "cmd.exe",
    ["/d", "/s", "/c", ".\\node_modules\\.bin\\next.cmd start -p 3107"],
    {
      cwd: root,
      stdio: ["ignore", out, err],
      windowsHide: true,
    },
  );
  await waitForServer(new URL("/design-preview", baseUrl).toString());
}

const browser = await puppeteer.launch({
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  headless: true,
});

try {
  for (const shot of shots) {
    const page = await browser.newPage();
    await page.setViewport({
      deviceScaleFactor: 2,
      height: shot.height,
      width: shot.width,
    });
    const url = new URL(shot.route, baseUrl).toString();
    await page.goto(url, { timeout: 60_000, waitUntil: "networkidle2" });
    await page.waitForSelector(".rl-theme", { timeout: 30_000 });
    await page.screenshot({
      fullPage: true,
      path: resolve(outDir, shot.file),
    });
    const size = statSync(resolve(outDir, shot.file)).size;
    if (size < 20_000) {
      throw new Error(`${shot.file} looks too small (${size} bytes).`);
    }
    console.log(`${shot.file} (${shot.width}px)`);
    await page.close();
  }
} finally {
  await browser.close();
  if (serverProcess) {
    serverProcess.kill();
  }
}

console.log(`Saved ${shots.length} screenshot(s) to ${outDir}`);

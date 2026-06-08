import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("public", "assets", "repulabs");
const iconDir = path.join(root, "icons");
const illustrationDir = path.join(root, "illustrations");

await mkdir(iconDir, { recursive: true });
await mkdir(illustrationDir, { recursive: true });

const icon = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${body}</svg>\n`;

const icons = {
  home: icon('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>'),
  grid: icon(
    '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  ),
  building: icon(
    '<path d="M4 21h16"/><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M10 7h.01"/><path d="M14 7h.01"/><path d="M10 11h.01"/><path d="M14 11h.01"/><path d="M10 15h.01"/><path d="M14 15h.01"/><path d="M10 21v-3h4v3"/>',
  ),
  box: icon(
    '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z"/><path d="M3.5 7.5 12 12l8.5-4.5"/><path d="M12 12v9"/>',
  ),
  star: icon(
    '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.9l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
  ),
  send: icon('<path d="M21 3 10.5 13.5"/><path d="M21 3 14.5 21l-4-7.5L3 9.5 21 3Z"/>'),
  sparkle: icon(
    '<path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="m7.8 7.8 2.8 2.8"/><path d="m13.4 13.4 2.8 2.8"/><path d="m16.2 7.8-2.8 2.8"/><path d="m10.6 13.4-2.8 2.8"/>',
  ),
  chat: icon('<path d="M21 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-5 3 1.4-5A7.5 7.5 0 1 1 21 11.5Z"/>'),
  share: icon(
    '<circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5"/><path d="m8 13 8 5"/>',
  ),
  survey: icon(
    '<path d="M9 4h6"/><path d="M10 3h4a1 1 0 0 1 1 1v1H9V4a1 1 0 0 1 1-1Z"/><rect x="5" y="5" width="14" height="16" rx="2"/><path d="m8 12 2 2 4-4"/><path d="M8 17h8"/>',
  ),
  flag: icon('<path d="M5 22V4"/><path d="M5 4h12l-1.5 4L17 12H5"/>'),
  brain: icon(
    '<path d="M10 4a4 4 0 0 0-4 4v2.5L4 14v3h3v3h4v-3h2a6 6 0 0 0 6-6v-1a6 6 0 0 0-6-6h-3Z"/><path d="M10 8a3 3 0 0 1 3-3"/><path d="M10 12a3 3 0 0 0 3 3"/><path d="M14 9a3 3 0 0 1 3 3"/>',
  ),
  phone: icon(
    '<path d="M22 16.9v2.2a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 3.4 2 2 0 0 1 4.1 1.2h2.2a2 2 0 0 1 2 1.7l.4 2.7a2 2 0 0 1-.6 1.8L7 8.5a16 16 0 0 0 6.5 6.5l1.1-1.1a2 2 0 0 1 1.8-.6l2.7.4a2 2 0 0 1 1.7 2Z"/>',
  ),
  settings: icon(
    '<path d="M12 2v3"/><path d="M12 19v3"/><path d="M4.9 4.9 7 7"/><path d="m17 17 2.1 2.1"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="M4.9 19.1 7 17"/><path d="m17 7 2.1-2.1"/><circle cx="12" cy="12" r="4"/>',
  ),
  plug: icon(
    '<path d="M8 2v6"/><path d="M16 2v6"/><path d="M6 8h12v4a6 6 0 0 1-6 6v4"/><path d="M9 22h6"/>',
  ),
  card: icon(
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/><path d="M15 15h2"/>',
  ),
  lock: icon(
    '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  ),
  plus: icon('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  minus: icon('<path d="M5 12h14"/>'),
  chevR: icon('<path d="m9 18 6-6-6-6"/>'),
  chevD: icon('<path d="m6 9 6 6 6-6"/>'),
  chevU: icon('<path d="m6 15 6-6 6 6"/>'),
  chevL: icon('<path d="m15 18-6-6 6-6"/>'),
  arrowR: icon('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
  arrowU: icon('<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>'),
  arrowD: icon('<path d="M12 5v14"/><path d="m18 13-6 6-6-6"/>'),
  arrowUR: icon('<path d="M7 17 17 7"/><path d="M9 7h8v8"/>'),
  arrowDR: icon('<path d="M7 7 17 17"/><path d="M17 9v8H9"/>'),
  search: icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
  bell: icon(
    '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  ),
  menu: icon('<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>'),
  filter: icon('<path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z"/>'),
  sliders: icon(
    '<path d="M4 6h7"/><path d="M15 6h5"/><path d="M4 12h4"/><path d="M12 12h8"/><path d="M4 18h10"/><path d="M18 18h2"/><circle cx="13" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  ),
  download: icon('<path d="M12 3v11"/><path d="m7 9 5 5 5-5"/><path d="M5 18v2h14v-2"/>'),
  upload: icon('<path d="M12 14V3"/><path d="m7 8 5-5 5 5"/><path d="M5 18v2h14v-2"/>'),
  qr: icon(
    '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M15 15h1"/><path d="M20 15h-1v4"/><path d="M14 20h2"/><path d="M20 20h.01"/>',
  ),
  edit: icon('<path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
  trash: icon(
    '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/><path d="M10 11v5"/><path d="M14 11v5"/>',
  ),
  check: icon('<path d="m5 12 5 5L20 7"/>'),
  checkCircle: icon('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'),
  x: icon('<path d="M6 6l12 12"/><path d="M18 6 6 18"/>'),
  xCircle: icon('<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>'),
  clock: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  cal: icon(
    '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M4 10h16"/>',
  ),
  play: icon('<path d="M8 5v14l11-7-11-7Z"/>'),
  pause: icon('<path d="M8 5v14"/><path d="M16 5v14"/>'),
  pause2: icon(
    '<rect x="7" y="5" width="3" height="14" rx="1"/><rect x="14" y="5" width="3" height="14" rx="1"/>',
  ),
  sound: icon(
    '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M17 9.5a4 4 0 0 1 0 5"/><path d="M20 7a8 8 0 0 1 0 10"/>',
  ),
  image: icon(
    '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="1.5"/><path d="m5 17 4.5-4.5 3.5 3.5 2-2 4 3"/>',
  ),
  user: icon('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  users: icon(
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 21a7 7 0 0 1 13 0"/><path d="M16 11a3.5 3.5 0 0 0 0-6"/><path d="M18 21a6 6 0 0 0-4-5.5"/>',
  ),
  pin: icon(
    '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  ),
  eye: icon(
    '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  ),
  eyeOff: icon(
    '<path d="m3 3 18 18"/><path d="M10.6 10.6a3 3 0 0 0 4 4"/><path d="M9.5 5.8A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3 4"/><path d="M6.1 6.8A19.4 19.4 0 0 0 2 12s3.5 7 10 7a10.8 10.8 0 0 0 4-.8"/>',
  ),
  reply: icon('<path d="M10 8 4 14l6 6"/><path d="M4 14h10a6 6 0 0 0 6-6V5"/>'),
  bot: icon(
    '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 8V4"/><path d="M9 4h6"/><path d="M9 13h.01"/><path d="M15 13h.01"/><path d="M9 17h6"/>',
  ),
  hash: icon(
    '<path d="M10 3 8 21"/><path d="M16 3l-2 18"/><path d="M4 9h17"/><path d="M3 15h17"/>',
  ),
  grip: icon(
    '<circle cx="8" cy="6" r="1"/><circle cx="16" cy="6" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="18" r="1"/><circle cx="16" cy="18" r="1"/>',
  ),
  bolt: icon('<path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z"/>'),
  target: icon(
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  ),
  trend: icon('<path d="M3 17h18"/><path d="m5 15 5-5 4 4 6-7"/><path d="M15 7h5v5"/>'),
  pie: icon(
    '<path d="M12 3v9h9"/><path d="M20.5 15a9 9 0 1 1-11.5-11.5"/><path d="M14 3.3A9 9 0 0 1 20.7 10"/>',
  ),
  bars: icon(
    '<path d="M4 20h16"/><rect x="6" y="12" width="3" height="8" rx="1"/><rect x="11" y="8" width="3" height="12" rx="1"/><rect x="16" y="4" width="3" height="16" rx="1"/>',
  ),
  mail: icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/>'),
  smartphone: icon('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'),
  info: icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7h.01"/>'),
  alert: icon('<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5"/><path d="M12 18h.01"/>'),
  help: icon(
    '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.7 2.7 0 0 1 5.1 1.3c0 2-2.6 2.2-2.6 4.2"/><path d="M12 18h.01"/>',
  ),
  move: icon(
    '<path d="M12 2v20"/><path d="m8 6 4-4 4 4"/><path d="m8 18 4 4 4-4"/><path d="M2 12h20"/><path d="m6 8-4 4 4 4"/><path d="m18 8 4 4-4 4"/>',
  ),
  refresh: icon(
    '<path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18 9a7 7 0 0 0-11.6-3"/><path d="M6 15a7 7 0 0 0 11.6 3"/>',
  ),
  archive: icon(
    '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8"/><path d="M10 12h4"/>',
  ),
  ext: icon(
    '<path d="M14 4h6v6"/><path d="m10 14 10-10"/><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/>',
  ),
  copy: icon(
    '<rect x="8" y="8" width="12" height="12" rx="2"/><rect x="4" y="4" width="12" height="12" rx="2"/>',
  ),
  triangleR: icon('<path d="M9 7v10l7-5-7-5Z"/>'),
};

const illustration = (body) =>
  `<svg viewBox="0 0 256 220" fill="none" xmlns="http://www.w3.org/2000/svg">${body}</svg>\n`;

const cloud = (x, y) =>
  `<path d="M${x} ${y + 10}c0-7 5-12 12-12 4 0 8 2 10 5 2-1 4-2 7-2 6 0 11 5 11 11s-5 10-11 10H${x + 12}c-7 0-12-5-12-12Z" fill="#EFF6FF"/>`;
const sparkle = (x, y, c = "#F59E0B") =>
  `<path d="M${x} ${y - 7}l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="${c}"/>`;
const dot = (x, y, c = "#2563EB", r = 3) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
const line = (d, c = "#0F172A", w = 2) =>
  `<path d="${d}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const rect = (x, y, w, h, rx, f, s = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${f}"${s ? ` stroke="${s}" stroke-width="2"` : ""}/>`;
const circle = (x, y, r, f, s = "") =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}"${s ? ` stroke="${s}" stroke-width="2"` : ""}/>`;
const star = (x, y, r, f) =>
  `<path d="M${x} ${y - r}l${(r * 0.32).toFixed(1)} ${(r * 0.66).toFixed(1)} ${(r * 0.73).toFixed(1)} ${(r * 0.1).toFixed(1)}-${(r * 0.53).toFixed(1)} ${(r * 0.5).toFixed(1)} ${(r * 0.13).toFixed(1)} ${(r * 0.72).toFixed(1)}-${(r * 0.65).toFixed(1)}-${(r * 0.35).toFixed(1)}-${(r * 0.65).toFixed(1)} ${(r * 0.35).toFixed(1)} ${(r * 0.13).toFixed(1)}-${(r * 0.72).toFixed(1)}-${(r * 0.53).toFixed(1)}-${(r * 0.5).toFixed(1)} ${(r * 0.73).toFixed(1)}-${(r * 0.1).toFixed(1)}L${x} ${y - r}Z" fill="${f}"/>`;
const phoneShape = (x, y, w, h) =>
  `${rect(x, y, w, h, 12, "#FFFFFF", "#0F172A")}<rect x="${x + 8}" y="${y + 12}" width="${w - 16}" height="${h - 28}" rx="8" fill="#EFF6FF"/><circle cx="${x + w / 2}" cy="${y + h - 10}" r="2" fill="#0F172A"/>`;

const illustrations = {
  "dashboard-welcome": illustration(
    `${cloud(31, 34)}${cloud(184, 28)}${rect(76, 42, 92, 128, 14, "#FFFFFF", "#0F172A")}<rect x="94" y="30" width="56" height="20" rx="10" fill="#E0E7FF" stroke="#0F172A" stroke-width="2"/><path d="M98 128l20-22 18 13 28-40" stroke="#2563EB" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M98 128l20-22 18 13 28-40" stroke="#0F172A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="176" cy="142" r="23" fill="#EFF6FF" stroke="#0F172A" stroke-width="2"/><path d="M193 159l16 16" stroke="#0F172A" stroke-width="8" stroke-linecap="round"/><path d="M193 159l16 16" stroke="#2563EB" stroke-width="4" stroke-linecap="round"/><path d="M58 150c0 12 15 27 15 27s15-15 15-27a15 15 0 1 0-30 0Z" fill="#4F46E5"/><circle cx="73" cy="150" r="5" fill="#FFFFFF"/>${sparkle(198, 62)}${sparkle(55, 91, "#4F46E5")}${dot(48, 184)}${dot(205, 95, "#16A34A", 3)}`,
  ),
  "reviews-empty": illustration(
    `<path d="M54 62h122c22 0 39 16 39 36s-17 36-39 36h-52l-38 32 8-32H54c-20 0-36-16-36-36s16-36 36-36Z" fill="#EFF6FF" stroke="#0F172A" stroke-width="2"/><path d="M116 76l9 19 21 3-15 14 4 21-19-10-19 10 4-21-15-14 21-3 9-19Z" fill="#F59E0B" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><path d="M178 38h31c10 0 18 7 18 16s-8 16-18 16h-10l-13 11 3-11h-11c-9 0-16-7-16-16s7-16 16-16Z" fill="#E0E7FF" stroke="#0F172A" stroke-width="2"/><path d="M48 32h28c9 0 16 7 16 15s-7 15-16 15H64l-13 10 3-10h-6c-9 0-16-7-16-15s7-15 16-15Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/>${star(196, 54, 9, "#F59E0B")}${star(62, 47, 7, "#F59E0B")}${dot(46, 170)}${dot(212, 112, "#2563EB", 3)}${dot(199, 147, "#4F46E5", 4)}${dot(34, 119, "#F59E0B", 3)}`,
  ),
  "requests-empty": illustration(
    `<path d="M49 83h158v88H49V83Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><path d="M49 84l79 62 79-62" fill="#EFF6FF"/><path d="M49 84l79 62 79-62" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><path d="M109 76l102-38-38 102-20-42-44-22Z" fill="#E0E7FF" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><path d="M211 38l-58 60" stroke="#2563EB" stroke-width="6" stroke-linecap="round"/><path d="M76 47c18-16 45-18 66-7" stroke="#2563EB" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 10"/>${sparkle(222, 31)}${dot(68, 53, "#4F46E5")}${dot(39, 143, "#16A34A", 3)}`,
  ),
  "responses-empty": illustration(
    `<path d="M46 65h105c15 0 27 12 27 27s-12 27-27 27h-35l-28 23 6-23H46c-15 0-27-12-27-27s12-27 27-27Z" fill="#EFF6FF" stroke="#0F172A" stroke-width="2"/><path d="M101 93h109c16 0 29 13 29 29s-13 29-29 29h-40l-31 26 7-26h-45c-16 0-29-13-29-29s13-29 29-29Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/>${sparkle(145, 121, "#4F46E5")}<path d="M187 108l-14 22h11l-4 18 18-25h-12l1-15Z" fill="#F59E0B" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/>${dot(48, 41)}${dot(215, 73, "#16A34A", 3)}${dot(34, 162, "#F59E0B", 3)}`,
  ),
  "disputes-empty": illustration(
    `<path d="M128 32l68 25v47c0 44-29 70-68 84-39-14-68-40-68-84V57l68-25Z" fill="#E0E7FF" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><path d="M95 106l24 24 44-52" stroke="#16A34A" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="M95 106l24 24 44-52" stroke="#0F172A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M45 42v54" stroke="#0F172A" stroke-width="2" stroke-linecap="round"/><path d="M45 44h48l-6 15 6 15H45" fill="#F59E0B" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><rect x="148" y="126" width="55" height="38" rx="8" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><circle cx="205" cy="154" r="21" fill="#EFF6FF" stroke="#0F172A" stroke-width="2"/><path d="M220 169l14 14" stroke="#0F172A" stroke-width="6" stroke-linecap="round"/>${dot(55, 144)}${sparkle(207, 53)}`,
  ),
  "surveys-empty": illustration(
    `${rect(62, 38, 132, 142, 16, "#FFFFFF", "#0F172A")}<rect x="94" y="26" width="68" height="24" rx="12" fill="#E0E7FF" stroke="#0F172A" stroke-width="2"/>${rect(82, 70, 18, 18, 5, "#EFF6FF", "#0F172A")}${rect(82, 104, 18, 18, 5, "#EFF6FF", "#0F172A")}${rect(82, 138, 18, 18, 5, "#EFF6FF", "#0F172A")}${line("M86 79l4 4 8-10", "#16A34A", 4)}${line("M111 79h52")}${line("M111 113h43")}${line("M111 147h52")}${[76, 101, 126, 151, 176].map((x, i) => circle(x, 196, 8, i < 4 ? "#2563EB" : "#E0E7FF", "#0F172A")).join("")}<circle cx="176" cy="112" r="18" fill="#F59E0B" stroke="#0F172A" stroke-width="2"/><path d="M168 109h.01M184 109h.01" stroke="#0F172A" stroke-width="3" stroke-linecap="round"/><path d="M169 117c5 5 11 5 16 0" stroke="#0F172A" stroke-width="2" stroke-linecap="round"/>${sparkle(210, 59, "#4F46E5")}${dot(41, 112)}`,
  ),
  "insights-empty": illustration(
    `${rect(42, 45, 172, 122, 18, "#FFFFFF", "#0F172A")}<rect x="63" y="109" width="20" height="36" rx="5" fill="#2563EB"/><rect x="93" y="88" width="20" height="57" rx="5" fill="#4F46E5"/><rect x="123" y="67" width="20" height="78" rx="5" fill="#16A34A"/><path d="M173 71a34 34 0 1 1-24 10" stroke="#E2E8F0" stroke-width="14" stroke-linecap="round"/><path d="M173 71a34 34 0 0 1 31 36" stroke="#F59E0B" stroke-width="14" stroke-linecap="round"/><path d="M54 183h55l18-22 22 14 28-35" stroke="#2563EB" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M167 140h10v10" stroke="#2563EB" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>${dot(31, 81, "#F59E0B")}${sparkle(217, 54, "#4F46E5")}`,
  ),
  "messages-empty": illustration(
    `<path d="M44 44h62c13 0 24 10 24 23s-11 23-24 23H87l-18 15 4-15H44c-13 0-24-10-24-23s11-23 24-23Z" fill="#E0E7FF" stroke="#0F172A" stroke-width="2"/><path d="M154 54h58c13 0 24 10 24 23s-11 23-24 23h-26l-20 16 5-16h-17c-13 0-24-10-24-23s11-23 24-23Z" fill="#EFF6FF" stroke="#0F172A" stroke-width="2"/><path d="M77 104h102c15 0 28 11 28 25s-13 25-28 25h-33l-24 20 5-20H77c-15 0-28-11-28-25s13-25 28-25Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><path d="M58 166h140l-14 24H72l-14-24Z" fill="#2563EB" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><path d="M96 128h65" stroke="#E2E8F0" stroke-width="8" stroke-linecap="round"/>${dot(38, 122, "#F59E0B")}${dot(218, 132, "#16A34A")}${sparkle(128, 33)}`,
  ),
  "social-empty": illustration(
    `${rect(56, 43, 104, 125, 14, "#FFFFFF", "#0F172A")}<path d="M56 69h104" stroke="#0F172A" stroke-width="2"/><path d="M78 33v22M138 33v22" stroke="#0F172A" stroke-width="6" stroke-linecap="round"/><rect x="75" y="87" width="66" height="45" rx="8" fill="#EFF6FF" stroke="#0F172A" stroke-width="2"/><circle cx="92" cy="103" r="6" fill="#F59E0B"/><path d="M80 126l20-17 13 11 12-9 13 15" fill="#E0E7FF"/><path d="M80 126l20-17 13 11 12-9 13 15" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><path d="M167 111l49-18v64l-49-18v-28Z" fill="#2563EB" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><path d="M158 111h15v28h-15a13 13 0 0 1-13-13v-2a13 13 0 0 1 13-13Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><path d="M191 158l23 18" stroke="#4F46E5" stroke-width="6" stroke-linecap="round"/>${sparkle(213, 65)}${sparkle(41, 136, "#4F46E5")}${dot(36, 71)}`,
  ),
  "ai-assistant": illustration(
    `<rect x="70" y="62" width="116" height="92" rx="28" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><path d="M128 62V35" stroke="#0F172A" stroke-width="2" stroke-linecap="round"/><circle cx="128" cy="30" r="7" fill="#4F46E5" stroke="#0F172A" stroke-width="2"/><circle cx="105" cy="104" r="10" fill="#2563EB"/><circle cx="151" cy="104" r="10" fill="#2563EB"/><path d="M108 128c13 10 27 10 40 0" stroke="#0F172A" stroke-width="3" stroke-linecap="round"/><path d="M76 94H53a13 13 0 0 0-13 13v14a13 13 0 0 0 13 13h12l16 13-3-13" fill="#EFF6FF" stroke="#0F172A" stroke-width="2"/><path d="M180 90h24a13 13 0 0 1 13 13v14a13 13 0 0 1-13 13h-12l-16 13 3-13" fill="#E0E7FF" stroke="#0F172A" stroke-width="2"/>${sparkle(86, 42)}${sparkle(178, 48, "#4F46E5")}${dot(56, 166, "#16A34A")}${dot(205, 162, "#F59E0B")}`,
  ),
  "phone-empty": illustration(
    `${phoneShape(78, 29, 100, 162)}<path d="M100 102c5-10 10-10 15 0s10 10 15 0 10-10 15 0" stroke="#2563EB" stroke-width="8" stroke-linecap="round"/><path d="M101 134h54" stroke="#E2E8F0" stroke-width="8" stroke-linecap="round"/><path d="M101 154h30" stroke="#E2E8F0" stroke-width="8" stroke-linecap="round"/><rect x="142" y="145" width="62" height="30" rx="15" fill="#E0E7FF" stroke="#0F172A" stroke-width="2"/><path d="M157 154v12M157 159h30" stroke="#4F46E5" stroke-width="3" stroke-linecap="round"/>${sparkle(150, 77)}${dot(59, 75)}${dot(198, 91, "#16A34A")}`,
  ),
  "listings-empty": illustration(
    `<path d="M56 89h144v88H56V89Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><path d="M68 55h120l20 34H48l20-34Z" fill="#E0E7FF" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><path d="M48 89c8 12 24 12 32 0 8 12 24 12 32 0 8 12 24 12 32 0 8 12 24 12 32 0 8 12 24 12 32 0" fill="#2563EB"/><path d="M48 89c8 12 24 12 32 0 8 12 24 12 32 0 8 12 24 12 32 0 8 12 24 12 32 0 8 12 24 12 32 0" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><rect x="82" y="120" width="36" height="57" rx="5" fill="#EFF6FF" stroke="#0F172A" stroke-width="2"/><rect x="137" y="121" width="38" height="27" rx="6" fill="#EFF6FF" stroke="#0F172A" stroke-width="2"/><path d="M128 25c0 16-24 38-24 38S80 41 80 25a24 24 0 1 1 48 0Z" fill="#4F46E5"/><circle cx="104" cy="25" r="8" fill="#FFFFFF"/>${star(100, 149, 13, "#F59E0B")}${sparkle(204, 50)}${dot(40, 144, "#16A34A")}`,
  ),
  "qr-stands-empty": illustration(
    `<path d="M64 166h128l16 26H48l16-26Z" fill="#E2E8F0" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><path d="M78 53h70l22 113H56L78 53Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><rect x="88" y="78" width="42" height="42" rx="6" fill="#EFF6FF" stroke="#0F172A" stroke-width="2"/><rect x="96" y="86" width="10" height="10" rx="2" fill="#0F172A"/><rect x="112" y="86" width="10" height="10" rx="2" fill="#0F172A"/><rect x="96" y="102" width="10" height="10" rx="2" fill="#0F172A"/><path d="M116 104h8v8h-8M108 112h4" stroke="#0F172A" stroke-width="4" stroke-linecap="round"/><rect x="159" y="71" width="55" height="90" rx="12" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><path d="M145 91l-37 27 53 2" fill="#E0E7FF" opacity="0.8"/><path d="M176 112h22" stroke="#2563EB" stroke-width="5" stroke-linecap="round"/>${star(177, 44, 12, "#F59E0B")}${dot(36, 73)}${sparkle(217, 42, "#4F46E5")}`,
  ),
  "contacts-empty": illustration(
    `<path d="M39 55h80c13 0 23 10 23 23v90H62c-13 0-23-10-23-23V55Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><path d="M137 55h80v90c0 13-10 23-23 23h-57V55Z" fill="#EFF6FF" stroke="#0F172A" stroke-width="2"/><path d="M137 55v113" stroke="#0F172A" stroke-width="2"/><circle cx="79" cy="91" r="15" fill="#E0E7FF" stroke="#0F172A" stroke-width="2"/><path d="M59 126h55M59 146h43" stroke="#E2E8F0" stroke-width="8" stroke-linecap="round"/><circle cx="172" cy="92" r="14" fill="#F59E0B" stroke="#0F172A" stroke-width="2"/><path d="M158 127h43M158 147h32" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round"/><circle cx="207" cy="49" r="19" fill="#16A34A" stroke="#0F172A" stroke-width="2"/><path d="M207 39v20M197 49h20" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>${dot(45, 183)}${sparkle(207, 180)}`,
  ),
  "integrations-empty": illustration(
    `<path d="M72 60h54c0 14 18 14 18 0h40v45c-15 0-15 20 0 20v45h-54c0-14-18-14-18 0H72v-45c15 0 15-20 0-20V60Z" fill="#E0E7FF" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><path d="M92 79h40c0 13 18 13 18 0h34v36c-14 0-14 19 0 19v36h-40c0-13-18-13-18 0H92v-36c14 0 14-19 0-19V79Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><circle cx="52" cy="74" r="8" fill="#2563EB"/><circle cx="207" cy="74" r="8" fill="#4F46E5"/><circle cx="222" cy="139" r="8" fill="#16A34A"/><circle cx="47" cy="146" r="8" fill="#F59E0B"/><path d="M60 78c25-31 111-37 143-7M213 137c-19 34-121 42-159 11" stroke="#E2E8F0" stroke-width="3" stroke-linecap="round" stroke-dasharray="3 8"/>${sparkle(129, 43)}`,
  ),
  "billing-empty": illustration(
    `<rect x="45" y="67" width="129" height="82" rx="14" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><path d="M45 91h129" stroke="#0F172A" stroke-width="2"/><path d="M67 122h41M67 136h24" stroke="#E2E8F0" stroke-width="8" stroke-linecap="round"/><path d="M141 48h58l14 101h-58L141 48Z" fill="#EFF6FF" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><path d="M157 75h31M160 98h27M163 121h21" stroke="#0F172A" stroke-width="2" stroke-linecap="round"/><circle cx="186" cy="156" r="23" fill="#16A34A" stroke="#0F172A" stroke-width="2"/><path d="M175 156l8 8 16-18" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>${sparkle(64, 46)}${dot(211, 67)}${dot(40, 156, "#F59E0B")}`,
  ),
  settings: illustration(
    `<circle cx="113" cy="111" r="48" fill="#E0E7FF" stroke="#0F172A" stroke-width="2"/><path d="M113 47v20M113 155v20M68 66l14 14M144 142l14 14M49 111h20M157 111h20M68 156l14-14M144 80l14-14" stroke="#0F172A" stroke-width="8" stroke-linecap="round"/><circle cx="113" cy="111" r="20" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><rect x="169" y="70" width="52" height="86" rx="18" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><path d="M184 94h26M184 132h26" stroke="#E2E8F0" stroke-width="8" stroke-linecap="round"/><circle cx="190" cy="94" r="7" fill="#2563EB" stroke="#0F172A" stroke-width="2"/><circle cx="205" cy="132" r="7" fill="#4F46E5" stroke="#0F172A" stroke-width="2"/>${sparkle(54, 57)}${dot(214, 177, "#16A34A")}`,
  ),
  success: illustration(
    `<rect x="57" y="48" width="142" height="116" rx="18" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><circle cx="128" cy="104" r="38" fill="#16A34A" stroke="#0F172A" stroke-width="2"/><path d="M109 104l13 13 27-31" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M180 151h39l-7 35h-25l-7-35Z" fill="#F59E0B" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><path d="M189 151v-11h21v11" stroke="#0F172A" stroke-width="2"/><path d="M181 159c-13 0-16-16-4-20M218 159c13 0 16-16 4-20" stroke="#0F172A" stroke-width="2" stroke-linecap="round"/>${dot(50, 55)}${dot(210, 55, "#4F46E5")}${dot(41, 142, "#F59E0B")}${sparkle(63, 180)}`,
  ),
  processing: illustration(
    `<rect x="48" y="51" width="160" height="118" rx="18" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><rect x="74" y="82" width="107" height="12" rx="6" fill="#E2E8F0"/><rect x="74" y="82" width="74" height="12" rx="6" fill="#2563EB"/><rect x="74" y="112" width="107" height="12" rx="6" fill="#E2E8F0"/><rect x="74" y="112" width="52" height="12" rx="6" fill="#4F46E5"/><rect x="74" y="142" width="107" height="12" rx="6" fill="#E2E8F0"/><rect x="74" y="142" width="89" height="12" rx="6" fill="#16A34A"/><circle cx="202" cy="87" r="20" fill="#EFF6FF" stroke="#0F172A" stroke-width="2"/><circle cx="202" cy="67" r="5" fill="#2563EB"/><circle cx="220" cy="87" r="5" fill="#4F46E5"/><circle cx="202" cy="107" r="5" fill="#F59E0B"/>${sparkle(54, 40)}${sparkle(217, 144, "#4F46E5")}`,
  ),
  "not-found": illustration(
    `<rect x="71" y="62" width="117" height="87" rx="16" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><path d="M95 106h67" stroke="#E2E8F0" stroke-width="12" stroke-linecap="round"/><path d="M104 133h49" stroke="#E2E8F0" stroke-width="8" stroke-linecap="round"/><path d="M61 77v32c0 16 13 29 29 29" stroke="#0F172A" stroke-width="6" stroke-linecap="round"/><path d="M47 61v21M75 61v21" stroke="#0F172A" stroke-width="6" stroke-linecap="round"/><path d="M43 82h36v13a18 18 0 0 1-36 0V82Z" fill="#E0E7FF" stroke="#0F172A" stroke-width="2"/><circle cx="178" cy="144" r="26" fill="#EFF6FF" stroke="#0F172A" stroke-width="2"/><path d="M197 163l17 17" stroke="#0F172A" stroke-width="7" stroke-linecap="round"/><path d="M191 54h34c8 0 14 6 14 14s-6 14-14 14h-12l-12 10 3-10h-13c-8 0-14-6-14-14s6-14 14-14Z" fill="#F59E0B" stroke="#0F172A" stroke-width="2"/><path d="M207 64c1-5 11-5 11 1 0 6-8 5-8 12M210 82h.01" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>${dot(44, 159)}${sparkle(67, 42, "#4F46E5")}`,
  ),
  error: illustration(
    `<rect x="54" y="55" width="148" height="113" rx="18" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><path d="M128 72l47 82H81l47-82Z" fill="#F59E0B" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><path d="M128 101v25M128 138h.01" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round"/><path d="M191 41l14 14 22-22 10 10-22 22 14 14-12 12-38-38 12-12Z" fill="#E0E7FF" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/>${dot(50, 80)}${dot(207, 163, "#16A34A")}${sparkle(70, 180, "#4F46E5")}`,
  ),
  upgrade: illustration(
    `<path d="M129 39c28 15 42 40 39 74l-27 27-25-25-25-25 27-27c4-10 7-18 11-24Z" fill="#E0E7FF" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><circle cx="141" cy="78" r="12" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><path d="M91 90l-31 4 33 19M141 140l19 33 4-31" fill="#2563EB" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><path d="M92 134c-12 5-21 15-26 29 14-5 24-14 29-26" stroke="#F59E0B" stroke-width="7" stroke-linecap="round"/><rect x="177" y="132" width="48" height="38" rx="9" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><path d="M188 132v-9a12 12 0 0 1 23-4" stroke="#0F172A" stroke-width="2" stroke-linecap="round"/>${sparkle(188, 53)}${dot(54, 62, "#4F46E5")}${dot(207, 96, "#16A34A")}`,
  ),
  "login-hero": illustration(
    `<circle cx="128" cy="105" r="72" fill="#EFF6FF"/><circle cx="147" cy="91" r="52" fill="#E0E7FF"/>${cloud(28, 55)}${cloud(179, 140)}<rect x="55" y="79" width="54" height="42" rx="12" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/>${star(82, 100, 13, "#F59E0B")}<path d="M136 46h61c13 0 23 10 23 23s-10 23-23 23h-19l-20 16 5-16h-27c-13 0-23-10-23-23s10-23 23-23Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><path d="M149 69h39" stroke="#2563EB" stroke-width="7" stroke-linecap="round"/><rect x="102" y="122" width="78" height="57" rx="14" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><rect x="119" y="151" width="9" height="14" rx="3" fill="#2563EB"/><rect x="135" y="139" width="9" height="26" rx="3" fill="#4F46E5"/><rect x="151" y="129" width="9" height="36" rx="3" fill="#16A34A"/>${sparkle(207, 115)}${sparkle(41, 138, "#4F46E5")}${dot(46, 42)}`,
  ),
  "onboarding-steps": illustration(
    `<path d="M68 112c36-51 84-51 120 0" stroke="#E2E8F0" stroke-width="5" stroke-linecap="round" stroke-dasharray="4 10"/><circle cx="60" cy="124" r="31" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><path d="M51 107v16M69 107v16M48 123h24v8a12 12 0 0 1-24 0v-8Z" fill="#E0E7FF" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><circle cx="128" cy="74" r="31" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/><path d="M143 58l-38 14 28 13 10-27Z" fill="#2563EB" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/><path d="M143 58l-14 22" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/><circle cx="196" cy="124" r="31" fill="#FFFFFF" stroke="#0F172A" stroke-width="2"/>${sparkle(196, 124)}<circle cx="60" cy="174" r="10" fill="#2563EB"/><circle cx="128" cy="174" r="10" fill="#4F46E5"/><circle cx="196" cy="174" r="10" fill="#16A34A"/><path d="M70 174h48M138 174h48" stroke="#0F172A" stroke-width="2" stroke-linecap="round"/>${dot(42, 57, "#F59E0B")}${sparkle(210, 61, "#4F46E5")}`,
  ),
};

for (const [name, svg] of Object.entries(icons)) {
  await writeFile(path.join(iconDir, `${name}.svg`), svg, "utf8");
}

for (const [name, svg] of Object.entries(illustrations)) {
  await writeFile(path.join(illustrationDir, `${name}.svg`), svg, "utf8");
}

const manifest = {
  brand: "Repulabs",
  icons: Object.keys(icons).map((name) => ({ name, path: `/assets/repulabs/icons/${name}.svg` })),
  skippedBrandIcons: ["google", "fb", "insta", "twitter", "linkedin"],
  illustrations: Object.keys(illustrations).map((name) => ({
    name,
    path: `/assets/repulabs/illustrations/${name}.svg`,
  })),
};

await writeFile(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const gallery = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Repulabs SVG Assets</title>
<style>
:root{color:#0F172A;background:#FFFFFF;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{margin:0;padding:32px;background:#F8FAFC}main{max-width:1180px;margin:0 auto}h1{font-size:28px;margin:0 0 8px}h2{font-size:18px;margin:32px 0 16px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(116px,1fr));gap:12px}.card{background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;padding:14px;min-height:98px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}.card img{display:block}.icon img{width:28px;height:28px}.illustration img{width:100%;max-width:180px;aspect-ratio:256/220;object-fit:contain}.name{font-size:12px;line-height:1.2;text-align:center;overflow-wrap:anywhere;color:#334155}.note{color:#475569;margin:0 0 24px;font-size:14px}
</style>
</head>
<body>
<main>
<h1>Repulabs SVG Assets</h1>
<p class="note">${Object.keys(icons).length} icons, ${Object.keys(illustrations).length} illustrations. Brand icons skipped: google, fb, insta, twitter, linkedin.</p>
<h2>Icons</h2>
<section class="grid">${Object.keys(icons)
  .map(
    (name) =>
      `<div class="card icon"><img src="icons/${name}.svg" alt="${name}"><div class="name">${name}</div></div>`,
  )
  .join("")}</section>
<h2>Illustrations</h2>
<section class="grid">${Object.keys(illustrations)
  .map(
    (name) =>
      `<div class="card illustration"><img src="illustrations/${name}.svg" alt="${name}"><div class="name">${name}</div></div>`,
  )
  .join("")}</section>
</main>
</body>
</html>
`;

await writeFile(path.join(root, "index.html"), gallery, "utf8");

console.log(
  `Generated ${Object.keys(icons).length} icons and ${Object.keys(illustrations).length} illustrations in ${root}`,
);

/**
 * Icon set ported from the Claude Design handoff (project/repu.jsx).
 *
 * Same API as the prototype: <Icon name="home" size={16} stroke={1.6} />.
 * All icons share the same viewBox (24×24), stroke style, and rounded
 * line joins so they read as a coherent set.
 */

import type { CSSProperties } from "react";

export type IconName =
  | "home"
  | "grid"
  | "building"
  | "box"
  | "star"
  | "send"
  | "sparkle"
  | "chat"
  | "share"
  | "survey"
  | "book"
  | "flag"
  | "brain"
  | "phone"
  | "settings"
  | "plug"
  | "card"
  | "lock"
  | "plus"
  | "chevR"
  | "chevD"
  | "chevU"
  | "chevL"
  | "arrowR"
  | "arrowU"
  | "arrowD"
  | "arrowUR"
  | "arrowDR"
  | "search"
  | "bell"
  | "menu"
  | "filter"
  | "sliders"
  | "download"
  | "upload"
  | "qr"
  | "edit"
  | "trash"
  | "check"
  | "checkCircle"
  | "x"
  | "xCircle"
  | "clock"
  | "cal"
  | "play"
  | "pause"
  | "sound"
  | "image"
  | "user"
  | "users"
  | "pin"
  | "eye"
  | "eyeOff"
  | "reply"
  | "bot"
  | "hash"
  | "insta"
  | "fb"
  | "twitter"
  | "linkedin"
  | "google"
  | "grip"
  | "bolt"
  | "target"
  | "trend"
  | "pie"
  | "bars"
  | "mail"
  | "smartphone"
  | "info"
  | "alert"
  | "help"
  | "move"
  | "refresh"
  | "archive"
  | "pause2"
  | "ext"
  | "copy"
  | "minus"
  | "triangleR"
  | "round"
  | "presentation"
  | "globe"
  | "tag"
  | "more"
  | "dotsH"
  | "file"
  | "folder";

const PATHS: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V5l8-2 8 2v16" />
      <path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01" />
    </>
  ),
  box: (
    <>
      <path d="m3 7 9-4 9 4-9 4-9-4Z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </>
  ),
  star: <path d="M12 2.5 14.9 8.7l6.6.6-5 4.6 1.5 6.6L12 17l-6 3.5 1.5-6.6-5-4.6 6.6-.6L12 2.5Z" />,
  send: <path d="m22 2-7 20-4-9-9-4 20-7Z" />,
  sparkle: (
    <>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  chat: <path d="M21 12a8 8 0 0 1-12.4 6.7L3 20l1.3-5.3A8 8 0 1 1 21 12Z" />,
  share: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" />
    </>
  ),
  survey: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h6M8 16h4" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.5C10.6 5.6 8.8 5 7 5H3v13h4c1.8 0 3.6.6 5 1.5" />
      <path d="M12 6.5C13.4 5.6 15.2 5 17 5h4v13h-4c-1.8 0-3.6.6-5 1.5" />
      <path d="M12 6.5v13" />
    </>
  ),
  flag: (
    <>
      <path d="M4 21V4" />
      <path d="M4 4h12l-2 4 2 4H4" />
    </>
  ),
  brain: (
    <>
      <path d="M9 4a3 3 0 0 0-3 3v1a2 2 0 0 0-1.5 1.9V11a2 2 0 0 0 .8 1.6 2 2 0 0 0 0 2.8 2 2 0 0 0-.3 1.1V18a2 2 0 0 0 2 2v.5a1.5 1.5 0 0 0 3 0V4Z" />
      <path d="M15 4a3 3 0 0 1 3 3v1a2 2 0 0 1 1.5 1.9V11a2 2 0 0 1-.8 1.6 2 2 0 0 1 0 2.8 2 2 0 0 1 .3 1.1V18a2 2 0 0 1-2 2v.5a1.5 1.5 0 0 1-3 0V4Z" />
    </>
  ),
  phone: (
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.4 2.1L8 9.8a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2.1Z" />
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8L4.2 7a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  plug: (
    <>
      <path d="M9 2v6M15 2v6" />
      <path d="M5 10h14v3a7 7 0 0 1-7 7 7 7 0 0 1-7-7v-3Z" />
      <path d="M12 20v2" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chevR: <path d="m9 6 6 6-6 6" />,
  chevD: <path d="m6 9 6 6 6-6" />,
  chevU: <path d="m18 15-6-6-6 6" />,
  chevL: <path d="m15 6-6 6 6 6" />,
  arrowR: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  arrowU: <path d="m6 14 6-6 6 6" />,
  arrowD: <path d="m6 10 6 6 6-6" />,
  arrowUR: <path d="M7 17 17 7M7 7h10v10" />,
  arrowDR: <path d="m7 7 10 10M7 17h10V7" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a2 2 0 0 0 3.4 0" />
    </>
  ),
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  filter: <path d="M3 4h18l-7 9v7l-4-2v-5L3 4Z" />,
  sliders: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="2" fill="white" />
      <circle cx="16" cy="12" r="2" fill="white" />
      <circle cx="7" cy="18" r="2" fill="white" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 21h16" />
    </>
  ),
  upload: (
    <>
      <path d="M12 21V9" />
      <path d="m7 14 5-5 5 5" />
      <path d="M4 3h16" />
    </>
  ),
  qr: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM18 18h3M14 21h3M21 14v3" />
    </>
  ),
  edit: (
    <>
      <path d="M3 21h18" />
      <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="m6 6 1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
    </>
  ),
  check: <path d="m5 12 5 5L20 7" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  x: <path d="M6 6l12 12M6 18 18 6" />,
  xCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 8 8 8M8 16l8-8" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  cal: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  play: <path d="m6 4 14 8L6 20V4Z" />,
  pause: <path d="M6 4h4v16H6zM14 4h4v16h-4z" />,
  sound: (
    <>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M19 12a4 4 0 0 0-2-3.5M16 5a8 8 0 0 1 0 14" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0" />
      <path d="M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-5-6.7" />
    </>
  ),
  pin: (
    <>
      <path d="M12 22s-7-8-7-13a7 7 0 0 1 14 0c0 5-7 13-7 13Z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a18 18 0 0 1-3.4 3.9M6.3 6.3A18 18 0 0 0 2 12s4 6 10 6c1.5 0 2.8-.3 3.9-.7" />
      <path d="M14 14a3 3 0 0 1-4-4" />
    </>
  ),
  reply: (
    <>
      <path d="M9 17 4 12l5-5" />
      <path d="M4 12h11a5 5 0 0 1 5 5v3" />
    </>
  ),
  bot: (
    <>
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 4v4M8 14h.01M16 14h.01M9 18h6" />
      <path d="M2 14v2M22 14v2" />
    </>
  ),
  hash: <path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18" />,
  insta: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r=".7" fill="currentColor" />
    </>
  ),
  fb: <path d="M14 9V7a1 1 0 0 1 1-1h2V3h-3a4 4 0 0 0-4 4v2H8v3h2v9h4v-9h2.5l.5-3H14Z" />,
  twitter: (
    <path d="M22 5.8a8 8 0 0 1-2.3.6 4 4 0 0 0 1.8-2.2 8 8 0 0 1-2.6 1 4 4 0 0 0-6.7 3.7A11.4 11.4 0 0 1 3 4a4 4 0 0 0 1.2 5.4 4 4 0 0 1-1.8-.5v.1a4 4 0 0 0 3.2 4 4 4 0 0 1-1.8.1 4 4 0 0 0 3.7 2.8A8 8 0 0 1 2 17.5a11.4 11.4 0 0 0 6.2 1.8c7.5 0 11.6-6.2 11.6-11.6V7.2A8.3 8.3 0 0 0 22 5.8Z" />
  ),
  linkedin: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 10v8M8 7v.01M12 18v-4a2 2 0 0 1 4 0v4M12 10v8" />
    </>
  ),
  google: <path d="M21 12a9 9 0 1 1-2.6-6.3L15.7 8a5 5 0 1 0 1.2 5H12v-3h9c.1.6.1 1.3 0 2Z" />,
  grip: (
    <>
      <circle cx="9" cy="6" r="1.2" fill="currentColor" />
      <circle cx="15" cy="6" r="1.2" fill="currentColor" />
      <circle cx="9" cy="12" r="1.2" fill="currentColor" />
      <circle cx="15" cy="12" r="1.2" fill="currentColor" />
      <circle cx="9" cy="18" r="1.2" fill="currentColor" />
      <circle cx="15" cy="18" r="1.2" fill="currentColor" />
    </>
  ),
  bolt: <path d="M13 2 4 13h7l-1 9 9-11h-7l1-9Z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </>
  ),
  trend: (
    <>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </>
  ),
  pie: (
    <>
      <path d="M12 3a9 9 0 1 0 9 9h-9V3Z" />
      <path d="M14 3a7 7 0 0 1 7 7h-7V3Z" fill="currentColor" opacity=".25" />
    </>
  ),
  bars: (
    <>
      <rect x="4" y="10" width="3" height="10" rx="1" />
      <rect x="10.5" y="4" width="3" height="16" rx="1" />
      <rect x="17" y="13" width="3" height="7" rx="1" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.4 3.9 5.6 3.9 9s-1.4 6.6-3.9 9c-2.5-2.4-3.9-5.6-3.9-9s1.4-6.6 3.9-9Z" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 11.3V4.5A1 1 0 0 1 4.5 3.5h6.8a1 1 0 0 1 .7.3l8 8a1 1 0 0 1 0 1.4l-6.6 6.6a1 1 0 0 1-1.4 0l-8-8a1 1 0 0 1-.3-.7Z" />
      <circle cx="7.6" cy="7.6" r="1.3" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="5.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18.5" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  dotsH: (
    <>
      <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </>
  ),
  folder: (
    <path d="M3 7a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.4.6L11.8 7H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  smartphone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <path d="M11 18h2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.01" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2 21h20L12 3Z" />
      <path d="M12 10v5M12 17.5v.01" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17v.01" />
    </>
  ),
  move: <path d="M5 9 2 12l3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />,
  refresh: (
    <>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="3" width="18" height="5" rx="1" />
      <path d="M5 8v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </>
  ),
  pause2: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 9v6M14 9v6" />
    </>
  ),
  ext: (
    <>
      <path d="M14 4h6v6" />
      <path d="M21 3 12 12" />
      <path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  triangleR: <path d="m8 5 11 7-11 7V5Z" fill="currentColor" />,
  round: <circle cx="12" cy="12" r="9" />,
  presentation: (
    <>
      <path d="M3 4h18" />
      <path d="M4 4v9h16V4" />
      <path d="M12 13v4" />
      <path d="m9 21 3-3 3 3" />
      <path d="M8.5 9.5 11 7l2 2 2.5-3" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  stroke = 1.6,
  style,
  className,
  title,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
  style?: CSSProperties;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}

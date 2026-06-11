"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Global ⌘K command palette.
 *
 * Replaces the two formerly-decorative search affordances (the topbar search
 * box and the sidebar "Search… ⌘K" button) with a real, keyboard-driven jump
 * menu. Pure client-side navigation — no backend — so it's instant and works on
 * every authenticated page.
 *
 * Opens on ⌘K / Ctrl+K, or when anything dispatches the `OPEN_EVENT` window
 * event (the topbar + sidebar triggers do exactly that, avoiding prop-drilling
 * through the server-rendered shell). Arrow keys move, Enter navigates, Esc closes.
 */

export const OPEN_EVENT = "repulabs:open-search";

/** Convenience for triggers elsewhere (topbar/sidebar buttons). */
export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

type Command = {
  label: string;
  href: string;
  icon: IconName;
  group: "Go to" | "Actions";
  /** Extra search synonyms so e.g. "billing" finds Account & Billing. */
  keywords?: string;
};

const COMMANDS: Command[] = [
  { group: "Go to", label: "Dashboard", href: "/dashboard", icon: "home", keywords: "overview home" },
  { group: "Go to", label: "Autopilot", href: "/autopilot", icon: "bolt", keywords: "automation ai" },
  { group: "Go to", label: "My Establishments", href: "/establishments", icon: "pin", keywords: "business location google profile" },
  { group: "Go to", label: "My Devices", href: "/hardware", icon: "qr", keywords: "qr nfc stand plaque cards hardware" },
  { group: "Go to", label: "AI Knowledge Base", href: "/ai/training", icon: "brain", keywords: "training kb knowledge brand voice" },
  { group: "Go to", label: "AI Phone Receptionist", href: "/phone", icon: "phone", keywords: "calls voice receptionist" },
  { group: "Go to", label: "Review Feed", href: "/reviews", icon: "star", keywords: "reviews ratings replies google" },
  { group: "Go to", label: "Review Requests", href: "/outreach", icon: "send", keywords: "outreach request campaign sms email" },
  { group: "Go to", label: "Dispute Center", href: "/reviews/dispute", icon: "flag", keywords: "dispute remove flag fake" },
  { group: "Go to", label: "Unified Inbox", href: "/support", icon: "chat", keywords: "inbox messages support comments" },
  { group: "Go to", label: "Meeting Requests", href: "/support?tab=meetings", icon: "cal", keywords: "meetings bookings appointments" },
  { group: "Go to", label: "Post Creator", href: "/social/posts", icon: "share", keywords: "social posts schedule instagram facebook" },
  { group: "Go to", label: "Customer Surveys", href: "/surveys", icon: "survey", keywords: "surveys nps feedback csat" },
  { group: "Go to", label: "Contact Directory", href: "/contacts", icon: "users", keywords: "contacts customers crm" },
  { group: "Go to", label: "Business Reports", href: "/analytics", icon: "bars", keywords: "analytics reports insights metrics" },
  { group: "Go to", label: "Connections", href: "/connections", icon: "plug", keywords: "integrations oauth connect google hubspot" },
  { group: "Go to", label: "Account & Billing", href: "/subscription", icon: "card", keywords: "billing plan subscription invoice upgrade pro" },
  { group: "Go to", label: "Settings", href: "/settings", icon: "settings", keywords: "settings account team profile security" },
  { group: "Actions", label: "Send a review request", href: "/outreach/send", icon: "send", keywords: "new request ask review" },
  { group: "Actions", label: "Activate a device", href: "/activate", icon: "qr", keywords: "activate code redeem qr" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter((c) =>
      `${c.label} ${c.group} ${c.keywords ?? ""}`.toLowerCase().includes(q),
    );
  }, [query]);

  // Keep the active row in range as results shrink/grow.
  useEffect(() => {
    setActive(0);
  }, [query]);

  // Global open: ⌘K / Ctrl+K toggles; custom event (from topbar/sidebar) opens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // Focus the input + lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const select = useCallback(
    (cmd: Command | undefined) => {
      if (!cmd) return;
      setOpen(false);
      router.push(cmd.href);
    },
    [router],
  );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(results[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  if (!open) return null;

  let lastGroup = "";

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(15,23,42,0.42)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "12vh 16px 16px",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search and navigate"
        style={{
          width: "100%",
          maxWidth: 560,
          background: "#ffffff",
          borderRadius: 16,
          border: "1px solid #e3eae6",
          boxShadow: "0 24px 60px -12px rgba(15,23,42,0.35)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid #edf1ee" }}>
          <Icon name="search" size={16} style={{ color: "#94a3b8" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search pages and actions…"
            aria-label="Search pages and actions"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: 15,
              color: "#0f172a",
              background: "transparent",
            }}
          />
          <kbd
            style={{
              fontSize: 10.5,
              color: "#94a3b8",
              border: "1px solid #e3eae6",
              borderRadius: 6,
              padding: "2px 6px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            ESC
          </kbd>
        </div>

        <div role="listbox" style={{ maxHeight: "min(56vh, 420px)", overflowY: "auto", padding: 6 }}>
          {results.length === 0 && (
            <div style={{ padding: "28px 16px", textAlign: "center", color: "#94a3b8", fontSize: 13.5 }}>
              No matches for “{query}”.
            </div>
          )}
          {results.map((cmd, i) => {
            const showGroup = cmd.group !== lastGroup;
            lastGroup = cmd.group;
            const isActive = i === active;
            return (
              <div key={cmd.href + cmd.label}>
                {showGroup && (
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: ".08em",
                      textTransform: "uppercase",
                      color: "#94a3b8",
                      padding: "10px 10px 4px",
                    }}
                  >
                    {cmd.group}
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => select(cmd)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    padding: "9px 10px",
                    borderRadius: 9,
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    background: isActive ? "#f4f6ff" : "transparent",
                    color: "#0f172a",
                  }}
                >
                  <span
                    style={{
                      display: "grid",
                      placeItems: "center",
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      background: isActive ? "#e0e7ff" : "#f3f5f0",
                      color: isActive ? "#2457ff" : "#475569",
                      flex: "0 0 28px",
                    }}
                  >
                    <Icon name={cmd.icon} size={14} />
                  </span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{cmd.label}</span>
                  {isActive && <Icon name="arrowR" size={13} style={{ color: "#94a3b8" }} />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

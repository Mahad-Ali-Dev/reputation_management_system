"use client";

import { Icon } from "@/components/shell/icon";
import { getContactSourceMeta } from "@/lib/contacts/source-meta";
import { updateContactTags } from "@/lib/contacts/actions";
import type { ContactListItem } from "@/lib/contacts/queries";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AddContactDialog } from "./add-contact-dialog";
import { BulkActionBar } from "./bulk-action-bar";

/**
 * Contacts directory table (client island).
 *
 * Owns ALL directory interactivity:
 *  - search box (debounced → `?q=`), source/tag/segment filter dropdowns
 *  - header sort toggles for Name / Last activity (→ `?sort=`)
 *  - per-row checkbox select + "select all on page" + "select all matching"
 *  - inline editable tag pills (add/remove → `updateContactTags`, optimistic)
 *  - reveals the sticky `<BulkActionBar/>` on selection
 *  - hosts the `<AddContactDialog/>` (also opened by the zero-state via a
 *    `contacts:add` window event)
 *
 * The server parent re-renders the row set on each URL change; this island only
 * drives the URL + local selection/edit state.
 */

type Filters = { q: string; source: string; tag: string; seg: string; sort: string };

export function ContactsTable({
  rows,
  total,
  page,
  pageSize,
  totalPages,
  filters,
  tagOptions,
  activeSegmentLabel,
  establishments,
  entitled,
}: {
  rows: ContactListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: Filters;
  tagOptions: string[];
  activeSegmentLabel: string | null;
  establishments: { id: string; name: string }[];
  entitled: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchValue, setSearchValue] = useState(filters.q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);

  // Reset selection whenever the underlying row set changes (filter/page nav).
  // Keying off the row ids keeps it cheap + correct.
  const rowKey = rows.map((r) => r.id).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on row identity change.
  useEffect(() => {
    setSelected(new Set());
  }, [rowKey]);

  // Keep the search box in sync when the URL param changes externally.
  useEffect(() => {
    setSearchValue(filters.q);
  }, [filters.q]);

  // Zero-state "Add a contact" button + topbar dispatch this.
  useEffect(() => {
    const handler = () => setAddOpen(true);
    window.addEventListener("contacts:add", handler);
    return () => window.removeEventListener("contacts:add", handler);
  }, []);

  const pushParams = useCallback(
    (mut: (p: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      mut(params);
      // Any filter/sort change resets to page 1.
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Debounced search → ?q=
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onSearchChange(v: string) {
    setSearchValue(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushParams((p) => {
        if (v.trim()) p.set("q", v.trim());
        else p.delete("q");
        p.delete("page");
      });
    }, 300);
  }

  function setFilter(key: "source" | "tag" | "seg", value: string) {
    pushParams((p) => {
      if (value && value !== "all") p.set(key, value);
      else p.delete(key);
      p.delete("page");
    });
  }

  function toggleSort(col: "name" | "lastActivity") {
    pushParams((p) => {
      if (filters.sort === col) p.delete("sort");
      else p.set("sort", col);
      p.delete("page");
    });
  }

  function goToPage(n: number) {
    pushParams((p) => {
      if (n <= 1) p.delete("page");
      else p.set("page", String(n));
    });
  }

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  function toggleAllOnPage() {
    setSelected((prev) => {
      if (rows.every((r) => prev.has(r.id))) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  }
  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedIds = useMemo(() => [...selected], [selected]);
  const selectionCount = selectedIds.length;

  const hasFilters =
    !!filters.q || (filters.source && filters.source !== "all") || (filters.tag && filters.tag !== "all") || !!filters.seg;

  function clearFilters() {
    setSearchValue("");
    pushParams((p) => {
      p.delete("q");
      p.delete("source");
      p.delete("tag");
      p.delete("seg");
      p.delete("page");
    });
  }

  return (
    <div className="ds-card" style={{ position: "relative" }}>
      {/* Toolbar */}
      <div className="ds-card__head" style={{ flexWrap: "wrap", gap: 10 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
          <div style={{ position: "relative", minWidth: 220, flex: "0 1 280px" }}>
            <span
              style={{
                position: "absolute",
                left: 11,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--rl-muted-2)",
                pointerEvents: "none",
              }}
            >
              <Icon name="search" size={15} />
            </span>
            <input
              className="ds-input"
              style={{ paddingLeft: 32, height: 34 }}
              placeholder="Search name, email, phone…"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search contacts"
            />
          </div>

          <select
            className="ds-select"
            style={{ height: 34, width: "auto", minWidth: 130 }}
            value={filters.source}
            onChange={(e) => setFilter("source", e.target.value)}
            aria-label="Filter by source"
          >
            <option value="all">All sources</option>
            {SOURCE_FILTER_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>

          {tagOptions.length > 0 && (
            <select
              className="ds-select"
              style={{ height: 34, width: "auto", minWidth: 120 }}
              value={filters.tag}
              onChange={(e) => setFilter("tag", e.target.value)}
              aria-label="Filter by tag"
            >
              <option value="all">All tags</option>
              {tagOptions.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>
          )}

          {hasFilters && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={clearFilters}>
              <Icon name="x" size={13} />
              Clear
            </button>
          )}
        </div>

        <button type="button" className="btn btn--pri btn--sm" onClick={() => setAddOpen(true)}>
          <Icon name="plus" size={13} />
          Add contact
        </button>
      </div>

      {/* Active segment chip */}
      {activeSegmentLabel && (
        <div className="ds-card__body" style={{ paddingTop: 12, paddingBottom: 0 }}>
          <span className="chip chip--pri">
            <Icon name="filter" size={12} />
            Segment: {activeSegmentLabel}
            <button
              type="button"
              onClick={() => setFilter("seg", "all")}
              aria-label="Clear segment"
              style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", display: "inline-flex" }}
            >
              <Icon name="x" size={12} />
            </button>
          </span>
        </div>
      )}

      {/* Table */}
      {rows.length === 0 ? (
        <div className="ds-card__body" style={{ textAlign: "center", padding: 56 }}>
          <span style={{ color: "var(--pri)", display: "inline-flex" }}>
            <Icon name="users" size={30} />
          </span>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginTop: 12, color: "var(--ink)" }}>
            {hasFilters ? "No contacts match these filters" : "No contacts yet"}
          </h3>
          <p style={{ fontSize: 13, color: "var(--rl-muted)", marginTop: 6 }}>
            {hasFilters
              ? "Try clearing a filter or broadening your search."
              : "Add a contact, import a CSV, or connect a source to get started."}
          </p>
          <div className="row" style={{ justifyContent: "center", gap: 8, marginTop: 14 }}>
            {hasFilters ? (
              <button type="button" className="btn btn--sm" onClick={clearFilters}>
                Clear filters
              </button>
            ) : (
              <>
                <button type="button" className="btn btn--pri btn--sm" onClick={() => setAddOpen(true)}>
                  <Icon name="plus" size={13} />
                  Add contact
                </button>
                <Link href="/contacts?tab=import" className="btn btn--sm">
                  <Icon name="upload" size={13} />
                  Import CSV
                </Link>
              </>
            )}
          </div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={allOnPageSelected}
                    onChange={toggleAllOnPage}
                  />
                </th>
                <SortableTh
                  label="Name"
                  active={filters.sort === "name"}
                  onClick={() => toggleSort("name")}
                />
                <th>Channels</th>
                <th>Source</th>
                <th>Tags</th>
                <SortableTh
                  label="Last activity"
                  active={filters.sort === "lastActivity"}
                  onClick={() => toggleSort("lastActivity")}
                />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <ContactRow
                  key={c.id}
                  contact={c}
                  selected={selected.has(c.id)}
                  onToggle={() => toggleRow(c.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {rows.length > 0 && (
        <div
          className="ds-card__head"
          style={{ borderTop: "1px solid var(--line)", borderBottom: "none", justifyContent: "space-between" }}
        >
          <span className="dim" style={{ fontSize: 12 }}>
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()}
          </span>
          <div className="row" style={{ gap: 6 }}>
            <button
              type="button"
              className="btn btn--sm"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              <Icon name="chevL" size={13} />
              Prev
            </button>
            <span className="dim mono" style={{ fontSize: 12, padding: "0 6px" }}>
              {page} / {totalPages}
            </span>
            <button
              type="button"
              className="btn btn--sm"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              Next
              <Icon name="chevR" size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Bulk bar */}
      {selectionCount > 0 && (
        <BulkActionBar
          selectedIds={selectedIds}
          selectionCount={selectionCount}
          filters={filters}
          onClear={() => setSelected(new Set())}
          establishments={establishments}
          entitled={entitled}
          tagOptions={tagOptions}
        />
      )}

      <AddContactDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

/** Source filter options — a curated subset of known sources for the dropdown. */
const SOURCE_FILTER_OPTIONS = [
  { key: "manual", label: "Manual Entry" },
  { key: "csv", label: "CSV Import" },
  { key: "import", label: "Import" },
  { key: "google_review", label: "Google Review" },
  { key: "review_request", label: "Review Request" },
  { key: "survey", label: "Survey" },
  { key: "live_chat", label: "Live Chat" },
  { key: "social_dm", label: "Social DM" },
  { key: "shopify", label: "Shopify" },
];

function SortableTh({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <th>
      <button
        type="button"
        onClick={onClick}
        style={{
          background: "none",
          border: 0,
          cursor: "pointer",
          font: "inherit",
          color: active ? "var(--ink)" : "inherit",
          textTransform: "inherit",
          letterSpacing: "inherit",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: 0,
        }}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <Icon name={active ? "arrowD" : "chevD"} size={12} style={{ opacity: active ? 1 : 0.4 }} />
      </button>
    </th>
  );
}

function ContactRow({
  contact,
  selected,
  onToggle,
}: {
  contact: ContactListItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const meta = getContactSourceMeta(contact.source);
  const displayName =
    contact.name?.trim() ||
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
    contact.email ||
    contact.phone ||
    "Unnamed";

  return (
    <tr style={selected ? { background: "var(--pri-50)" } : undefined}>
      <td>
        <input type="checkbox" aria-label={`Select ${displayName}`} checked={selected} onChange={onToggle} />
      </td>
      <td>
        <Link
          href={`/contacts/${contact.id}`}
          style={{ color: "var(--ink)", fontWeight: 500, textDecoration: "none" }}
        >
          {displayName}
          {contact.vip && (
            <span title="VIP" style={{ color: "var(--gold, #d97706)", marginLeft: 6 }}>
              <Icon name="star" size={12} />
            </span>
          )}
        </Link>
        {contact.companyName && (
          <div className="dim" style={{ fontSize: 11.5 }}>
            {contact.companyName}
          </div>
        )}
      </td>
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {contact.email && (
            <span className="dim" style={{ fontSize: 12 }}>
              <Icon name="mail" size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />
              {contact.email}
            </span>
          )}
          {contact.phone && (
            <span className="dim mono" style={{ fontSize: 12 }}>
              <Icon name="phone" size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />
              {contact.phone}
            </span>
          )}
          {!contact.email && !contact.phone && <span className="dim">—</span>}
        </div>
      </td>
      <td>
        <span
          className="chip"
          style={{ background: meta.bgTint, color: meta.fg }}
          title={meta.description}
        >
          {meta.label}
        </span>
      </td>
      <td style={{ maxWidth: 240 }}>
        <RowTagEditor contactId={contact.id} tags={contact.tags} />
      </td>
      <td className="dim" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
        {relativeTime(contact.lastActivityAt ?? contact.lastContactedAt ?? contact.createdAt)}
      </td>
    </tr>
  );
}

/** Inline editable tag pills for a single row (optimistic add/remove). */
function RowTagEditor({ contactId, tags }: { contactId: string; tags: string[] }) {
  const router = useRouter();
  const [local, setLocal] = useState<string[]>(tags);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => setLocal(tags), [tags]);

  function commit(next: string[]) {
    setLocal(next);
    const fd = new FormData();
    fd.set("id", contactId);
    fd.set("tags", next.join(","));
    startTransition(async () => {
      try {
        await updateContactTags(fd);
        router.refresh();
      } catch {
        setLocal(tags); // revert on failure
      }
    });
  }

  function addTag() {
    const t = draft.trim().replace(/^#/, "");
    if (!t) {
      setEditing(false);
      return;
    }
    if (local.includes(t)) {
      setDraft("");
      return;
    }
    commit([...local, t]);
    setDraft("");
  }

  function removeTag(t: string) {
    commit(local.filter((x) => x !== t));
  }

  return (
    <div className="row" style={{ gap: 4, flexWrap: "wrap", opacity: pending ? 0.6 : 1 }}>
      {local.map((t) => (
        <span key={t} className="chip chip--out" style={{ height: 20, fontSize: 11 }}>
          {t}
          <button
            type="button"
            onClick={() => removeTag(t)}
            aria-label={`Remove tag ${t}`}
            style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", display: "inline-flex", padding: 0 }}
          >
            <Icon name="x" size={10} />
          </button>
        </span>
      ))}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={addTag}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            } else if (e.key === "Escape") {
              setDraft("");
              setEditing(false);
            }
          }}
          placeholder="tag"
          className="ds-input"
          style={{ height: 20, width: 70, padding: "0 6px", fontSize: 11 }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="chip chip--out"
          style={{ height: 20, fontSize: 11, cursor: "pointer" }}
          aria-label="Add tag"
        >
          <Icon name="plus" size={10} />
        </button>
      )}
    </div>
  );
}

function relativeTime(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const ms = Date.now() - date.getTime();
  if (ms < 0) return date.toLocaleDateString();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return date.toLocaleDateString();
}

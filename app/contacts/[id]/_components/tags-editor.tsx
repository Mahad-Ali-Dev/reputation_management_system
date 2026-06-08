"use client";

import { Icon } from "@/components/shell/icon";
import { updateContactTags } from "@/lib/contacts/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Tags editor (client). Add/remove tag pills → `updateContactTags` (keyed on
 * `id`, comma-separated `tags`). The action mirrors the normalized tag rows +
 * writes a `tag_added` / `tag_removed` activity marker. Optimistic with revert.
 */

export function TagsEditor({ contactId, initialTags }: { contactId: string; initialTags: string[] }) {
  const router = useRouter();
  const [tags, setTags] = useState<string[]>(initialTags);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit(next: string[], prev: string[]) {
    setTags(next);
    const fd = new FormData();
    fd.set("id", contactId);
    fd.set("tags", next.join(","));
    startTransition(async () => {
      try {
        await updateContactTags(fd);
        router.refresh();
      } catch (e) {
        setTags(prev); // revert
        setError(e instanceof Error ? e.message : "Failed to update tags.");
      }
    });
  }

  function add() {
    const t = draft.trim().replace(/^#/, "");
    if (!t || tags.includes(t)) {
      setDraft("");
      return;
    }
    setError(null);
    commit([...tags, t], tags);
    setDraft("");
  }

  function remove(t: string) {
    setError(null);
    commit(tags.filter((x) => x !== t), tags);
  }

  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Tags</h3>
        <Icon name="hash" size={16} style={{ color: "var(--rl-muted-2)" }} />
      </div>
      <div className="ds-card__body">
        <div className="row" style={{ gap: 6, flexWrap: "wrap", opacity: pending ? 0.7 : 1 }}>
          {tags.length === 0 && <span className="dim" style={{ fontSize: 12.5 }}>No tags yet.</span>}
          {tags.map((t) => (
            <span key={t} className="chip chip--out">
              {t}
              <button
                type="button"
                onClick={() => remove(t)}
                aria-label={`Remove ${t}`}
                style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", display: "inline-flex", padding: 0 }}
              >
                <Icon name="x" size={11} />
              </button>
            </span>
          ))}
        </div>

        <div className="row" style={{ gap: 6, marginTop: 12 }}>
          <input
            className="ds-input"
            style={{ height: 32, flex: 1 }}
            placeholder="Add a tag…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="btn btn--sm" onClick={add} disabled={pending || !draft.trim()}>
            <Icon name="plus" size={13} />
            Add
          </button>
        </div>

        {error && (
          <p className="chip chip--bad" style={{ display: "inline-flex", marginTop: 10 }} role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

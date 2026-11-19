"use client";

import { Icon } from "@/components/shell/icon";
import { linkGooglePlace, searchPlacesForEstablishment } from "@/lib/establishments/place-actions";
import type { PlaceCandidate } from "@/lib/reviews/hasdata-places";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * In-app Google Maps business picker.
 *
 * The page shows a compact trigger that looks like a search field; clicking it
 * opens a centered modal with a large search box. Type the business name → pick
 * the listing → reviews sync immediately, and the modal closes on success.
 *
 * Each search costs a HasData credit, so input is DEBOUNCED, requires 3+ chars,
 * only runs while the modal is OPEN, and an in-flight request is aborted when
 * the query moves on.
 *
 * Showing rating + review count per result matters: several listings can share
 * a trade name, and those two numbers are how an owner recognises theirs before
 * committing.
 */
export function PlacePicker({
  establishmentId,
  near,
  currentPlaceId,
  initialQuery,
}: {
  establishmentId: string;
  /** Biases search (usually the establishment's suburb/city). */
  near?: string | null;
  currentPlaceId?: string | null;
  /**
   * Pre-fills the box with the business name so an unlinked establishment finds
   * its own listing without the owner retyping it. Only passed when NOT yet
   * linked — otherwise every visit to a linked establishment would spend a
   * search credit for nothing.
   */
  initialQuery?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [results, setResults] = useState<PlaceCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [, startLink] = useTransition();
  const seq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const triggerLabel = currentPlaceId
    ? "Change the linked Google listing"
    : "Find your business on Google";

  // Esc to close + lock background scroll + focus the field while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusId = setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(focusId);
    };
  }, [open]);

  // Debounced search — only while the modal is open (don't spend credits on a
  // pre-filled query before the owner even opens the picker). `seq` guards
  // against an older, slower response overwriting a newer one.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    setError(null);
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const mySeq = ++seq.current;
    const t = setTimeout(async () => {
      const res = await searchPlacesForEstablishment(q, near ?? null);
      if (mySeq !== seq.current) return; // superseded
      setSearching(false);
      if (!res.ok) {
        setError(res.error);
        setResults([]);
        return;
      }
      setResults(res.results);
    }, 550);
    return () => clearTimeout(t);
  }, [query, near, open]);

  function link(c: PlaceCandidate) {
    setError(null);
    setNotice(null);
    setLinkingId(c.placeId);
    startLink(async () => {
      const res = await linkGooglePlace({
        establishmentId,
        placeId: c.placeId,
        title: c.title,
      });
      setLinkingId(null);
      if (!res.ok) {
        setError(res.error);
        router.refresh(); // the link may still have saved
        return;
      }
      setNotice(
        res.inserted > 0
          ? `Linked ${c.title} — imported ${res.inserted} review${res.inserted === 1 ? "" : "s"}.`
          : `Linked ${c.title}. No public reviews found yet.`,
      );
      setResults([]);
      setQuery("");
      setOpen(false); // close the modal once a listing is linked
      router.refresh();
    });
  }

  return (
    <div>
      <label className="set-field__label" style={{ fontWeight: 600, display: "block" }}>
        {triggerLabel}
      </label>

      {/* Compact trigger that reads as a search field; opens the modal. */}
      <button type="button" className="pp-trigger" onClick={() => setOpen(true)}>
        <Icon name="search" size={16} />
        <span className="pp-trigger__text">
          {currentPlaceId ? "Search for a different listing…" : "Search your business on Google…"}
        </span>
        <span className="pp-trigger__kbd">Search</span>
      </button>

      <span
        className="set-field__hint"
        style={{ display: "block", marginTop: 8, fontSize: 12.5, color: "var(--rl-muted)" }}
      >
        Search your business name and suburb, then pick your listing. We&rsquo;ll import its reviews
        straight away — no Google account needed.
      </span>

      {/* Success feedback persists on the page after the modal closes. */}
      {notice && !open && (
        <output
          style={{ display: "block", marginTop: 10, fontSize: 12.5, color: "var(--glass-success, #10b981)" }}
        >
          {notice}
        </output>
      )}

      {open && (
        <div
          className="pp-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Find your business on Google"
        >
            <button
              type="button"
              className="pp-scrim"
              aria-label="Close search"
              onClick={() => setOpen(false)}
            />
            <div className="pp-modal">
              <div className="pp-modal__head">
                <div style={{ minWidth: 0 }}>
                  <h2 className="pp-modal__title">{triggerLabel}</h2>
                  <p className="pp-modal__sub">
                    Pick your Google listing — its reviews import straight away.
                  </p>
                </div>
                <button
                  type="button"
                  className="pp-modal__close"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </div>

              <div className="pp-search">
                <span className="pp-search__icon" aria-hidden="true">
                  <Icon name="search" size={18} />
                </span>
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. 1300findleak Parkdale"
                  aria-label="Search for your business on Google Maps"
                  className="pp-search__input"
                />
                {searching && <span className="pp-spinner" aria-hidden="true" />}
              </div>

              <div className="pp-modal__body">
                {error && (
                  <p role="alert" className="pp-msg pp-msg--err">
                    {error}
                  </p>
                )}

                {results.length > 0 && (
                  <ul className="pp-results">
                    {results.map((c) => {
                      const isLinking = linkingId === c.placeId;
                      const isCurrent = currentPlaceId === c.placeId;
                      return (
                        <li key={c.placeId}>
                          <button
                            type="button"
                            onClick={() => link(c)}
                            disabled={isLinking || isCurrent}
                            className="pp-result"
                            style={{
                              cursor: isCurrent ? "default" : "pointer",
                              opacity: isLinking ? 0.6 : 1,
                            }}
                          >
                            <span style={{ minWidth: 0, flex: 1 }}>
                              <span className="pp-result__title">{c.title}</span>
                              {c.address && <span className="pp-result__addr">{c.address}</span>}
                              <span className="pp-result__meta">
                                {c.rating !== null && (
                                  <span style={{ color: "var(--glass-star, #f59e0b)", fontWeight: 600 }}>
                                    ★ {c.rating}{" "}
                                  </span>
                                )}
                                {c.reviewCount !== null && <>· {c.reviewCount} reviews </>}
                                {c.category && <>· {c.category}</>}
                              </span>
                            </span>
                            <span className="pp-result__cta">
                              {isCurrent ? "Linked" : isLinking ? "Importing…" : "Select"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {searching && results.length === 0 && (
                  <p className="pp-msg pp-msg--muted">Searching Google…</p>
                )}

                {!searching && query.trim().length >= 3 && results.length === 0 && !error && (
                  <p className="pp-msg pp-msg--muted">
                    No matching Google listings. Try adding your suburb, or check the name matches
                    your Google Business Profile exactly.
                  </p>
                )}

                {query.trim().length < 3 && !searching && (
                  <p className="pp-msg pp-msg--muted">
                    Type at least 3 characters to search Google Maps.
                  </p>
                )}
              </div>
            </div>
          </div>
      )}
    </div>
  );
}

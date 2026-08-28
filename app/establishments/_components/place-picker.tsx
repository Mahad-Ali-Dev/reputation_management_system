"use client";

import { Icon } from "@/components/shell/icon";
import { linkGooglePlace, searchPlacesForEstablishment } from "@/lib/establishments/place-actions";
import type { PlaceCandidate } from "@/lib/reviews/hasdata-places";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * In-app Google Maps business picker.
 *
 * Type the business name → pick the listing → reviews sync immediately. Each
 * search costs a HasData credit, so input is DEBOUNCED and requires 3+ chars,
 * and an in-flight request is aborted when the query moves on.
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
  const [query, setQuery] = useState(initialQuery ?? "");
  const [results, setResults] = useState<PlaceCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [, startLink] = useTransition();
  const seq = useRef(0);

  // Debounced search. `seq` guards against an older, slower response landing
  // after a newer one and overwriting good results.
  useEffect(() => {
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
  }, [query, near]);

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
          ? `Linked ${c.title} imported ${res.inserted} review${res.inserted === 1 ? "" : "s"}.`
          : `Linked ${c.title}. No public reviews found yet.`,
      );
      setResults([]);
      setQuery("");
      router.refresh();
    });
  }

  return (
    <div>
      <label className="set-field__label" style={{ fontWeight: 600, display: "block" }}>
        {currentPlaceId ? "Change the linked Google listing" : "Find your business on Google"}
      </label>
      <div style={{ position: "relative", marginTop: 8 }}>
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 11,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--rl-muted)",
            display: "inline-flex",
          }}
        >
          <Icon name="search" size={15} />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. 1300findleak Parkdale"
          aria-label="Search for your business on Google Maps"
          className="set-input"
          style={{ paddingLeft: 34, width: "100%" }}
        />
      </div>
      <span
        className="set-field__hint"
        style={{ display: "block", marginTop: 6, fontSize: 12.5, color: "var(--rl-muted)" }}
      >
        Search your business name and suburb, then pick your listing. We&rsquo;ll import its reviews
        straight away no Google account needed.
      </span>

      {searching && (
        <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--rl-muted)" }}>Searching Google…</p>
      )}

      {error && (
        <p role="alert" style={{ marginTop: 10, fontSize: 12.5, color: "#e14d62" }}>
          {error}
        </p>
      )}
      {notice && (
        <output style={{ display: "block", marginTop: 10, fontSize: 12.5, color: "#10b981" }}>
          {notice}
        </output>
      )}

      {results.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 8 }}>
          {results.map((c) => {
            const isLinking = linkingId === c.placeId;
            const isCurrent = currentPlaceId === c.placeId;
            return (
              <li key={c.placeId}>
                <button
                  type="button"
                  onClick={() => link(c)}
                  disabled={isLinking || isCurrent}
                  className="ds-card"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 14px",
                    cursor: isCurrent ? "default" : "pointer",
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    opacity: isLinking ? 0.6 : 1,
                  }}
                >
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: "var(--ink)",
                      }}
                    >
                      {c.title}
                    </span>
                    {c.address && (
                      <span
                        style={{
                          display: "block",
                          fontSize: 12,
                          color: "var(--rl-muted)",
                          marginTop: 2,
                        }}
                      >
                        {c.address}
                      </span>
                    )}
                    <span
                      style={{
                        display: "block",
                        fontSize: 12,
                        color: "var(--rl-muted)",
                        marginTop: 4,
                      }}
                    >
                      {c.rating !== null && (
                        <span style={{ color: "#f59e0b", fontWeight: 600 }}>★ {c.rating} </span>
                      )}
                      {c.reviewCount !== null && <>· {c.reviewCount} reviews </>}
                      {c.category && <>· {c.category}</>}
                    </span>
                  </span>
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--rl-primary, #2563eb)",
                    }}
                  >
                    {isCurrent ? "Linked" : isLinking ? "Importing…" : "Select"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!searching && query.trim().length >= 3 && results.length === 0 && !error && (
        <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--rl-muted)" }}>
          No matching Google listings. Try adding your suburb, or check the name matches your Google
          Business Profile exactly.
        </p>
      )}
    </div>
  );
}

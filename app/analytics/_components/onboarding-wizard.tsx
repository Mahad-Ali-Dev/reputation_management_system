"use client";

import { Icon } from "@/components/shell/icon";
import { GettingStarted } from "@/components/getting-started";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveSeoOnboardingStep, setTrackingKeywords, addCompetitor } from "@/lib/seo/actions";
import { suggestKeywordsAction, suggestCompetitorsAction } from "@/lib/seo/onboarding-actions";

/**
 * SEO onboarding wizard (Module 13). Shown FIRST while the report tabs are
 * locked, until the org completes the 5 steps. Steps:
 *   1. Connect Google (links to the existing google_business authorize route)
 *   2. Add website (+ GA4 / tracking snippet)
 *   3. Set keywords (AI/provider suggest, seeded from category + address)
 *   4. Add competitors (AI suggest up to 3)
 *   5. First report (processing state → unlocks the tabs)
 * Persists the step to `organizations.seoOnboardingStep` via server actions.
 * Reuses `<GettingStarted>` for the checklist styling.
 */

export type WizardState = {
  step: number;
  googleConnected: boolean;
  hasWebsite: boolean;
  keywordCount: number;
  competitorCount: number;
  establishmentId: string | null;
};

export function OnboardingWizard({ state }: { state: WizardState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // The wizard advances optimistically; the server-derived `state.step` is the
  // source of truth on reload.
  const [step, setStep] = useState(Math.max(1, state.step || 1));

  const checklistSteps = [
    { key: "google", title: "Connect Google Business", body: "Link your Google listing so we can sync reviews + insights.", done: state.googleConnected },
    { key: "website", title: "Add your website", body: "Add your site (and GA4) to track traffic + Core Web Vitals.", done: state.hasWebsite || step > 2 },
    { key: "keywords", title: "Set tracking keywords", body: "Pick the searches you want to rank for.", done: state.keywordCount > 0 },
    { key: "competitors", title: "Add competitors", body: "Track up to 3 local rivals.", done: state.competitorCount > 0 },
    { key: "report", title: "Generate your first report", body: "We'll compile your baseline and unlock the dashboard.", done: state.step >= 5 },
  ];

  function persist(next: number, opts?: { requestFirstReport?: boolean }) {
    const fd = new FormData();
    fd.set("step", String(next));
    if (opts?.requestFirstReport) fd.set("requestFirstReport", "true");
    startTransition(async () => {
      await saveSeoOnboardingStep(fd);
      if (next >= 5) router.refresh();
      else setStep(next);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", margin: 0 }}>
          Set up Business Reports
        </h2>
        <p style={{ fontSize: 13.5, color: "var(--rl-muted)", margin: "4px 0 0" }}>
          A few quick steps unlock your reputation + SEO intelligence hub.
        </p>
      </div>

      <GettingStarted checklistId="seo-onboarding" title="Setup checklist" steps={checklistSteps} hideWhenComplete={false} />

      <div className="ds-card">
        <div className="ds-card__body">
          {step === 1 && (
            <StepConnectGoogle connected={state.googleConnected} pending={pending} onNext={() => persist(2)} />
          )}
          {step === 2 && (
            <StepWebsite pending={pending} onBack={() => setStep(1)} onNext={() => persist(3)} />
          )}
          {step === 3 && (
            <StepKeywords
              establishmentId={state.establishmentId}
              pending={pending}
              onBack={() => setStep(2)}
              onNext={() => persist(4)}
            />
          )}
          {step === 4 && (
            <StepCompetitors
              establishmentId={state.establishmentId}
              pending={pending}
              onBack={() => setStep(3)}
              onNext={() => persist(5, { requestFirstReport: true })}
            />
          )}
          {step >= 5 && <StepFirstReport />}
        </div>
      </div>
    </div>
  );
}

function StepHeader({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: "var(--rl-muted-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Step {n} of 5</div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", margin: "2px 0 0" }}>{title}</h3>
      <p style={{ fontSize: 13, color: "var(--rl-muted)", margin: "4px 0 0" }}>{sub}</p>
    </div>
  );
}

function NavButtons({ onBack, onNext, nextLabel = "Continue", pending, nextDisabled }: { onBack?: () => void; onNext: () => void; nextLabel?: string; pending: boolean; nextDisabled?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
      {onBack ? (
        <button type="button" className="btn btn--sm btn--ghost" onClick={onBack} disabled={pending}>
          Back
        </button>
      ) : <span />}
      <button type="button" className="btn btn--sm btn--pri" onClick={onNext} disabled={pending || nextDisabled}>
        {pending ? "…" : nextLabel}
      </button>
    </div>
  );
}

function StepConnectGoogle({ connected, pending, onNext }: { connected: boolean; pending: boolean; onNext: () => void }) {
  return (
    <div>
      <StepHeader n={1} title="Connect Google Business" sub="We use your existing Google connection for reviews + Business Profile insights." />
      {connected ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--ok)", fontSize: 13.5, fontWeight: 600 }}>
          <Icon name="checkCircle" size={16} /> Google is connected
        </div>
      ) : (
        <Link href="/api/connections/google_business/authorize" className="btn btn--sm btn--pri">
          <Icon name="google" size={14} /> Connect Google Business
        </Link>
      )}
      <NavButtons onNext={onNext} pending={pending} nextLabel={connected ? "Continue" : "Skip for now"} />
    </div>
  );
}

function StepWebsite({ pending, onBack, onNext }: { pending: boolean; onBack: () => void; onNext: () => void }) {
  return (
    <div>
      <StepHeader n={2} title="Add your website" sub="Connect GA4 for traffic, or paste your site URL for Core Web Vitals tracking." />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Link href="/connections" className="btn btn--sm">
          <Icon name="plug" size={13} /> Connect GA4 / analytics
        </Link>
        <p style={{ fontSize: 12, color: "var(--rl-muted-2)", margin: 0 }}>
          You can add this later from Connections — it's optional to continue.
        </p>
      </div>
      <NavButtons onBack={onBack} onNext={onNext} pending={pending} />
    </div>
  );
}

function StepKeywords({ establishmentId, pending, onBack, onNext }: { establishmentId: string | null; pending: boolean; onBack: () => void; onNext: () => void }) {
  const [value, setValue] = useState("");
  const [saving, startSaving] = useTransition();
  const [suggesting, startSuggest] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function suggest() {
    setNote(null);
    startSuggest(async () => {
      const res = await suggestKeywordsAction(establishmentId ?? undefined);
      if (res.ok && res.items.length > 0) {
        setValue((v) => [...new Set([...v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean), ...res.items])].join(", "));
      } else {
        setNote("No AI suggestions available — add keywords manually below.");
      }
    });
  }

  function save() {
    const fd = new FormData();
    fd.set("keywords", value);
    if (establishmentId) fd.set("establishmentId", establishmentId);
    startSaving(async () => {
      const res = await setTrackingKeywords(fd);
      if (res.ok) onNext();
      else setNote(res.reason === "invalid_input" ? "Enter at least one keyword." : "Couldn't save — try again.");
    });
  }

  return (
    <div>
      <StepHeader n={3} title="Set tracking keywords" sub="The searches you want to rank for locally (e.g. 'emergency dentist austin')." />
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button type="button" className="btn btn--xs" onClick={suggest} disabled={suggesting}>
          <Icon name="sparkle" size={12} /> {suggesting ? "Suggesting…" : "Suggest with AI"}
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="dentist near me, teeth whitening austin, …"
        rows={3}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--line)", fontSize: 13, background: "var(--surface)", color: "var(--ink)", resize: "vertical" }}
      />
      {note && <div style={{ fontSize: 12, color: "var(--rl-muted)", marginTop: 6 }}>{note}</div>}
      <NavButtons onBack={onBack} onNext={save} pending={pending || saving} nextLabel="Save & continue" nextDisabled={value.trim().length === 0} />
    </div>
  );
}

function StepCompetitors({ establishmentId, pending, onBack, onNext }: { establishmentId: string | null; pending: boolean; onBack: () => void; onNext: () => void }) {
  const [suggestions, setSuggestions] = useState<{ name: string; websiteUrl?: string | null }[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [suggesting, startSuggest] = useTransition();
  const [addingName, setAddingName] = useState<string | null>(null);
  const [adding, startAdding] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function suggest() {
    setNote(null);
    startSuggest(async () => {
      const res = await suggestCompetitorsAction(establishmentId ?? undefined);
      if (res.ok && res.items.length > 0) setSuggestions(res.items);
      else setNote("No AI suggestions available — you can add competitors from the Competitors tab later.");
    });
  }

  function add(name: string, websiteUrl?: string | null) {
    setAddingName(name);
    const fd = new FormData();
    fd.set("name", name);
    if (websiteUrl) fd.set("websiteUrl", websiteUrl);
    if (establishmentId) fd.set("establishmentId", establishmentId);
    startAdding(async () => {
      const res = await addCompetitor(fd);
      if (res.ok) setAdded((p) => new Set(p).add(name));
      else setNote(res.reason === "cap_reached" ? "You can track at most 3." : "Couldn't add.");
      setAddingName(null);
    });
  }

  return (
    <div>
      <StepHeader n={4} title="Add competitors" sub="Track up to 3 local rivals to benchmark against (optional)." />
      <button type="button" className="btn btn--xs" onClick={suggest} disabled={suggesting} style={{ marginBottom: 10 }}>
        <Icon name="sparkle" size={12} /> {suggesting ? "Finding…" : "Suggest local rivals"}
      </button>
      {suggestions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {suggestions.slice(0, 3).map((s) => (
            <div key={s.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6 }}>
              <span style={{ fontSize: 13, color: "var(--ink)" }}>{s.name}</span>
              {added.has(s.name) ? (
                <span style={{ color: "var(--ok)", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                  <Icon name="check" size={13} /> Added
                </span>
              ) : (
                <button type="button" className="btn btn--xs btn--pri" onClick={() => add(s.name, s.websiteUrl)} disabled={adding && addingName === s.name}>
                  Add
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {note && <div style={{ fontSize: 12, color: "var(--rl-muted)", marginBottom: 8 }}>{note}</div>}
      <NavButtons onBack={onBack} onNext={onNext} pending={pending} nextLabel="Finish setup" />
    </div>
  );
}

function StepFirstReport() {
  return (
    <div style={{ textAlign: "center", padding: "12px 8px" }}>
      <div style={{ color: "var(--pri)", display: "inline-flex" }}>
        <Icon name="sparkle" size={30} />
      </div>
      <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", margin: "10px 0 4px" }}>
        Building your first report
      </h3>
      <p style={{ fontSize: 13.5, color: "var(--rl-muted)", margin: "0 auto", maxWidth: 420, lineHeight: 1.5 }}>
        We're compiling your baseline now. Reputation metrics are ready immediately; SEO &
        competitor data fills in over the next 24–48 hours. We'll email you when it's complete.
      </p>
      <div style={{ marginTop: 14 }}>
        <button type="button" className="btn btn--sm btn--pri" onClick={() => window.location.reload()}>
          View my dashboard
        </button>
      </div>
    </div>
  );
}

"use client";

import { Icon } from "@/components/shell/icon";
import { saveAssistantConfig } from "@/lib/phone/actions";
import { useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * Phone assistant config form — design-kit stepped cards (Greeting & voice /
 * Behavior / Custom instructions / Enable-disable), restyled to the mockup.
 *
 * Thin "use client" island over the EXISTING `saveAssistantConfig` server action
 * (FormData → void, with its own redirect/revalidate). It is a single real
 * <form> so submission, validation, and the action are untouched — the client
 * bits only drive live character counters and the toggle's visual state. Field
 * `name`s match the action's zod schema EXACTLY:
 *   greeting · voice · language · maxTurns · handoffNumber · endCallPhrases ·
 *   handoffPhrases (mockup's "Transfer trigger phrases") · customInstructions ·
 *   enabled (checkbox "on").
 */

type Assistant = {
  greeting: string;
  voice: string;
  language: string;
  maxTurns: number;
  handoffNumber: string | null;
  endCallPhrases: string[];
  handoffPhrases: string[];
  customInstructions: string | null;
  enabled: boolean;
} | null;

const VOICES: { id: string; label: string }[] = [
  { id: "alice", label: "Alice — Female, Calm, Clear (en-US)" },
  { id: "Polly.Joanna", label: "Joanna — Female, Natural (en-US)" },
  { id: "Polly.Matthew", label: "Matthew — Male, Natural (en-US)" },
  { id: "Polly.Amy", label: "Amy — Female (en-GB)" },
  { id: "Polly.Brian", label: "Brian — Male (en-GB)" },
  { id: "Polly.Aditi", label: "Aditi — Female (en-IN)" },
];

const LANGUAGES: [string, string][] = [
  ["en-US", "English (US)"],
  ["en-GB", "English (UK)"],
  ["en-AU", "English (AU)"],
  ["en-IN", "English (India)"],
  ["es-US", "Spanish (US)"],
  ["es-ES", "Spanish (Spain)"],
  ["fr-FR", "French"],
  ["de-DE", "German"],
];

export function AssistantConfigForm({ assistant }: { assistant: Assistant }) {
  const [greeting, setGreeting] = useState(
    assistant?.greeting ?? "Hi, thanks for calling. How can I help you today?",
  );
  const [instructions, setInstructions] = useState(
    assistant?.customInstructions ?? "",
  );
  const [enabled, setEnabled] = useState(assistant?.enabled ?? false);

  return (
    <form action={saveAssistantConfig} className="pr-stack">
      {/* ── Step 1 — Greeting & voice ── */}
      <section className="pr-card pr-config-art">
        <div className="pr-step-head">
          <span className="pr-step-num">1</span>
          <span className="pr-step-icon">
            <Icon name="chat" size={16} />
          </span>
          <h2 className="pr-step-title">Greeting &amp; voice</h2>
        </div>
        <div className="pr-step-body">
          <label className="pr-field-label" htmlFor="pr-greeting">
            Greeting message
          </label>
          <div className="pr-field-wrap">
            <textarea
              id="pr-greeting"
              name="greeting"
              required
              rows={3}
              minLength={5}
              maxLength={500}
              className="pr-textarea"
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
            />
            <span className="pr-counter">{greeting.length}/500</span>
          </div>
          <p className="pr-helper">
            <Icon name="info" size={14} className="pr-info" />
            This is the first thing callers will hear.
          </p>

          <div className="pr-two-col" style={{ marginTop: 22 }}>
            <div>
              <label className="pr-field-label" htmlFor="pr-voice">
                Voice
                <Icon name="sound" size={13} className="pr-info" />
              </label>
              <select
                id="pr-voice"
                name="voice"
                className="pr-select"
                defaultValue={assistant?.voice ?? "alice"}
              >
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="pr-field-label" htmlFor="pr-language">
                Language
              </label>
              <select
                id="pr-language"
                name="language"
                className="pr-select"
                defaultValue={assistant?.language ?? "en-US"}
              >
                {LANGUAGES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* ── Step 2 — Behavior ── */}
      <section className="pr-card pr-config-art">
        {/* real kit behavior illustration — decorative, lower-right. Kit source
            = Phone Assistant/illustrations/calls.svg: the lavender oval with a
            chat bubble + waveform bubble + purple handset + sparkles, exactly as
            the mockup's behavior card (handoff §9.4). */}
        {/* biome-ignore lint/performance/noImgElement: real kit raster-in-SVG illustration */}
        <img
          className="pr-card-art pr-card-art--behavior"
          src="/assets/repulabs/phone/behavior-illustration.svg"
          alt=""
          aria-hidden="true"
        />
        <div className="pr-step-head">
          <span className="pr-step-num">2</span>
          <span className="pr-step-icon">
            <Icon name="sliders" size={16} />
          </span>
          <h2 className="pr-step-title">Behavior</h2>
        </div>
        <div className="pr-step-body">
          <div className="pr-two-col">
            <div>
              <label className="pr-field-label" htmlFor="pr-maxturns">
                Max turns per call
                <Icon name="info" size={14} className="pr-info" />
              </label>
              <input
                id="pr-maxturns"
                type="number"
                name="maxTurns"
                min={2}
                max={30}
                defaultValue={assistant?.maxTurns ?? 12}
                className="pr-input"
              />
              <p className="pr-helper">
                Maximum back-and-forth turns before the call ends.
              </p>
            </div>
            <div>
              <label className="pr-field-label" htmlFor="pr-handoff">
                Handoff phone number
                <Icon name="info" size={14} className="pr-info" />
              </label>
              <input
                id="pr-handoff"
                name="handoffNumber"
                defaultValue={assistant?.handoffNumber ?? ""}
                placeholder="+1 (555) 123-4567"
                className="pr-input"
              />
              <p className="pr-helper">
                When callers ask for a human, forward to this number.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <label className="pr-field-label" htmlFor="pr-endcall">
              End-call phrase
            </label>
            <input
              id="pr-endcall"
              name="endCallPhrases"
              defaultValue={(
                assistant?.endCallPhrases ?? [
                  "goodbye",
                  "bye now",
                  "have a good day",
                  "hang up",
                ]
              ).join(", ")}
              className="pr-input"
            />
            <p className="pr-helper">
              Phrases that will be used when the call should end.
            </p>
          </div>

          <div style={{ marginTop: 18 }}>
            <label className="pr-field-label" htmlFor="pr-transfer">
              Transfer trigger phrases
              <Icon name="info" size={14} className="pr-info" />
            </label>
            <input
              id="pr-transfer"
              name="handoffPhrases"
              defaultValue={(
                assistant?.handoffPhrases ?? [
                  "speak to a human",
                  "representative",
                  "manager",
                ]
              ).join(", ")}
              className="pr-input"
            />
            <p className="pr-helper">
              <Icon name="info" size={14} className="pr-info" />
              Caller intent words that trigger an immediate human transfer.
            </p>
          </div>
        </div>
      </section>

      {/* ── Step 3 — Custom instructions ── */}
      <section className="pr-card">
        <div className="pr-step-head">
          <span className="pr-step-num">3</span>
          <span className="pr-step-icon">
            <Icon name="survey" size={16} />
          </span>
          <h2 className="pr-step-title">Custom instructions</h2>
          <span style={{ marginLeft: "auto" }}>
            <a href="/ai/training" className="pr-btn pr-btn--sec pr-btn--xs">
              <Icon name="info" size={13} style={{ color: "var(--pr-warn)" }} />
              View tips
            </a>
          </span>
        </div>
        <div className="pr-step-body">
          <p
            className="pr-helper"
            style={{ marginTop: 0, marginBottom: 12 }}
          >
            Layered on top of your AI training profile.{" "}
            <strong style={{ color: "var(--pr-ink-2)" }}>
              Use this for phone-specific guidance.
            </strong>
          </p>
          <div className="pr-field-wrap pr-instr-wrap">
            <span className="pr-instr-strip" aria-hidden="true">
              <Icon name="sparkle" size={15} stroke={2} />
            </span>
            <textarea
              name="customInstructions"
              aria-label="Custom instructions"
              rows={5}
              maxLength={2000}
              className="pr-textarea pr-instr-textarea"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={
                "Always ask for the caller's name first if they haven't given it.\nIf they're asking about a refund, immediately transfer them — don't try to handle it.\nIf the call lasts more than 5 minutes, suggest they email us at support@repulabs.com."
              }
            />
            <span className="pr-counter">{instructions.length}/2000</span>
          </div>
        </div>
      </section>

      {/* ── Step 4 — Enable / disable ── */}
      <section className="pr-card pr-config-art">
        {/* real kit shield illustration — decorative, top-right */}
        {/* biome-ignore lint/performance/noImgElement: real kit raster-in-SVG illustration */}
        <img
          className="pr-card-art pr-card-art--shield"
          src="/assets/repulabs/phone/enable-shield.svg"
          alt=""
          aria-hidden="true"
        />
        <div className="pr-step-head">
          <span className="pr-step-num">4</span>
          <span className="pr-step-icon">
            <Icon name="lock" size={16} />
          </span>
          <h2 className="pr-step-title">Enable / disable</h2>
        </div>
        <div className="pr-step-body">
          <div className="pr-toggle-row">
            <label className="pr-switch">
              <input
                type="checkbox"
                name="enabled"
                role="switch"
                aria-checked={enabled}
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span className="pr-switch__track" />
            </label>
            <div>
              <strong style={{ fontSize: 13.5, color: "var(--pr-ink)" }}>
                Enable AI receptionist on all configured numbers.
              </strong>
              <p className="pr-helper" style={{ marginTop: 4 }}>
                If disabled, incoming calls go straight to the handset or
                voicemail.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="pr-save-row">
        <SaveButton />
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="pr-btn pr-btn--pri" disabled={pending}>
      <Icon name="download" size={14} />
      {pending ? "Saving…" : "Save configuration"}
    </button>
  );
}

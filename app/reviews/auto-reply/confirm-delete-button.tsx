"use client";

import { Icon } from "@/components/shell/icon";

/**
 * Tiny client component to guard the destructive delete with a native
 * `confirm()` dialog. We use confirm() rather than a modal library for
 * two reasons:
 *
 *   1. Zero deps. A11y is handled by the browser.
 *   2. Form-submission semantics: returning false from onClick on a
 *      submit button cancels the submission. With a modal we'd need
 *      to either preventDefault and re-submit programmatically, or
 *      run a useTransition with the server action — all extra code
 *      for a confirm prompt the host sees maybe once a year.
 *
 * Progressively enhanced: without JS the button still submits — the
 * confirm guard simply doesn't run. That's strictly better than a
 * library modal that breaks entirely when JS fails.
 */
export function ConfirmDeleteRuleButton({ ruleName }: { ruleName: string }) {
  return (
    <button
      type="submit"
      className="btn"
      style={{ fontSize: 11.5, color: "var(--bad)" }}
      title={`Delete rule "${ruleName}"`}
      onClick={(e) => {
        const ok = window.confirm(
          `Delete the auto-reply rule "${ruleName}"?\n\nReplies that already drafted under it will keep their drafts. Reviews that arrive after deletion will skip this rule.`,
        );
        if (!ok) e.preventDefault();
      }}
    >
      <Icon name="trash" size={12} />
      Delete
    </button>
  );
}

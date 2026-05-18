/**
 * Auto-reply rule form-state shape + initial constant.
 *
 * Kept OUT of actions.ts because Next 15 enforces "use server" modules to
 * only export async functions. The form-state shape is type-level, but the
 * initial-state constant is a plain object — exporting it from a server
 * module triggers a build-time error.
 *
 * This module is plain TS; both server-action and client-form code can
 * import from it freely.
 */

export interface AutoReplyRuleFormState {
  error: string | null;
  /** Field-specific errors so the form can highlight the offending input. */
  fieldErrors?: Record<string, string>;
}

export const initialAutoReplyRuleState: AutoReplyRuleFormState = { error: null };

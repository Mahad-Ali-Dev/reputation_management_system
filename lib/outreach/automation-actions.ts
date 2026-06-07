"use server";
/**
 * Server-action shim for automation-rule mutations.
 *
 * Next.js requires server actions imported by client components to be defined
 * (not just re-exported) inside a module with a top-level "use server" directive.
 */
import { upsertAutomationRule as _upsertAutomationRule } from "./automation";

export async function upsertAutomationRule(form: FormData): Promise<void> {
  return _upsertAutomationRule(form);
}

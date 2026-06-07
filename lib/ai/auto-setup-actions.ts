"use server";
/**
 * Server-action shim for auto-setup.
 *
 * Next.js requires server actions imported by client components to be defined
 * (not just re-exported) inside a module with a top-level "use server" directive.
 */
import { scanAndBuild as _scanAndBuild } from "./auto-setup";
import type { ScanResult } from "./auto-setup";

export type { ScanResult };

export async function scanAndBuild(form: FormData): Promise<ScanResult> {
  return _scanAndBuild(form);
}

/**
 * Autopilot error types (Module 15).
 *
 * Kept in a PLAIN module (not the `"use server"` config-actions file) because a
 * `"use server"` module may only export async functions — exporting a class from
 * there breaks the Next.js server-actions build. Both the server action and the
 * client toggle import the error from here.
 */

/** Thrown when a non-entitled org tries to enable Autopilot. UI → upsell. */
export class AutopilotNotEntitledError extends Error {
  readonly code = "autopilot_not_entitled";
  constructor() {
    super("Reputation Autopilot requires a paid plan.");
    this.name = "AutopilotNotEntitledError";
  }
}

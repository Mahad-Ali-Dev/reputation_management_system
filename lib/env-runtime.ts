/**
 * Read an environment variable at RUNTIME rather than build time.
 *
 * `process.env.SOME_FLAG` — dot access with a literal key — is statically
 * replaced during the build by webpack's DefinePlugin. If the variable wasn't
 * present when `next build` ran, the compiled output contains `undefined` as a
 * constant: adding it to `.env` afterwards and restarting changes nothing,
 * because there is no longer any lookup to perform. The only fix is a rebuild,
 * which is a surprising requirement for "turn this flag on".
 *
 * A computed key can't be statically analysed, so it survives compilation and
 * reads the real `process.env` when called. That makes a flag take effect on a
 * restart, which is what an operator expects.
 *
 * Use this for OPERATIONAL toggles an admin flips on a live server. Ordinary
 * config read once at startup can keep using `process.env.X` directly.
 */

/** Runtime lookup — the indirection is what defeats build-time inlining. */
export function runtimeEnv(name: string): string | undefined {
  // Assigning to a local first keeps the key non-literal at the access site,
  // so the bundler can't fold it back into a constant.
  const key = name;
  return process.env[key];
}

/** True only for the exact string "true" — an unset flag must never read as on. */
export function runtimeFlag(name: string): boolean {
  return runtimeEnv(name) === "true";
}

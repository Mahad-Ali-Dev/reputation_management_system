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

/**
 * Runtime lookup, with the build-time value as a fallback.
 *
 * `buildTimeValue` is meant to be passed as `process.env.THE_NAME` — dot access,
 * which the bundler inlines. Supplying both covers either deployment style:
 *
 *   - the value reaches the running process (systemd EnvironmentFile, or Next
 *     loading .env at startup) → the runtime lookup wins, and a restart is
 *     enough to change it;
 *   - it doesn't → the value compiled into the build is used, exactly as before.
 *
 * Relying on the runtime lookup ALONE would be a regression on a host that
 * passes nothing to the process: `process.env[key]` would be undefined even
 * though the build had the value baked in. Preferring runtime, falling back to
 * build, is strictly better than either on its own.
 */
export function runtimeEnv(name: string, buildTimeValue?: string): string | undefined {
  // Assigning to a local first keeps the key non-literal at the access site,
  // so the bundler can't fold it back into a constant.
  const key = name;
  return process.env[key] ?? buildTimeValue;
}

/**
 * Truthy env flag.
 *
 * Accepts the forms people actually write in a `.env` — `true`, `1`, `yes`, `on`
 * — case- and whitespace-insensitive. Matching only the exact string "true" is
 * a trap: `LINKEDIN_PUBLISH_ENABLED=1` is an entirely reasonable thing to write,
 * silently read as OFF, and produced a failure ("publishing is switched off")
 * that flatly contradicted the config the operator was looking at.
 *
 * Still false for unset, empty, `false`, `0`, `no`, `off` or anything else, so a
 * flag can never be on by accident.
 */
const TRUTHY = new Set(["true", "1", "yes", "on"]);

export function runtimeFlag(name: string, buildTimeValue?: string): boolean {
  const raw = runtimeEnv(name, buildTimeValue);
  return raw !== undefined && TRUTHY.has(raw.trim().toLowerCase());
}

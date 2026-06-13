/**
 * isolate-overrides-env — reads the ISOLATE_OVERRIDES env var and converts it to a boolean.
 * Extracted as a standalone module so cli.ts can import it without triggering main() side effects,
 * and so the unit test can import the helper directly.
 *
 * Truthy values: '1', 'true' (case-insensitive). Everything else (unset, '', '0', 'false') → false.
 */

/**
 * Returns `true` when the given env contains `ISOLATE_OVERRIDES` set to `'1'` or `'true'`
 * (case-insensitive); `false` otherwise.
 */
export function isolateOverridesFromEnv(env: NodeJS.ProcessEnv): boolean {
  const raw = env['ISOLATE_OVERRIDES'];
  if (raw === undefined || raw === '') return false;
  const lower = raw.toLowerCase();
  return lower === '1' || lower === 'true';
}

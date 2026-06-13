/**
 * The fork's Support matrix — the install-free baseline of adopted CC versions.
 *
 * Reset to `['2.1.176']` (ADR 0010): pre-baseline versions (≤ 2.1.173) leave the
 * active matrix; their adoption records are retained as history but no longer
 * assert the Four-zeros bar. 2.1.177 is the first `/adopt` target.
 *
 * Maintenance: add here when a version is adopted outside the `/adopt` flow.
 * The operative entry is the newest: it tells `aheadOfEvery` what "current" means.
 */
export const SUPPORT_MATRIX_SEED: readonly string[] = ['2.1.176'];

/**
 * The live Support matrix: the adopted-version {@link SUPPORT_MATRIX_SEED} unioned
 * with the proposal-derived versions, deduplicated. PURE — the `gh` fetch that
 * supplies `proposalVersions` lives in the CLI transport layer.
 */
export function supportMatrix(proposalVersions: readonly string[]): string[] {
  return [...new Set([...SUPPORT_MATRIX_SEED, ...proposalVersions])];
}

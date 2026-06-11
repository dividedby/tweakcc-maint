/**
 * The fork's Support matrix — composed install-free for the Release detector.
 *
 * The detector dedups a candidate against the Support matrix (release-detector.ts →
 * {@link decide}: a version already in the matrix, or not strictly newer than every
 * matrix entry, is never proposed). The detector CRON runner installs no Claude Code,
 * so it cannot use the GATE's installed-version-only matrix
 * (real-adoption-environment.ts → `listMatrix` = `[claude --version]`, the #22 gate
 * split) — there `claude --version` is empty and throws (the #199 cron failure).
 *
 * Instead the matrix is built without a local install: this committed SEED of
 * already-adopted versions, UNIONed with the versions of every `adopt CC X.Y.Z`
 * proposal (open+closed, read via `gh` in release-detector-cli.ts).
 *
 * Maintenance: add to {@link SUPPORT_MATRIX_SEED} when a version is adopted OUTSIDE
 * the auto-adopt proposal flow (e.g. a hand-run release-adoption). A version adopted
 * THROUGH a proposal needs no SEED entry — it is picked up from the proposal title
 * automatically. The operative entry is the newest: it suppresses a spurious proposal
 * for the current latest.
 */
export const SUPPORT_MATRIX_SEED: readonly string[] = ['2.1.169', '2.1.170', '2.1.172', '2.1.173'];

/**
 * The live Support matrix: the adopted-version {@link SUPPORT_MATRIX_SEED} unioned
 * with the proposal-derived versions, deduplicated. PURE — the `gh` fetch that
 * supplies `proposalVersions` lives in the CLI transport layer.
 */
export function supportMatrix(proposalVersions: readonly string[]): string[] {
  return [...new Set([...SUPPORT_MATRIX_SEED, ...proposalVersions])];
}

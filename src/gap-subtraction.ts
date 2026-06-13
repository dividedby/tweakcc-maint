/**
 * gap-subtraction — Phase 4 helper for the Verify-and-improve path (Path B,
 * /adopt slice 3, #244).
 *
 * Given a ranked list of prompt candidates and skrabe's live lcc override files,
 * returns only the "genuine gaps": candidates that clear the Lobotomy bar AND have
 * no active override in the lcc repo. A prompt he already overrides (even with a
 * placeholder-quality stub that happens to be non-blank) is covered, not a gap.
 *
 * "Absent or empty-stub" is the absence test:
 *   - absent: no file for the promptId in any model-set dir → no override at all.
 *   - empty-stub: file exists but its body (non-frontmatter) is blank → inert.
 *
 * Active = body is non-blank. An active override means he covers the prompt;
 * subtract it. Reuses `classifyOverride` / `extractOverrideBody` from drift-triage.
 *
 * PURE — no I/O. The caller supplies override files (already read from the lcc clone).
 */

import { classifyOverride } from './drift-triage.js';
import type { NamedOverrideFile } from './drift-triage.js';
import type { LobotomyRanking } from './lobotomy-ranker.js';

/**
 * One genuine gap: a high-potential prompt id that skrabe has not actively overridden.
 * Carries the full ranking for Phase 4 report emission.
 */
export interface GapCandidate {
  /** The prompt id that has no active lcc override. */
  promptId: string;
  /** The full Lobotomy ranking for this candidate (score, axes, clearsBar). */
  ranking: LobotomyRanking;
}

/**
 * Subtract skrabe's live lcc override set from a ranked candidate list.
 * Returns only the genuine gaps: candidates that clear the bar AND have no
 * active override (absent or empty-stub) across ALL model-set dirs.
 *
 * A candidate that does NOT clear the bar is never a genuine gap, regardless
 * of override status — no point surfacing low-signal prompts.
 *
 * PURE — no I/O.
 */
export function subtractActiveOverrides(
  rankings: readonly LobotomyRanking[],
  lccOverrides: readonly NamedOverrideFile[],
): GapCandidate[] {
  return rankings
    .filter((r) => r.clearsBar)
    .filter((r) => !hasActiveOverride(r.promptId, lccOverrides))
    .map((r) => ({ promptId: r.promptId, ranking: r }));
}

/**
 * True iff skrabe has at least one ACTIVE (non-empty-stub, non-absent) override
 * for `promptId` in any model-set dir. PURE.
 */
export function hasActiveOverride(promptId: string, overrides: readonly NamedOverrideFile[]): boolean {
  const files = overrides.filter((f) => f.promptId === promptId);
  return files.some((f) => classifyOverride(f) === 'active');
}

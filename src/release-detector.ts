/**
 * ReleaseDetector — decide whether a newly-published CC version warrants
 * proposing an adoption, and (propose-only) propose it (CONTEXT.md →
 * "ReleaseDetector", "Support matrix", "propose-only"; design doc → Module Map).
 *
 * Two entry points:
 * - {@link decide} — PURE. Given the latest npm version, the Support matrix, and
 *   the versions of already-open proposals, it returns a {@link ProposalDecision}
 *   saying whether to propose and for which version. It performs no I/O.
 * - {@link run} — thin orchestration: ask the NpmReleaseSource for the latest
 *   version, run `decide`, and (if it says so) hand ONE proposal to the
 *   IssuePublisher. It never starts an adoption or mutates a leaf — the only
 *   outward action it can take is publishing a proposal (propose-only).
 *
 * A version is "new" iff it is strictly newer (semver) than EVERY Support-matrix
 * version. A version already in the matrix, or already covered by an open
 * proposal, is never (re-)proposed.
 */

import type { NpmReleaseSource } from './npm-release-source.js';
import type { IssuePublisher } from './issue-publisher.js';

/** Why `decide` reached its verdict — names the gate that decided the outcome. */
export type DecisionReason =
  /** Latest is strictly newer than every matrix version and unproposed → propose. */
  | 'new-version'
  /** Latest is already a Support-matrix version → nothing to adopt. */
  | 'already-in-matrix'
  /** An open proposal already covers latest → don't duplicate. */
  | 'already-proposed'
  /** The npm response was malformed/unusable → decline rather than false-propose. */
  | 'no-latest'
  /** Latest is not newer than the matrix's newest version → nothing to do. */
  | 'not-newer';

/**
 * The verdict of the pure decision. `propose` is true for exactly the
 * `new-version` reason; when true, `ccVersion` is the single version to propose.
 */
export interface ProposalDecision {
  /** Whether the detector should propose an adoption. */
  propose: boolean;
  /** The version to propose — present iff `propose` is true. */
  ccVersion?: string;
  /** Why this verdict was reached. */
  reason: DecisionReason;
}

/** A semver-ish triple plus optional prerelease tail, for ordering. */
interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Parse a `MAJOR.MINOR.PATCH` version, ignoring a leading `v` and any
 * build/prerelease suffix. Returns null on anything unparseable so a malformed
 * matrix or latest never crashes into a false proposal.
 */
function parse(version: string): ParsedVersion | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (m === null) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** Compare two parsed versions: negative if a<b, 0 if equal, positive if a>b. */
function compare(a: ParsedVersion, b: ParsedVersion): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/** True iff two version strings denote the same MAJOR.MINOR.PATCH. */
function sameVersion(a: string, b: string): boolean {
  const pa = parse(a);
  const pb = parse(b);
  if (pa === null || pb === null) return a.trim() === b.trim();
  return compare(pa, pb) === 0;
}

/**
 * Decide whether `latestNpm` warrants a proposal. PURE — no I/O.
 *
 * Proposes iff `latestNpm` parses, is strictly newer than EVERY Support-matrix
 * version, and no open proposal already covers it. Declines (proposing nothing)
 * when latest is null/unparseable, already in the matrix, already proposed, or
 * not newer than the matrix's newest version.
 *
 * @param latestNpm the latest published CC version, or null on a malformed response.
 * @param matrix the Support matrix (the versions the fork already supports).
 * @param openProposals versions already covered by an open adoption proposal.
 */
export function decide(
  latestNpm: string | null,
  matrix: readonly string[],
  openProposals: readonly string[],
): ProposalDecision {
  if (latestNpm === null) {
    return { propose: false, reason: 'no-latest' };
  }

  const parsedLatest = parse(latestNpm);
  if (parsedLatest === null) {
    // Unparseable latest — treat like a malformed response, never propose.
    return { propose: false, reason: 'no-latest' };
  }

  if (matrix.some((v) => sameVersion(v, latestNpm))) {
    return { propose: false, reason: 'already-in-matrix' };
  }

  // Strictly newer than EVERY matrix version? (Versions that don't parse are
  // skipped from the comparison but cannot equal latest — handled above.)
  const newerThanAll = matrix.every((v) => {
    const pv = parse(v);
    return pv === null || compare(parsedLatest, pv) > 0;
  });
  if (!newerThanAll) {
    return { propose: false, reason: 'not-newer' };
  }

  if (openProposals.some((v) => sameVersion(v, latestNpm))) {
    return { propose: false, reason: 'already-proposed' };
  }

  return { propose: true, ccVersion: latestNpm, reason: 'new-version' };
}

/** The seams `run` orchestrates, plus the state `decide` needs. */
export interface RunSources {
  /** Where the latest published CC version comes from. */
  npm: NpmReleaseSource;
  /** Where a proposal is published (propose-only — never mutates a leaf). */
  publisher: IssuePublisher;
  /** The Support matrix to compare against. */
  matrix: readonly string[];
  /** Versions already covered by an open proposal (for dedup). */
  openProposals: readonly string[];
}

/**
 * Orchestrate one detector run: fetch latest → decide → (maybe) publish ONE
 * proposal. Thin by design — all judgment lives in {@link decide}. Returns the
 * decision so callers (and tests) can see what happened. Publishes at most one
 * proposal and takes no other outward action (propose-only).
 */
export async function run(sources: RunSources): Promise<ProposalDecision> {
  const { latest } = await sources.npm.fetchLatest();
  const decision = decide(latest, sources.matrix, sources.openProposals);

  if (decision.propose && decision.ccVersion !== undefined) {
    await sources.publisher.publish({ ccVersion: decision.ccVersion });
  }

  return decision;
}

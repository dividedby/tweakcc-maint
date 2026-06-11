/**
 * alignment-snapshot — the AUTOMATION counterpart of the CLAUDE.md "Alignment
 * preflight — reconcile against his current state first" rule (landed PR #218) and
 * the alignment-first posture in MEMORY. The human rule says: before authoring OR
 * proposing any leaf contribution, reconcile against skrabe's CURRENT state. This
 * bakes that into the proposal/detector substrate so it is not only human
 * discipline (#216).
 *
 * On each adopt proposal it gathers a machine-readable snapshot of skrabe's current
 * state across the leaves:
 *   - leaf `main` HEAD sha + recent commit subjects;
 *   - open AND recently-closed PRs (he often already did the work — his own 2.1.172
 *     realign closed lcc#9; a redundant tool closed tweakcc-fixed#8);
 *   - his review comments (his actual asks / closure reasons);
 *   - his published `tweakcc-fixed` npm version vs our **Support matrix**
 *     (CONTEXT.md → "Support matrix") — is he ahead of us?
 *
 * Two outward uses, both cockpit-safe:
 *   - {@link postAlignmentSnapshot} surfaces it as an ADDITIVE proposal comment
 *     (reuses the comment-only {@link ProposalCommenter} seam — no close/rewrite),
 *     so the evidence sits on the proposal alongside the #213 anchor-candidate diff;
 *   - {@link screenCandidatesAgainstHead} is the precheck the realign-candidate
 *     producer (#213) consults: a candidate whose proposed text his HEAD already
 *     carries is flagged REDUNDANT, so it is suppressed BEFORE it becomes a leaf PR
 *     (the lcc#9 / tweakcc-fixed#8 stale-premise failure mode, prevented in code).
 *
 * Every read is behind an injected seam — {@link LeafStateSource} for the git/`gh`
 * leaf reads, and the existing {@link NpmReleaseSource} for his npm version — so the
 * producer is unit-testable with fakes (no git, no `gh`, no npm), mirroring the
 * all-fake wiring in #197/#200/#213. Strictly READ-ONLY against the leaves (cockpit
 * rule): it never writes to a leaf.
 */

import type { NpmReleaseSource } from './npm-release-source.js';
import type { ProposalCommenter } from './adoption-writeback.js';
import type { AnchorCandidate } from './anchor-candidate-diff.js';

/** One PR on a leaf, reduced to what the snapshot needs (number + title + head sha + merge state). */
export interface LeafPr {
  /** The PR number on the leaf (rendered as `#N`). */
  number: number;
  /** The PR title — the area/intent the snapshot reconciles against. */
  title: string;
  /** The PR's head sha (so a recently-closed PR's content can be matched). */
  headSha: string;
  /** Whether a recently-closed PR was merged (vs closed unmerged, e.g. lcc#9). Open PRs omit it. */
  merged?: boolean;
}

/** A point-in-time read of one leaf's current state — the unit the snapshot reconciles against. */
export interface LeafState {
  /** The leaf `owner/name` (e.g. `skrabe/tweakcc-fixed`). */
  leaf: string;
  /** The leaf `main` HEAD sha — "his current state" the rule reconciles against. */
  headSha: string;
  /** Recent commit subjects on `main` (he often already did the work). */
  recentSubjects: string[];
  /** Open PRs on the leaf. */
  openPrs: LeafPr[];
  /** Recently-closed PRs (merged or closed-unmerged) — the rule reads BOTH. */
  recentlyClosedPrs: LeafPr[];
  /** His review comments (his actual asks / closure reasons — e.g. "redundant with gates I run"). */
  reviewComments: string[];
}

/**
 * The injected seam for reading a leaf's current state. Prod will shell `git` /
 * `gh` (read-only); tests inject a fake. The control plane only PREPARES verified
 * PRs and reads the leaves — it never writes to one (cockpit rule), so this seam
 * has no write affordance.
 */
export interface LeafStateSource {
  /** Read the current state of one leaf repo (read-only). */
  fetchLeafState(leaf: string): Promise<LeafState>;
}

/** The whole alignment snapshot for a proposal: his published-CLI-vs-matrix posture + per-leaf state. */
export interface AlignmentSnapshot {
  /** His published `tweakcc-fixed` CLI version, or null on a malformed npm response. */
  publishedCliVersion: string | null;
  /** Our Support matrix (CONTEXT.md → "Support matrix") the published version is compared against. */
  supportMatrix: readonly string[];
  /** True iff his published version is strictly newer than every Support-matrix version (he is ahead). */
  aheadOfMatrix: boolean;
  /** Per-leaf current state, in `leafRepos` order. */
  leaves: LeafState[];
}

/** The seams + state a snapshot gather needs. */
export interface GatherSources {
  /** Read-only leaf state reads. */
  leaves: LeafStateSource;
  /** His published `tweakcc-fixed` version (reuses the NpmReleaseSource seam). */
  npm: NpmReleaseSource;
  /** The leaf repos to snapshot, in render order. */
  leafRepos: readonly string[];
  /** Our Support matrix to compare his published version against. */
  supportMatrix: readonly string[];
}

/** A semver-ish triple, for the ahead-of-matrix comparison. */
function parse(version: string): { major: number; minor: number; patch: number } | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (m === null) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** True iff `version` is strictly newer (semver) than EVERY matrix version (he is ahead of us). */
function aheadOfEvery(version: string | null, matrix: readonly string[]): boolean {
  if (version === null) return false;
  const v = parse(version);
  if (v === null) return false;
  return matrix.every((m) => {
    const p = parse(m);
    if (p === null) return true;
    const cmp = v.major - p.major || v.minor - p.minor || v.patch - p.patch;
    return cmp > 0;
  });
}

/**
 * Gather skrabe's current state into an {@link AlignmentSnapshot}. Read-only: it
 * only consults the injected leaf/npm seams. A malformed npm response is tolerated
 * (`publishedCliVersion: null`, `aheadOfMatrix: false`) — never thrown — so a flaky
 * registry can't crash a proposal run (mirrors NpmReleaseSource's contract).
 */
export async function gatherAlignmentSnapshot(sources: GatherSources): Promise<AlignmentSnapshot> {
  const leaves: LeafState[] = [];
  for (const leaf of sources.leafRepos) {
    leaves.push(await sources.leaves.fetchLeafState(leaf));
  }
  const { latest } = await sources.npm.fetchLatest();
  return {
    publishedCliVersion: latest,
    supportMatrix: sources.supportMatrix,
    aheadOfMatrix: aheadOfEvery(latest, sources.supportMatrix),
    leaves,
  };
}

/** One realign candidate screened against his HEAD — keep, or suppress as redundant. */
export interface ScreenedCandidate {
  /** The #213 anchor candidate being screened. */
  candidate: AnchorCandidate;
  /**
   * True iff his current HEAD already carries the candidate's proposed text — the
   * change is redundant and is suppressed BEFORE it can become a leaf PR (the
   * lcc#9 / tweakcc-fixed#8 stale-premise failure mode, prevented in code).
   */
  redundant: boolean;
}

/** Has any recent commit subject on his HEAD already adopted this proposed text? */
function headCovers(state: LeafState, proposedText: string): boolean {
  const needle = proposedText.trim();
  if (needle.length === 0) return false;
  return state.recentSubjects.some((s) => s.includes(needle));
}

/**
 * Screen #213 anchor candidates against skrabe's current HEAD: a moved candidate
 * whose proposed text his HEAD already carries is flagged `redundant` (suppress
 * before it becomes a leaf PR — the alignment preflight, in code). An unmoved or
 * `zeroMatch` candidate is never redundant: there is no proposed change to suppress.
 * PURE — no I/O.
 */
export function screenCandidatesAgainstHead(
  candidates: readonly AnchorCandidate[],
  headState: LeafState,
): ScreenedCandidate[] {
  return candidates.map((candidate) => {
    const suppressible = candidate.moved && !candidate.zeroMatch && candidate.proposedText !== undefined;
    const redundant = suppressible && headCovers(headState, candidate.proposedText!);
    return { candidate, redundant };
  });
}

/** A fenced block of `text`, fence length picked so the block never collides with its content. */
function fenced(text: string): string {
  let fence = '```';
  while (text.includes(fence)) fence += '`';
  return `${fence}\n${text}\n${fence}`;
}

/** Render one leaf's state as a markdown section. */
function renderLeaf(state: LeafState): string {
  const openPrs =
    state.openPrs.length > 0
      ? state.openPrs.map((p) => `  - #${p.number} ${p.title} (\`${p.headSha}\`)`).join('\n')
      : '  - (none)';
  const closedPrs =
    state.recentlyClosedPrs.length > 0
      ? state.recentlyClosedPrs
          .map((p) => `  - #${p.number} ${p.title} (\`${p.headSha}\`, ${p.merged ? 'merged' : 'closed unmerged'})`)
          .join('\n')
      : '  - (none)';
  const subjects = state.recentSubjects.length > 0 ? fenced(state.recentSubjects.join('\n')) : '_(no recent commits)_';
  const comments =
    state.reviewComments.length > 0 ? state.reviewComments.map((c) => `> ${c}`).join('\n>\n') : '_(none captured)_';

  return [
    `### \`${state.leaf}\` — HEAD \`${state.headSha}\``,
    '',
    '**Recent commit subjects:**',
    subjects,
    '',
    '**Open PRs:**',
    openPrs,
    '',
    '**Recently-closed PRs:**',
    closedPrs,
    '',
    '**His review comments:**',
    comments,
  ].join('\n');
}

/**
 * Render the alignment snapshot as a proposal-comment markdown body. PURE — no I/O.
 * Leads with the published-CLI-vs-Support-matrix posture (is he ahead of us?), then
 * one section per leaf (HEAD + recent subjects + open/recently-closed PRs + his
 * review comments), then the read-only/additive disclaimer (it opens no leaf PR).
 */
export function renderAlignmentSnapshot(snap: AlignmentSnapshot): string {
  const cli = snap.publishedCliVersion ?? '(npm response unavailable)';
  const posture = snap.aheadOfMatrix
    ? `He is **ahead** of our Support matrix — reconcile every candidate against his HEAD before proposing.`
    : `His published version is within our Support matrix.`;

  const header = [
    '## Alignment snapshot — reconcile against skrabe\'s current state',
    '',
    'Automation counterpart of the CLAUDE.md **Alignment preflight** rule (#218): a ' +
      'machine-gathered, **read-only** snapshot of skrabe\'s current leaf state, attached ' +
      'as **additive** evidence. It opens **no leaf PR** and mutates nothing — a contribution ' +
      'ships only if it is still true against his HEAD and still not something he runs himself.',
    '',
    `**Published \`tweakcc-fixed\` CLI:** \`${cli}\` · **Support matrix:** ${snap.supportMatrix
      .map((v) => `\`${v}\``)
      .join(', ')}`,
    '',
    posture,
    '',
  ].join('\n');

  return [header, ...snap.leaves.map(renderLeaf)].join('\n\n');
}

/**
 * Attach the rendered alignment snapshot onto the proposal issue as an ADDITIVE
 * comment, reusing the cockpit-safe {@link ProposalCommenter} seam (comment-only,
 * no close/rewrite affordance). Evidence, not an auto-PR (cockpit rule).
 */
export async function postAlignmentSnapshot(
  commenter: ProposalCommenter,
  issue: number,
  snap: AlignmentSnapshot,
): Promise<void> {
  await commenter.comment({ issue, body: renderAlignmentSnapshot(snap) });
}

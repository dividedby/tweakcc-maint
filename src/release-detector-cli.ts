/**
 * release-detector-cli — the runnable composition root for the Release detector
 * (#197), invocable as `pnpm tsx src/release-detector-cli.ts`. It mirrors
 * cli.ts / behavioral-ab-cli.ts as transport (not a domain module, design doc):
 * wire the real {@link RealNpmReleaseSource} + {@link RealIssuePublisher} seams,
 * read the Support matrix + already-open proposals, run the UNCHANGED
 * {@link run} (release-detector.ts), and print the {@link ProposalDecision}.
 *
 *   pnpm tsx src/release-detector-cli.ts
 *
 * Propose-only (CONTEXT.md → "propose-only"): the sole outward action this entry
 * point can take is publishing ONE proposal carrying a machine-readable
 * `cc_version` marker (issue-publisher.ts → {@link formatProposal}) — it never
 * starts an adoption or mutates a leaf. The first real cron invocation is the
 * separate workflow slice (#199).
 *
 * The wiring is split into {@link runReleaseDetectorCli}, which takes every
 * real-vs-fake seam (npm source / publisher / matrix / open-proposal lister) plus
 * the log + exit sinks injected, so the all-fake wiring test (#197) drives it
 * end-to-end with NO real network, NO real `gh`, and without calling the real
 * `process.exit`. The thin {@link main} binds the production seams.
 */

import { run } from './release-detector.js';
import { RealNpmReleaseSource } from './real-npm-release-source.js';
import { RealIssuePublisher } from './real-issue-publisher.js';
import { supportMatrix } from './support-matrix.js';
import { runSync } from './leaf-shell.js';
import { argv } from 'node:process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NpmReleaseSource } from './npm-release-source.js';
import type { IssuePublisher } from './issue-publisher.js';
import type { ProposalDecision } from './release-detector.js';

export interface ReleaseDetectorCliDeps {
  /** Where the latest published CC version comes from; defaults to {@link RealNpmReleaseSource}.
   *  Injected so the wiring test runs no real network call. */
  npm: NpmReleaseSource;
  /** Where a proposal is published; defaults to {@link RealIssuePublisher}. Injected so the test
   *  runs no real `gh issue create` and asserts propose-only via a recording fake. */
  publisher: IssuePublisher;
  /** The Support matrix to compare against (the versions the fork already supports). */
  matrix: readonly string[];
  /** Versions already covered by an open proposal — the dedup source (one proposal per version). */
  openProposals: readonly string[];
  /** Where the printed decision goes; defaults to `console.log`. */
  log: (line: string) => void;
  /** The exit sink; defaults to `process.exit`. Injected so the test never exits the runner. */
  exit: (code: number) => void;
}

/**
 * The testable wiring: run the UNCHANGED detector {@link run} over the injected
 * seams, print the {@link ProposalDecision}, and exit 0. Propose-only — `run`
 * publishes at most one proposal and takes no other outward action. Always exits
 * 0: detection is advisory plumbing, not a gate. Returns the decision so the
 * wiring test can assert what happened.
 */
export async function runReleaseDetectorCli(deps: ReleaseDetectorCliDeps): Promise<ProposalDecision> {
  try {
    const decision = await run({
      npm: deps.npm,
      publisher: deps.publisher,
      matrix: deps.matrix,
      openProposals: deps.openProposals,
    });
    deps.log(JSON.stringify(decision, null, 2));
    return decision;
  } finally {
    deps.exit(0);
  }
}

/**
 * List the CC versions carried by `adopt CC X.Y.Z` proposals in `repo` at the given
 * issue state, parsed from each title. `state: 'open'` is the one-proposal-per-version
 * dedup source; `state: 'all'` (open+closed) feeds the install-free Support matrix
 * (support-matrix.ts) so an already-adopted version is never re-proposed. The title
 * regex is the real filter — a fuzzy `adopt CC in:title` search match that has no
 * `adopt CC <version>` substring (e.g. the auto-adopt PRD) yields no version and is
 * dropped. A `gh` failure yields an empty list — worst case one extra proposal, never
 * a crash.
 */
function listProposalVersions(repo: string, state: 'open' | 'all'): string[] {
  const r = runSync('gh', [
    'issue',
    'list',
    '--repo',
    repo,
    '--state',
    state,
    '--search',
    'adopt CC in:title',
    '--json',
    'title',
  ]);
  if (r.status !== 0) return [];
  try {
    const issues = JSON.parse(r.stdout) as Array<{ title?: string }>;
    return issues
      .map((i) => /adopt CC\s+(\S+)/i.exec(i.title ?? '')?.[1])
      .filter((v): v is string => v !== undefined);
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const repo = process.env.PROPOSAL_REPO ?? 'dividedby/tweakcc-maint';

  // Install-free matrix: the adopted-version seed unioned with every adopt-CC proposal
  // version (open+closed). The detector cron runner has no Claude Code, so the gate's
  // installed-version-only matrix (real-adoption-environment.ts) cannot be used here (#199).
  await runReleaseDetectorCli({
    npm: new RealNpmReleaseSource(),
    publisher: new RealIssuePublisher(repo),
    matrix: supportMatrix(listProposalVersions(repo, 'all')),
    openProposals: listProposalVersions(repo, 'open'),
    log: (line) => console.log(line),
    exit: (code) => process.exit(code),
  });
}

// Run only when invoked as the process entry point — never when imported (the all-fake wiring
// test imports {@link runReleaseDetectorCli} and must NOT trigger a real network/gh/exit).
function isEntryPoint(): boolean {
  const entry = argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isEntryPoint()) void main();

/**
 * proposal-chain-cli — the runnable composition root for the slice-4 (#200)
 * proposal→gate chain, invocable as `pnpm tsx src/proposal-chain-cli.ts`. When a
 * proposal is labeled, this parses its `cc_version` marker and dispatches the
 * Integration gate (`integration-gate.yml`) for that version — with NO human step.
 *
 * It mirrors release-detector-cli.ts as transport (not a domain module): the
 * logic stays in tsx, the workflow YAML is a thin envelope. The chain runs the
 * gate ONCE per proposal — `alreadyDispatched` (a prior gate run on this proposal)
 * short-circuits the re-dispatch loop, so unattended spend is bounded by release
 * cadence (design Invariants).
 *
 * Cockpit rule: dispatching the gate on the maintainer's OWN fork is the sole
 * outward action — it never starts an adoption or mutates a leaf. The verdict
 * write-back is the separate {@link postAdoptionRecord} step the gate runs.
 *
 * The wiring is split into {@link runProposalChainCli}, which takes the issue +
 * body + the once-guard + the dispatch action + log injected, so the all-fake
 * wiring test drives it with NO real `gh` and NO real workflow dispatch. The thin
 * {@link main} binds the production seams.
 */

import { parseCcVersionMarker } from './proposal-marker.js';
import { runSync } from './leaf-shell.js';
import { argv } from 'node:process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface ProposalChainCliDeps {
  /** The proposal issue number the label-add fired on. */
  issue: number;
  /** The proposal body — parsed for the `cc_version` marker. */
  body: string;
  /** Has the gate already been dispatched for this proposal? The once-per-proposal guard. */
  alreadyDispatched: boolean;
  /** Dispatch the Integration gate for `ccVersion`; defaults to a real `gh workflow run`. */
  dispatchGate: (ccVersion: string) => void;
  /** Where the printed decision goes; defaults to `console.log`. */
  log: (line: string) => void;
}

/** The outcome of one chain run — what dispatched (if anything) and why it didn't. */
export interface ChainDecision {
  dispatched: boolean;
  ccVersion?: string;
  reason?: 'no-marker' | 'already-dispatched';
}

/**
 * The testable wiring: parse the proposal's `cc_version` marker and dispatch the
 * gate for it — at most once. A body with no marker is a label-add on something
 * that is not a proposal (no-op); a proposal already dispatched is the
 * once-per-proposal guard (no re-dispatch). Returns the decision so the wiring
 * test can assert what happened.
 */
export function runProposalChainCli(deps: ProposalChainCliDeps): Promise<ChainDecision> {
  const ccVersion = parseCcVersionMarker(deps.body);
  if (ccVersion === undefined) {
    deps.log(`no cc_version marker on issue #${deps.issue} — not a proposal; dispatching nothing`);
    return Promise.resolve({ dispatched: false, reason: 'no-marker' });
  }
  if (deps.alreadyDispatched) {
    deps.log(`gate already dispatched for issue #${deps.issue} (cc ${ccVersion}) — once per proposal`);
    return Promise.resolve({ dispatched: false, ccVersion, reason: 'already-dispatched' });
  }
  deps.dispatchGate(ccVersion);
  deps.log(`dispatched integration-gate for issue #${deps.issue} (cc ${ccVersion})`);
  return Promise.resolve({ dispatched: true, ccVersion });
}

/**
 * Has the gate already been dispatched for this proposal? The chain stamps a
 * machine-readable line ({@link DISPATCH_MARKER}) into every dispatch comment, so
 * the presence of a comment carrying it is the once-per-proposal guard. A `gh`
 * failure is treated as "not dispatched" — worst case re-dispatches once (the
 * spend backstop is the gate's own budget), never crashes the chain.
 */
const DISPATCH_MARKER = 'integration-gate dispatched';

function gateAlreadyDispatched(repo: string, issue: number): boolean {
  const r = runSync('gh', [
    'issue',
    'view',
    String(issue),
    '--repo',
    repo,
    '--json',
    'comments',
  ]);
  if (r.status !== 0) return false;
  try {
    const { comments } = JSON.parse(r.stdout) as { comments?: Array<{ body?: string }> };
    return (comments ?? []).some((c) => (c.body ?? '').includes(DISPATCH_MARKER));
  } catch {
    return false;
  }
}

/**
 * The production dispatch action: `gh workflow run integration-gate.yml -f
 * cc_version=<v>`, then leave the {@link DISPATCH_MARKER} comment so the next
 * label-add sees the proposal as already dispatched (once-per-proposal). `gh`
 * authenticates from `GH_TOKEN` in Actions.
 */
function realDispatchGate(repo: string, issue: number): (ccVersion: string) => void {
  return (ccVersion) => {
    const run = runSync('gh', [
      'workflow',
      'run',
      'integration-gate.yml',
      '--repo',
      repo,
      '-f',
      `cc_version=${ccVersion}`,
      // The gate posts its Adoption record back onto this proposal (in-gate write-back step).
      '-f',
      `proposal_issue=${issue}`,
    ]);
    if (run.status !== 0) {
      const detail = (run.stderr.trim() || run.stdout.trim()) || `exit ${run.status}`;
      throw new Error(`proposal-chain: \`gh workflow run\` failed: ${detail}`);
    }
    const note = runSync(
      'gh',
      ['issue', 'comment', String(issue), '--repo', repo, '--body-file', '-'],
      process.env,
      `${DISPATCH_MARKER} for \`cc_version: ${ccVersion}\` — the Adoption record will follow on completion.`,
    );
    if (note.status !== 0) {
      const detail = (note.stderr.trim() || note.stdout.trim()) || `exit ${note.status}`;
      throw new Error(`proposal-chain: dispatch-marker comment failed: ${detail}`);
    }
  };
}

function main(): void {
  const repo = process.env.PROPOSAL_REPO ?? process.env.GITHUB_REPOSITORY ?? 'dividedby/tweakcc-maint';
  const issue = Number(process.env.ISSUE_NUMBER);
  const body = process.env.ISSUE_BODY ?? '';
  if (!Number.isInteger(issue)) {
    throw new Error('proposal-chain: ISSUE_NUMBER env var is required and must be an integer');
  }

  void runProposalChainCli({
    issue,
    body,
    alreadyDispatched: gateAlreadyDispatched(repo, issue),
    dispatchGate: realDispatchGate(repo, issue),
    log: (line) => console.log(line),
  }).then((decision) => {
    console.log(JSON.stringify(decision, null, 2));
  });
}

// Run only as the process entry point — never on import (the wiring test imports
// runProposalChainCli and must NOT trigger a real `gh`/dispatch).
function isEntryPoint(): boolean {
  const entry = argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isEntryPoint()) main();

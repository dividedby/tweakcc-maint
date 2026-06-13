/**
 * writeback-cli — the runnable composition root for the slice-4 (#200) Adoption-record
 * write-back, invocable as `pnpm tsx src/writeback-cli.ts`. After the Integration gate
 * runs for a proposal's `cc_version`, the gate (in the chain workflow) runs this to post
 * the Adoption record BACK onto the proposal as one ADDITIVE comment — so a green-or-red
 * verdict awaits the maintainer on the proposal issue (design → Seams, write-back).
 *
 * It mirrors release-detector-cli.ts as transport: the logic stays in tsx behind the
 * pure {@link formatAdoptionRecordComment} + the additive {@link ProposalCommenter} seam,
 * and the YAML is a thin envelope. The pass/fail verdict is DERIVED from the gate
 * record's top-level `pass`; an unparseable/missing record is treated as a FAIL, never a
 * silent pass (the gate is the sole author of `pass`; a corrupt record must not read green).
 *
 * The wiring is split into {@link runWriteBackCli}, which takes the commenter injected, so
 * the all-fake wiring test runs with NO real `gh issue comment`. The thin {@link main}
 * binds {@link RealProposalCommenter}.
 */

import { readFileSync } from 'node:fs';
import { isEntryPoint } from './cli-entrypoint.js';
import {
  postAdoptionRecord,
  RealProposalCommenter,
  type ProposalCommenter,
} from './adoption-writeback.js';

export interface WriteBackCliDeps {
  /** The proposal issue number the record is posted onto. */
  issue: number;
  /** The CC version the gate ran for (from the proposal's marker). */
  ccVersion: string;
  /** The gate's Adoption record JSON (its stdout, unchanged) — `pass` is derived from it. */
  recordJson: string;
  /** The additive comment seam; defaults to {@link RealProposalCommenter}. */
  commenter: ProposalCommenter;
  /** Where progress goes; defaults to `console.log`. */
  log: (line: string) => void;
}

/**
 * Derive the gate verdict from the Adoption record's top-level `pass`. An
 * unparseable record, or one missing `pass`, reads as FALSE — a corrupt or absent
 * record must never post a green verdict.
 */
function recordPassed(recordJson: string): boolean {
  try {
    return (JSON.parse(recordJson) as { pass?: unknown }).pass === true;
  } catch {
    return false;
  }
}

/**
 * The testable wiring: post the gate's Adoption record back onto the proposal as
 * one additive comment whose verdict tracks the record's `pass`. The sole outward
 * action is the single {@link ProposalCommenter.comment} — never a close or a body
 * rewrite (the seam cannot do either).
 */
export async function runWriteBackCli(deps: WriteBackCliDeps): Promise<void> {
  const pass = recordPassed(deps.recordJson);
  await postAdoptionRecord(deps.commenter, {
    issue: deps.issue,
    ccVersion: deps.ccVersion,
    pass,
    recordJson: deps.recordJson,
  });
  deps.log(`posted Adoption record (${pass ? 'PASS' : 'FAIL'}) to issue #${deps.issue}`);
}

async function main(): Promise<void> {
  const repo = process.env.PROPOSAL_REPO ?? process.env.GITHUB_REPOSITORY ?? 'dividedby/tweakcc-maint';
  const issue = Number(process.env.ISSUE_NUMBER);
  const ccVersion = process.env.CC_VERSION;
  const recordPath = process.env.ADOPTION_RECORD_PATH ?? 'adoption-record.json';
  if (!Number.isInteger(issue)) {
    throw new Error('write-back: ISSUE_NUMBER env var is required and must be an integer');
  }
  if (!ccVersion) {
    throw new Error('write-back: CC_VERSION env var is required');
  }

  // A missing record file → empty string → treated as a FAIL by recordPassed (never a silent pass).
  let recordJson = '';
  try {
    recordJson = readFileSync(recordPath, 'utf8');
  } catch {
    recordJson = '';
  }

  await runWriteBackCli({
    issue,
    ccVersion,
    recordJson,
    commenter: new RealProposalCommenter(repo),
    log: (line) => console.log(line),
  });
}

// Run only as the process entry point — never on import (the wiring test imports
// runWriteBackCli and must NOT trigger a real `gh issue comment`).
if (isEntryPoint(import.meta.url)) void main();

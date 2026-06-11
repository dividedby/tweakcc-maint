/**
 * All-fake wiring test for the proposal→gate chain composition root (slice 4, #200).
 * It drives {@link runProposalChainCli} with a fake "already dispatched?" check and a
 * recording dispatch action — NO real `gh`, NO real workflow dispatch. It proves the
 * chain dispatches the Integration gate for the proposal's parsed `cc_version`, the
 * once-per-proposal guard (no re-dispatch loop), and the no-marker / no-human-step paths.
 * It does NOT re-test the pure marker parser (its own unit) nor `workflow_dispatch` plumbing.
 */

import { describe, it, expect } from 'vitest';
import { runProposalChainCli, type ProposalChainCliDeps } from '../src/proposal-chain-cli.js';
import { formatProposal } from '../src/issue-publisher.js';

function makeDeps(
  over: Partial<ProposalChainCliDeps>,
): { deps: ProposalChainCliDeps; dispatched: string[]; logs: string[] } {
  const dispatched: string[] = [];
  const logs: string[] = [];
  const deps: ProposalChainCliDeps = {
    issue: 200,
    body: formatProposal({ ccVersion: '2.1.180' }).body,
    alreadyDispatched: false,
    dispatchGate: (ccVersion) => dispatched.push(ccVersion),
    log: (line) => logs.push(line),
    ...over,
  };
  return { deps, dispatched, logs };
}

describe('proposal-chain-cli wiring (all-fake)', () => {
  it('labeled proposal with a marker → dispatches the gate for that cc_version, no human step', async () => {
    const { deps, dispatched } = makeDeps({});
    const r = await runProposalChainCli(deps);
    expect(r).toEqual({ dispatched: true, ccVersion: '2.1.180' });
    expect(dispatched).toEqual(['2.1.180']);
  });

  it('once per proposal: a proposal already dispatched does not re-dispatch', async () => {
    const { deps, dispatched } = makeDeps({ alreadyDispatched: true });
    const r = await runProposalChainCli(deps);
    expect(r.dispatched).toBe(false);
    expect(r.reason).toBe('already-dispatched');
    expect(dispatched).toEqual([]);
  });

  it('a body with no cc_version marker → dispatches nothing, does not crash', async () => {
    const { deps, dispatched } = makeDeps({ body: 'a label-add on an issue that is not a proposal' });
    const r = await runProposalChainCli(deps);
    expect(r.dispatched).toBe(false);
    expect(r.reason).toBe('no-marker');
    expect(dispatched).toEqual([]);
  });
});

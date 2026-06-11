/**
 * All-fake wiring test for the Release detector composition root (#197). It drives
 * {@link runReleaseDetectorCli} end-to-end through the same `run` the production
 * `main` uses, but with a fake NpmReleaseSource and a recording IssuePublisher —
 * NO real network, NO real `gh`, and the real `process.exit` replaced by a sink.
 *
 * It proves the wiring (propose-once-with-marker + every no-propose path) and the
 * propose-only invariant. It does NOT re-test `decide()` (pure unit elsewhere) nor
 * the `gh`/npm seam internals — those live behind the injected fakes.
 */

import { describe, it, expect } from 'vitest';
import { runReleaseDetectorCli } from '../src/release-detector-cli.js';
import type { ReleaseDetectorCliDeps } from '../src/release-detector-cli.js';
import { FakeNpmReleaseSource } from '../src/fake-npm-release-source.js';
import {
  formatProposal,
  ccVersionMarker,
  PROPOSAL_LABEL,
  type AdoptionProposal,
  type IssuePublisher,
} from '../src/issue-publisher.js';

const MATRIX = ['1.2.3', '1.2.4', '1.1.0'];

/** Records each proposal and renders it exactly as the real `gh` adapter would, so the test
 *  asserts the published body/labels without a real `gh`. NEVER creates an issue (propose-only). */
class RecordingPublisher implements IssuePublisher {
  readonly captured: AdoptionProposal[] = [];
  publish(proposal: AdoptionProposal): Promise<void> {
    this.captured.push({ ...proposal });
    return Promise.resolve();
  }
}

function makeDeps(
  over: Partial<ReleaseDetectorCliDeps> & Pick<ReleaseDetectorCliDeps, 'npm' | 'publisher'>,
): { deps: ReleaseDetectorCliDeps; logs: string[]; exits: number[] } {
  const logs: string[] = [];
  const exits: number[] = [];
  const deps: ReleaseDetectorCliDeps = {
    matrix: MATRIX,
    openProposals: [],
    log: (line) => logs.push(line),
    exit: (code) => exits.push(code),
    ...over,
  };
  return { deps, logs, exits };
}

describe('release-detector-cli wiring (all-fake)', () => {
  it('newer version → publishes exactly one proposal whose body carries the cc_version marker + label', async () => {
    const publisher = new RecordingPublisher();
    const { deps, logs, exits } = makeDeps({ npm: new FakeNpmReleaseSource('1.3.0'), publisher });

    const decision = await runReleaseDetectorCli(deps);

    expect(decision).toEqual({ propose: true, ccVersion: '1.3.0', reason: 'new-version' });
    expect(publisher.captured).toEqual([{ ccVersion: '1.3.0' }]);

    // The marker + label travel with the proposal as the real `gh` adapter would render them.
    const rendered = formatProposal(publisher.captured[0]!);
    expect(rendered.body).toContain(ccVersionMarker('1.3.0'));
    expect(rendered.body).toMatch(/^cc_version: 1\.3\.0$/m);
    expect(rendered.labels).toContain(PROPOSAL_LABEL);
    expect(rendered.title).toBe('adopt CC 1.3.0');

    expect(logs.join('\n')).toContain('"ccVersion": "1.3.0"');
    expect(exits).toEqual([0]);
  });

  it('latest already in the Support matrix → publishes nothing', async () => {
    const publisher = new RecordingPublisher();
    const { deps, exits } = makeDeps({ npm: new FakeNpmReleaseSource('1.2.4'), publisher });

    const decision = await runReleaseDetectorCli(deps);

    expect(decision.propose).toBe(false);
    expect(decision.reason).toBe('already-in-matrix');
    expect(publisher.captured).toEqual([]);
    expect(exits).toEqual([0]);
  });

  it('an open proposal already covers latest → does not duplicate', async () => {
    const publisher = new RecordingPublisher();
    const { deps } = makeDeps({
      npm: new FakeNpmReleaseSource('1.3.0'),
      publisher,
      openProposals: ['1.3.0'],
    });

    const decision = await runReleaseDetectorCli(deps);

    expect(decision.reason).toBe('already-proposed');
    expect(publisher.captured).toEqual([]);
  });

  it('latest not newer than the matrix → publishes nothing', async () => {
    const publisher = new RecordingPublisher();
    const { deps } = makeDeps({ npm: new FakeNpmReleaseSource('1.2.0'), publisher });

    const decision = await runReleaseDetectorCli(deps);

    expect(decision.reason).toBe('not-newer');
    expect(publisher.captured).toEqual([]);
  });

  it('malformed npm response → publishes nothing, does not crash, still exits 0', async () => {
    const publisher = new RecordingPublisher();
    const { deps, exits } = makeDeps({ npm: FakeNpmReleaseSource.malformed(), publisher });

    const decision = await runReleaseDetectorCli(deps);

    expect(decision.reason).toBe('no-latest');
    expect(publisher.captured).toEqual([]);
    expect(exits).toEqual([0]);
  });

  it('propose-only: a proposing run leaves exactly one capture and nothing else', async () => {
    const publisher = new RecordingPublisher();
    const { deps } = makeDeps({ npm: new FakeNpmReleaseSource('2.0.0'), publisher });

    await runReleaseDetectorCli(deps);

    // The recording publisher captures and does nothing else — it cannot create an issue or
    // mutate a leaf. The single capture is the only side effect of the run.
    expect(publisher.captured).toHaveLength(1);
    expect(publisher.captured[0]).toEqual({ ccVersion: '2.0.0' });
  });
});

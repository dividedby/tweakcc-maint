import { describe, it, expect } from 'vitest';
import { decide, run } from '../src/release-detector.js';
import type { RunSources } from '../src/release-detector.js';
import { FakeNpmReleaseSource } from '../src/fake-npm-release-source.js';
import { StubIssuePublisher } from '../src/stub-issue-publisher.js';

const MATRIX = ['1.2.3', '1.2.4', '1.1.0'];

describe('ReleaseDetector.decide (pure)', () => {
  it('latest newer than every matrix version and unproposed → propose that one version', () => {
    const d = decide('1.3.0', MATRIX, []);
    expect(d).toEqual({ propose: true, ccVersion: '1.3.0', reason: 'new-version' });
  });

  it('latest already in the Support matrix → propose nothing', () => {
    const d = decide('1.2.4', MATRIX, []);
    expect(d.propose).toBe(false);
    expect(d.reason).toBe('already-in-matrix');
    expect(d.ccVersion).toBeUndefined();
  });

  it('an open proposal already exists for that version → do not duplicate', () => {
    const d = decide('1.3.0', MATRIX, ['1.3.0']);
    expect(d.propose).toBe(false);
    expect(d.reason).toBe('already-proposed');
  });

  it('dedups against an open proposal written differently (v-prefix / build suffix)', () => {
    const d = decide('1.3.0', MATRIX, ['v1.3.0+build.9']);
    expect(d.propose).toBe(false);
    expect(d.reason).toBe('already-proposed');
  });

  it('latest older than the newest matrix version → propose nothing (not-newer)', () => {
    const d = decide('1.2.0', MATRIX, []);
    expect(d.propose).toBe(false);
    expect(d.reason).toBe('not-newer');
  });

  it('latest equal to newest matrix version but absent elsewhere is in-matrix, not newer', () => {
    // 1.2.4 IS in the matrix → already-in-matrix wins over any newer check.
    const d = decide('1.2.4', ['1.2.4'], []);
    expect(d.reason).toBe('already-in-matrix');
  });

  it('orders by semver, not lexically: 1.10.0 is newer than 1.9.0', () => {
    const d = decide('1.10.0', ['1.9.0'], []);
    expect(d).toEqual({ propose: true, ccVersion: '1.10.0', reason: 'new-version' });
  });

  it('only proposes when newer than ALL versions, even if newer than some', () => {
    // 1.2.5 is newer than 1.1.0 but not newer than 1.3.0 → not-newer.
    const d = decide('1.2.5', ['1.1.0', '1.3.0'], []);
    expect(d.propose).toBe(false);
    expect(d.reason).toBe('not-newer');
  });

  it('malformed npm response (null latest) → propose nothing, no crash', () => {
    const d = decide(null, MATRIX, []);
    expect(d.propose).toBe(false);
    expect(d.reason).toBe('no-latest');
  });

  it('unparseable latest string → propose nothing, no crash', () => {
    const d = decide('not-a-version', MATRIX, []);
    expect(d.propose).toBe(false);
    expect(d.reason).toBe('no-latest');
  });
});

function makeSources(over: Partial<RunSources> & Pick<RunSources, 'npm' | 'publisher'>): RunSources {
  return {
    matrix: MATRIX,
    openProposals: [],
    ...over,
  };
}

describe('ReleaseDetector.run (orchestration, propose-only)', () => {
  it('new version → publishes exactly one proposal for that version', async () => {
    const publisher = new StubIssuePublisher();
    const decision = await run(
      makeSources({ npm: new FakeNpmReleaseSource('1.3.0'), publisher }),
    );

    expect(decision).toEqual({ propose: true, ccVersion: '1.3.0', reason: 'new-version' });
    expect(publisher.captured).toEqual([{ ccVersion: '1.3.0' }]);
  });

  it('latest already in matrix → publishes nothing', async () => {
    const publisher = new StubIssuePublisher();
    const decision = await run(
      makeSources({ npm: new FakeNpmReleaseSource('1.2.4'), publisher }),
    );

    expect(decision.propose).toBe(false);
    expect(publisher.captured).toEqual([]);
  });

  it('open proposal already exists → does not duplicate', async () => {
    const publisher = new StubIssuePublisher();
    const decision = await run(
      makeSources({
        npm: new FakeNpmReleaseSource('1.3.0'),
        publisher,
        openProposals: ['1.3.0'],
      }),
    );

    expect(decision.reason).toBe('already-proposed');
    expect(publisher.captured).toEqual([]);
  });

  it('malformed npm response → publishes nothing, does not crash', async () => {
    const publisher = new StubIssuePublisher();
    const decision = await run(
      makeSources({ npm: FakeNpmReleaseSource.malformed(), publisher }),
    );

    expect(decision.reason).toBe('no-latest');
    expect(publisher.captured).toEqual([]);
  });

  it('propose-only: the ONLY side effect of a run is a captured proposal — never more than one', async () => {
    const publisher = new StubIssuePublisher();
    await run(makeSources({ npm: new FakeNpmReleaseSource('2.0.0'), publisher }));

    // The stub captures and does nothing else; it cannot create an issue or
    // mutate a leaf. A run that proposes leaves exactly one capture behind.
    expect(publisher.captured).toHaveLength(1);
    expect(publisher.captured[0]).toEqual({ ccVersion: '2.0.0' });
  });

  it('propose-only: a no-op run leaves zero side effects', async () => {
    const publisher = new StubIssuePublisher();
    // 1.2.4 is already in the matrix → nothing proposed, nothing captured.
    await run(makeSources({ npm: new FakeNpmReleaseSource('1.2.4'), publisher }));
    expect(publisher.captured).toHaveLength(0);
  });
});

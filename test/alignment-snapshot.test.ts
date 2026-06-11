/**
 * Unit for the #216 alignment-snapshot producer — the AUTOMATION counterpart of
 * the CLAUDE.md "Alignment preflight" rule (PR #218). On each proposal it gathers
 * skrabe's CURRENT leaf state (leaf `main` HEAD + recent commit subjects, open AND
 * recently-closed PRs touching the area, his review comments, and his published
 * `tweakcc-fixed` npm version vs our Support matrix), surfaces it as an additive
 * proposal comment, and gates a realign candidate: if his HEAD already covers the
 * change, the candidate is flagged REDUNDANT before it can become a leaf PR.
 *
 * Every read is behind an injected seam (LeafStateSource + the existing
 * NpmReleaseSource), so the whole producer is exercised here with fakes — no git,
 * no `gh`, no npm — mirroring the all-fake wiring in #197/#200/#213.
 */

import { describe, it, expect } from 'vitest';
import {
  gatherAlignmentSnapshot,
  renderAlignmentSnapshot,
  postAlignmentSnapshot,
  screenCandidatesAgainstHead,
  type LeafStateSource,
  type LeafState,
  type AlignmentSnapshot,
} from '../src/alignment-snapshot.js';
import type { ProposalCommenter, PostedComment } from '../src/adoption-writeback.js';
import { FakeNpmReleaseSource } from '../src/fake-npm-release-source.js';
import type { AnchorCandidate } from '../src/anchor-candidate-diff.js';

class RecordingCommenter implements ProposalCommenter {
  readonly posted: PostedComment[] = [];
  comment(c: PostedComment): Promise<void> {
    this.posted.push(c);
    return Promise.resolve();
  }
}

class FakeLeafStateSource implements LeafStateSource {
  constructor(private readonly states: Record<string, LeafState>) {}
  async fetchLeafState(leaf: string): Promise<LeafState> {
    const s = this.states[leaf];
    if (s === undefined) throw new Error(`no fake state for ${leaf}`);
    return s;
  }
}

const TF: LeafState = {
  leaf: 'skrabe/tweakcc-fixed',
  headSha: 'eb3d6ad',
  recentSubjects: ['realign overrides to 2.1.173', 'bump deps'],
  openPrs: [{ number: 7, title: 'adopt 2.1.170', headSha: 'aaa111' }],
  recentlyClosedPrs: [{ number: 8, title: 'orphan tool', headSha: 'bbb222', merged: false }],
  reviewComments: ['redundant with gates I already run — closing'],
};

const LCC: LeafState = {
  leaf: 'skrabe/lobotomized-claude-code',
  headSha: 'cafe123',
  recentSubjects: ['2.1.172 realign'],
  openPrs: [],
  recentlyClosedPrs: [{ number: 9, title: 'opus-4-8 anchors', headSha: 'dead999', merged: false }],
  reviewComments: ['contaminated against an already-patched install'],
};

function fakeSources() {
  return {
    leaves: new FakeLeafStateSource({
      'skrabe/tweakcc-fixed': TF,
      'skrabe/lobotomized-claude-code': LCC,
    }),
    npm: new FakeNpmReleaseSource('2.1.173'),
  };
}

describe('gatherAlignmentSnapshot (all-fake reads)', () => {
  it('snapshots leaf HEAD, recent subjects, open + recently-closed PRs, and review comments per leaf', async () => {
    const { leaves, npm } = fakeSources();
    const snap = await gatherAlignmentSnapshot({
      leaves,
      npm,
      leafRepos: ['skrabe/tweakcc-fixed', 'skrabe/lobotomized-claude-code'],
      supportMatrix: ['2.1.169', '2.1.170'],
    });

    expect(snap.leaves).toHaveLength(2);
    const tf = snap.leaves.find((l) => l.leaf === 'skrabe/tweakcc-fixed')!;
    expect(tf.headSha).toBe('eb3d6ad');
    expect(tf.recentSubjects).toContain('realign overrides to 2.1.173');
    expect(tf.openPrs[0]!.number).toBe(7);
    expect(tf.recentlyClosedPrs[0]!.number).toBe(8);
    expect(tf.reviewComments[0]).toMatch(/redundant/);
  });

  it('captures his published tweakcc-fixed npm version and compares it against our Support matrix', async () => {
    const { leaves, npm } = fakeSources();
    const snap = await gatherAlignmentSnapshot({
      leaves,
      npm,
      leafRepos: ['skrabe/tweakcc-fixed'],
      supportMatrix: ['2.1.169', '2.1.170'],
    });
    expect(snap.publishedCliVersion).toBe('2.1.173');
    expect(snap.supportMatrix).toEqual(['2.1.169', '2.1.170']);
    // 2.1.173 is ahead of everything in our matrix → he is ahead.
    expect(snap.aheadOfMatrix).toBe(true);
  });

  it('reports aheadOfMatrix=false when his published version is already covered by the matrix', async () => {
    const snap = await gatherAlignmentSnapshot({
      leaves: new FakeLeafStateSource({ 'skrabe/tweakcc-fixed': TF }),
      npm: new FakeNpmReleaseSource('2.1.170'),
      leafRepos: ['skrabe/tweakcc-fixed'],
      supportMatrix: ['2.1.169', '2.1.170'],
    });
    expect(snap.aheadOfMatrix).toBe(false);
  });

  it('tolerates a malformed npm response (null published version) without throwing', async () => {
    const snap = await gatherAlignmentSnapshot({
      leaves: new FakeLeafStateSource({ 'skrabe/tweakcc-fixed': TF }),
      npm: FakeNpmReleaseSource.malformed(),
      leafRepos: ['skrabe/tweakcc-fixed'],
      supportMatrix: ['2.1.169'],
    });
    expect(snap.publishedCliVersion).toBeNull();
    expect(snap.aheadOfMatrix).toBe(false);
  });
});

describe('screenCandidatesAgainstHead (suppress before it becomes a leaf PR)', () => {
  const moved: AnchorCandidate = {
    id: 'cli-tool',
    channel: 'Could not find',
    priorText: 'old anchor',
    proposedText: 'You are an interactive CLI tool that helps with software tasks.',
    moved: true,
    zeroMatch: false,
  };
  const headState: LeafState = {
    ...TF,
    recentSubjects: ['realign cli-tool to: You are an interactive CLI tool that helps with software tasks.'],
  };

  it('flags a candidate REDUNDANT when his HEAD already carries the proposed text', () => {
    const screened = screenCandidatesAgainstHead([moved], headState);
    expect(screened).toHaveLength(1);
    expect(screened[0]!.redundant).toBe(true);
    expect(screened[0]!.candidate.id).toBe('cli-tool');
  });

  it('keeps a candidate when his HEAD shows no sign of the proposed text', () => {
    const screened = screenCandidatesAgainstHead([moved], { ...TF, recentSubjects: ['unrelated work'] });
    expect(screened[0]!.redundant).toBe(false);
  });

  it('never marks an unmoved or zero-match candidate redundant (nothing to suppress)', () => {
    const unmoved: AnchorCandidate = { ...moved, moved: false };
    const zero: AnchorCandidate = { id: 'x', channel: 'Could not find', priorText: 'a', moved: false, zeroMatch: true };
    const screened = screenCandidatesAgainstHead([unmoved, zero], headState);
    expect(screened[0]!.redundant).toBe(false);
    expect(screened[1]!.redundant).toBe(false);
  });
});

describe('renderAlignmentSnapshot (pure markdown)', () => {
  const snap: AlignmentSnapshot = {
    publishedCliVersion: '2.1.173',
    supportMatrix: ['2.1.169', '2.1.170'],
    aheadOfMatrix: true,
    leaves: [TF, LCC],
  };

  it('leads with the published-CLI vs Support-matrix comparison', () => {
    const md = renderAlignmentSnapshot(snap);
    expect(md).toMatch(/Support matrix/);
    expect(md).toContain('2.1.173');
    expect(md).toMatch(/ahead/i);
  });

  it('renders per-leaf HEAD, open + recently-closed PRs, and his review comments', () => {
    const md = renderAlignmentSnapshot(snap);
    expect(md).toContain('skrabe/tweakcc-fixed');
    expect(md).toContain('eb3d6ad');
    expect(md).toContain('#7');
    expect(md).toContain('#8');
    expect(md).toMatch(/redundant/);
  });

  it('states it is a read-only alignment snapshot, additive, opens no leaf PR', () => {
    const md = renderAlignmentSnapshot(snap);
    expect(md).toMatch(/read-only|additive|no leaf PR|alignment/i);
  });
});

describe('postAlignmentSnapshot (additive comment seam)', () => {
  it('posts exactly one comment carrying the rendered snapshot to the proposal issue', async () => {
    const commenter = new RecordingCommenter();
    const snap: AlignmentSnapshot = {
      publishedCliVersion: '2.1.173',
      supportMatrix: ['2.1.169'],
      aheadOfMatrix: true,
      leaves: [TF],
    };
    await postAlignmentSnapshot(commenter, 216, snap);
    expect(commenter.posted).toHaveLength(1);
    expect(commenter.posted[0]!.issue).toBe(216);
    expect(commenter.posted[0]!.body).toBe(renderAlignmentSnapshot(snap));
  });
});

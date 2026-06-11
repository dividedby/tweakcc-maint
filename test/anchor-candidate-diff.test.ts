/**
 * Unit for the Phase 1 (#213) anchor-candidate-diff producer + its additive
 * proposal comment. Both halves are exercised here:
 *   - the PURE diff: two pristine prompts JSONs + leaf override files →
 *     per-override anchor candidates (the prompt text that moved across versions,
 *     classified by channel);
 *   - the additive comment that attaches the rendered diff onto the proposal,
 *     reusing the cockpit-safe {@link ProposalCommenter} seam (comment-only, no
 *     close/rewrite).
 *
 * Strictly mechanical: every byte the producer emits comes from the two pristine
 * `PromptsData` inputs — never from a patched/applied tree (the lcc#9 trap, #211).
 * A candidate whose override id is absent from the NEW pristine prompts JSON would
 * match zero against pristine, so it is reported as a *zero-match* candidate, never
 * as a green-looking proposed text (impossible-by-construction, the AC).
 */

import { describe, it, expect } from 'vitest';
import {
  buildAnchorCandidateDiff,
  renderAnchorCandidateDiff,
  postAnchorCandidateDiff,
  type AnchorOverride,
  type AnchorCandidate,
  type PromptsData,
} from '../src/anchor-candidate-diff.js';
import type { ProposalCommenter, PostedComment } from '../src/adoption-writeback.js';

/** A pristine prompts JSON with two named prompts whose text we can move across versions. */
function promptsJson(
  version: string,
  prompts: Array<{ id: string; pieces: string[] }>,
): PromptsData {
  return { version, prompts };
}

const ANCHOR = 'You are an interactive CLI tool that helps users with software engineering tasks.';
const ANCHOR_MOVED = 'You are an interactive CLI tool that assists users with software engineering work.';

class RecordingCommenter implements ProposalCommenter {
  readonly posted: PostedComment[] = [];
  comment(c: PostedComment): Promise<void> {
    this.posted.push(c);
    return Promise.resolve();
  }
}

describe('buildAnchorCandidateDiff (pure, pristine-only)', () => {
  it('emits a candidate for a named-prompt override whose anchor text moved across versions', () => {
    const prior = promptsJson('2.1.179', [{ id: 'cli-tool', pieces: [ANCHOR] }]);
    const next = promptsJson('2.1.180', [{ id: 'cli-tool', pieces: [ANCHOR_MOVED] }]);
    const overrides: AnchorOverride[] = [{ id: 'cli-tool', anchor: ANCHOR }];

    const diff = buildAnchorCandidateDiff(prior, next, overrides);

    expect(diff.priorVersion).toBe('2.1.179');
    expect(diff.newVersion).toBe('2.1.180');
    expect(diff.candidates).toHaveLength(1);
    const c = diff.candidates[0]!;
    expect(c.id).toBe('cli-tool');
    expect(c.priorText).toBe(ANCHOR);
    expect(c.proposedText).toBe(ANCHOR_MOVED);
    expect(c.moved).toBe(true);
    expect(c.zeroMatch).toBe(false);
  });

  it('classifies a named-prompt override under the `Could not find` channel', () => {
    const prior = promptsJson('2.1.179', [{ id: 'cli-tool', pieces: [ANCHOR] }]);
    const next = promptsJson('2.1.180', [{ id: 'cli-tool', pieces: [ANCHOR_MOVED] }]);
    const diff = buildAnchorCandidateDiff(prior, next, [{ id: 'cli-tool', anchor: ANCHOR }]);
    expect(diff.candidates[0]!.channel).toBe('Could not find');
  });

  it('classifies an inline-* override under the `failed to find` (inline regex) channel', () => {
    const prior = promptsJson('2.1.179', [{ id: 'inline-foo', pieces: [ANCHOR] }]);
    const next = promptsJson('2.1.180', [{ id: 'inline-foo', pieces: [ANCHOR_MOVED] }]);
    const diff = buildAnchorCandidateDiff(prior, next, [{ id: 'inline-foo', anchor: ANCHOR }]);
    expect(diff.candidates[0]!.channel).toBe('failed to find');
  });

  it('does not flag an override whose anchor is unchanged across versions (moved=false)', () => {
    const prior = promptsJson('2.1.179', [{ id: 'cli-tool', pieces: [ANCHOR] }]);
    const next = promptsJson('2.1.180', [{ id: 'cli-tool', pieces: [ANCHOR] }]);
    const diff = buildAnchorCandidateDiff(prior, next, [{ id: 'cli-tool', anchor: ANCHOR }]);
    expect(diff.candidates).toHaveLength(1);
    expect(diff.candidates[0]!.moved).toBe(false);
    expect(diff.candidates[0]!.proposedText).toBe(ANCHOR);
  });

  it('marks a candidate zeroMatch when its prompt id is absent from the NEW pristine JSON (the lcc#9 mode)', () => {
    const prior = promptsJson('2.1.179', [{ id: 'cli-tool', pieces: [ANCHOR] }]);
    const next = promptsJson('2.1.180', [{ id: 'some-other', pieces: [ANCHOR_MOVED] }]);
    const diff = buildAnchorCandidateDiff(prior, next, [{ id: 'cli-tool', anchor: ANCHOR }]);
    const c = diff.candidates[0]!;
    expect(c.zeroMatch).toBe(true);
    expect(c.proposedText).toBeUndefined();
  });

  it('marks a candidate zeroMatch when its anchor is not present in the prior pristine prompt', () => {
    // The override anchor must exist in the prior pristine text, or there is nothing to track —
    // a zero-match against pristine, surfaced as such (never a phantom proposed text).
    const prior = promptsJson('2.1.179', [{ id: 'cli-tool', pieces: ['unrelated text only'] }]);
    const next = promptsJson('2.1.180', [{ id: 'cli-tool', pieces: [ANCHOR_MOVED] }]);
    const diff = buildAnchorCandidateDiff(prior, next, [{ id: 'cli-tool', anchor: ANCHOR }]);
    expect(diff.candidates[0]!.zeroMatch).toBe(true);
  });

  it('joins multi-piece prompt text before matching the anchor', () => {
    const prior = promptsJson('2.1.179', [{ id: 'cli-tool', pieces: ['You are an interactive ', 'CLI tool.'] }]);
    const next = promptsJson('2.1.180', [{ id: 'cli-tool', pieces: ['You are a direct ', 'CLI tool.'] }]);
    const diff = buildAnchorCandidateDiff(prior, next, [
      { id: 'cli-tool', anchor: 'You are an interactive CLI tool.' },
    ]);
    expect(diff.candidates[0]!.zeroMatch).toBe(false);
    expect(diff.candidates[0]!.moved).toBe(true);
  });
});

describe('renderAnchorCandidateDiff (pure markdown)', () => {
  const baseCandidate: AnchorCandidate = {
    id: 'cli-tool',
    channel: 'Could not find',
    priorText: ANCHOR,
    proposedText: ANCHOR_MOVED,
    moved: true,
    zeroMatch: false,
  };

  it('renders the version pair and the moved-anchor proposed text', () => {
    const md = renderAnchorCandidateDiff({
      priorVersion: '2.1.179',
      newVersion: '2.1.180',
      candidates: [baseCandidate],
    });
    expect(md).toContain('2.1.179');
    expect(md).toContain('2.1.180');
    expect(md).toContain('cli-tool');
    expect(md).toContain(ANCHOR_MOVED);
  });

  it('labels the channel distinctly: `Could not find` vs `failed to find`', () => {
    const named = renderAnchorCandidateDiff({
      priorVersion: '2.1.179',
      newVersion: '2.1.180',
      candidates: [baseCandidate],
    });
    const inline = renderAnchorCandidateDiff({
      priorVersion: '2.1.179',
      newVersion: '2.1.180',
      candidates: [{ ...baseCandidate, id: 'inline-foo', channel: 'failed to find' }],
    });
    expect(named).toContain('Could not find');
    expect(inline).toContain('failed to find');
  });

  it('flags a zero-match candidate as unresolved evidence, never as a green proposed text', () => {
    const md = renderAnchorCandidateDiff({
      priorVersion: '2.1.179',
      newVersion: '2.1.180',
      candidates: [
        { id: 'cli-tool', channel: 'Could not find', priorText: ANCHOR, moved: false, zeroMatch: true },
      ],
    });
    expect(md).toMatch(/zero[- ]match|no match|unresolved/i);
  });

  it('states pristine provenance so the reader knows it is not from a patched tree (#211)', () => {
    const md = renderAnchorCandidateDiff({
      priorVersion: '2.1.179',
      newVersion: '2.1.180',
      candidates: [baseCandidate],
    });
    expect(md).toMatch(/pristine/i);
  });
});

describe('postAnchorCandidateDiff (additive comment seam)', () => {
  it('posts exactly one comment carrying the rendered diff to the proposal issue', async () => {
    const commenter = new RecordingCommenter();
    const diff = {
      priorVersion: '2.1.179',
      newVersion: '2.1.180',
      candidates: [
        {
          id: 'cli-tool',
          channel: 'Could not find' as const,
          priorText: ANCHOR,
          proposedText: ANCHOR_MOVED,
          moved: true,
          zeroMatch: false,
        },
      ],
    };
    await postAnchorCandidateDiff(commenter, 213, diff);

    expect(commenter.posted).toHaveLength(1);
    expect(commenter.posted[0]!.issue).toBe(213);
    expect(commenter.posted[0]!.body).toBe(renderAnchorCandidateDiff(diff));
  });
});

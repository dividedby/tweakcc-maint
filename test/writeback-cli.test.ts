/**
 * All-fake wiring test for the write-back composition root (slice 4, #200). It
 * drives {@link runWriteBackCli} with a recording commenter — NO real `gh`. It
 * proves the gate's Adoption record JSON is posted back as ONE additive comment
 * whose verdict tracks the record's top-level `pass`. It does NOT re-test the pure
 * formatter (its own unit) nor `gh issue comment` plumbing (behind the fake).
 */

import { describe, it, expect } from 'vitest';
import { runWriteBackCli, type WriteBackCliDeps } from '../src/writeback-cli.js';
import type { ProposalCommenter, PostedComment } from '../src/adoption-writeback.js';

class RecordingCommenter implements ProposalCommenter {
  readonly posted: PostedComment[] = [];
  comment(c: PostedComment): Promise<void> {
    this.posted.push(c);
    return Promise.resolve();
  }
}

function makeDeps(over: Partial<WriteBackCliDeps>): { deps: WriteBackCliDeps; commenter: RecordingCommenter } {
  const commenter = new RecordingCommenter();
  const deps: WriteBackCliDeps = {
    issue: 200,
    ccVersion: '2.1.180',
    recordJson: JSON.stringify({ pass: true, versions: [] }),
    commenter,
    log: () => {},
    ...over,
  };
  return { deps, commenter };
}

describe('writeback-cli wiring (all-fake)', () => {
  it('posts one additive comment to the proposal carrying the verdict + record', async () => {
    const { deps, commenter } = makeDeps({});
    await runWriteBackCli(deps);
    expect(commenter.posted).toHaveLength(1);
    expect(commenter.posted[0]!.issue).toBe(200);
    expect(commenter.posted[0]!.body).toMatch(/pass/i);
    expect(commenter.posted[0]!.body).toContain('2.1.180');
  });

  it('a failed gate record posts a fail verdict (pass derived from the record JSON)', async () => {
    const { deps, commenter } = makeDeps({ recordJson: JSON.stringify({ pass: false, versions: [] }) });
    await runWriteBackCli(deps);
    expect(commenter.posted[0]!.body).toMatch(/fail/i);
  });

  it('a missing/unparseable record is treated as a fail, never a silent pass', async () => {
    const { deps, commenter } = makeDeps({ recordJson: 'not json' });
    await runWriteBackCli(deps);
    expect(commenter.posted).toHaveLength(1);
    expect(commenter.posted[0]!.body).toMatch(/fail/i);
  });
});

/**
 * Unit for the Adoption-record write-back (slice 4, #200): the PURE formatter
 * (`Adoption record JSON + version → comment body`) and the additive comment seam
 * it posts through. The fake commenter records the post and asserts the invariant
 * the cockpit rule demands — write-back is ADDITIVE: it posts a comment, never
 * rewrites the proposal body and never closes the issue.
 */

import { describe, it, expect } from 'vitest';
import {
  formatAdoptionRecordComment,
  postAdoptionRecord,
  type ProposalCommenter,
  type PostedComment,
} from '../src/adoption-writeback.js';

const PASS_RECORD = JSON.stringify({ pass: true, versions: [{ version: '2.1.180' }] }, null, 2);
const FAIL_RECORD = JSON.stringify({ pass: false, versions: [{ version: '2.1.180' }] }, null, 2);

/** Records each post; can ONLY comment — it has no close/edit affordance, so a test
 *  proving the only side effect was a recorded comment proves the write-back is additive. */
class RecordingCommenter implements ProposalCommenter {
  readonly posted: PostedComment[] = [];
  comment(c: PostedComment): Promise<void> {
    this.posted.push(c);
    return Promise.resolve();
  }
}

describe('formatAdoptionRecordComment (pure)', () => {
  it('renders a pass verdict and embeds the Adoption record JSON', () => {
    const md = formatAdoptionRecordComment('2.1.180', true, PASS_RECORD);
    expect(md).toContain('2.1.180');
    expect(md).toMatch(/pass/i);
    expect(md).toContain(PASS_RECORD);
  });

  it('renders a fail verdict distinctly from a pass', () => {
    const fail = formatAdoptionRecordComment('2.1.180', false, FAIL_RECORD);
    const pass = formatAdoptionRecordComment('2.1.180', true, PASS_RECORD);
    expect(fail).toMatch(/fail/i);
    expect(fail).not.toBe(pass);
  });
});

describe('postAdoptionRecord (additive comment seam)', () => {
  it('posts exactly one comment carrying the formatted body to the proposal issue', async () => {
    const commenter = new RecordingCommenter();
    await postAdoptionRecord(commenter, { issue: 200, ccVersion: '2.1.180', pass: true, recordJson: PASS_RECORD });

    expect(commenter.posted).toHaveLength(1);
    expect(commenter.posted[0]!.issue).toBe(200);
    expect(commenter.posted[0]!.body).toBe(formatAdoptionRecordComment('2.1.180', true, PASS_RECORD));
  });

  it('is additive: a fail verdict still only posts a comment (no close/rewrite affordance exists)', async () => {
    const commenter = new RecordingCommenter();
    await postAdoptionRecord(commenter, { issue: 7, ccVersion: '2.1.180', pass: false, recordJson: FAIL_RECORD });

    // The seam's whole surface is `comment` — there is no API here to close or rewrite,
    // so the single recorded comment is provably the only side effect.
    expect(commenter.posted).toHaveLength(1);
    expect(commenter.posted[0]!.body).toMatch(/fail/i);
  });
});

/**
 * StubIssuePublisher — the test double for the IssuePublisher seam that ENFORCES
 * propose-only (design doc → Seams; CONTEXT.md → "propose-only"). It CAPTURES
 * each proposal into {@link StubIssuePublisher.captured} and does nothing else:
 * it never shells out to `gh`, never creates an issue, and never mutates a leaf.
 *
 * The capture log IS the assertion surface: a test proves propose-only by
 * checking that the only side effect of a run was zero-or-more captured
 * proposals — no real publish ever occurred. Because this stub is the ONLY thing
 * ReleaseDetector can use to act on the outside world (the npm source is
 * read-only), a run that produced nothing but captures provably touched nothing.
 */

import type { AdoptionProposal, IssuePublisher } from './issue-publisher.js';

export class StubIssuePublisher implements IssuePublisher {
  /** Proposals captured in call order. The stub NEVER creates a real issue. */
  readonly captured: AdoptionProposal[] = [];

  publish(proposal: AdoptionProposal): Promise<void> {
    this.captured.push({ ...proposal });
    return Promise.resolve();
  }
}

/**
 * IssuePublisher — the seam ReleaseDetector uses to PROPOSE an "adopt CC X.Y.Z"
 * issue (design doc → Seams; CONTEXT.md → "propose-only"). The control plane is
 * a contributor cockpit, not an owner: it prepares proposals for a human, it
 * never starts an adoption or mutates a leaf.
 *
 * Prod will be a `gh issue create` adapter; tests use {@link StubIssuePublisher},
 * which CAPTURES proposals and asserts it never actually creates one.
 */

/** A proposal to adopt a specific CC version — the only thing the detector emits. */
export interface AdoptionProposal {
  /** The CC version the proposal asks the maintainer to adopt. */
  ccVersion: string;
}

export interface IssuePublisher {
  /** Propose an adoption issue for the given version. */
  publish(proposal: AdoptionProposal): Promise<void>;
}

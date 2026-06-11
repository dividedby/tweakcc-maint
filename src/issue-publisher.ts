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

/**
 * The label a downstream chain workflow matches on to auto-dispatch the
 * Integration gate for a proposed version (slice 4, #200). Slice 1 stamps it on
 * every proposal so the marker + label are both already present when the chain
 * lands; the proposal stays a *proposal* (a human still grabs it — propose-only).
 */
export const PROPOSAL_LABEL = 'ready-for-agent';

/**
 * The machine-readable marker a downstream workflow greps the proposal body for
 * to learn which CC version to dispatch the gate against (design doc → Seams,
 * "`cc_version` marker"). Kept on its own line and prefixed so a body parser
 * (slice 4) can pull it out unambiguously.
 */
export function ccVersionMarker(ccVersion: string): string {
  return `cc_version: ${ccVersion}`;
}

/** The rendered shape the real publisher hands to `gh issue create`. */
export interface RenderedProposal {
  /** Issue title — `adopt CC X.Y.Z`, the phrasing the release-adoption skill keys on. */
  title: string;
  /** Issue body carrying the machine-readable {@link ccVersionMarker}. */
  body: string;
  /** Labels stamped on the issue — includes {@link PROPOSAL_LABEL}. */
  labels: readonly string[];
}

/**
 * Render a proposal into the title/body/labels a publisher creates. PURE — no
 * I/O. The body carries the {@link ccVersionMarker} on its own line so a
 * downstream chain (slice 4) can dispatch the gate against it; the
 * {@link PROPOSAL_LABEL} is what that chain matches on. Used by the real `gh`
 * adapter and asserted directly by tests, so the marker contract is verified
 * without a real `gh`.
 */
export function formatProposal(proposal: AdoptionProposal): RenderedProposal {
  const { ccVersion } = proposal;
  return {
    title: `adopt CC ${ccVersion}`,
    body: [
      `A Claude Code version newer than every Support-matrix version is published: **${ccVersion}**.`,
      '',
      'This is a propose-only auto-detected adoption (CONTEXT.md → "Release adoption"). A human',
      'grabs it to run the realign/patch/Behavioral-A/B back-half; the Integration gate can be',
      'dispatched against the version below.',
      '',
      ccVersionMarker(ccVersion),
    ].join('\n'),
    labels: [PROPOSAL_LABEL],
  };
}

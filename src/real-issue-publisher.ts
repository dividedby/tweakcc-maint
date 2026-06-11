/**
 * RealIssuePublisher — the production IssuePublisher adapter (design doc →
 * Seams). It shells `gh issue create` to publish ONE "adopt CC X.Y.Z" proposal,
 * rendered by the pure {@link formatProposal} so the body carries the
 * machine-readable `cc_version` marker and the proposal carries
 * {@link PROPOSAL_LABEL}. Propose-only: the sole outward action is creating the
 * proposal issue — it never starts an adoption or mutates a leaf (CONTEXT.md →
 * "propose-only").
 *
 * The `gh` shell-out is the single seam that makes this "real"; the wiring test
 * never reaches it (it injects a recording fake). First real publish is the cron
 * slice (#199).
 */

import { runSync } from './leaf-shell.js';
import { formatProposal, type AdoptionProposal, type IssuePublisher } from './issue-publisher.js';

export class RealIssuePublisher implements IssuePublisher {
  /** @param repo the `owner/name` the proposal is created in (the control plane's own backlog). */
  constructor(private readonly repo: string = 'dividedby/tweakcc-maint') {}

  publish(proposal: AdoptionProposal): Promise<void> {
    const rendered = formatProposal(proposal);
    const args = [
      'issue',
      'create',
      '--repo',
      this.repo,
      '--title',
      rendered.title,
      '--body',
      rendered.body,
    ];
    for (const label of rendered.labels) args.push('--label', label);

    const r = runSync('gh', args);
    if (r.status !== 0) {
      const detail = (r.stderr.trim() || r.stdout.trim()) || `exit ${r.status}`;
      throw new Error(`RealIssuePublisher: \`gh issue create\` failed: ${detail}`);
    }
    return Promise.resolve();
  }
}

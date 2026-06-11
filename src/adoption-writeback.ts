/**
 * adoption-writeback — the slice-4 (#200) write-back: after the chain dispatches
 * the Integration gate for a proposal's `cc_version`, the gate's Adoption record
 * is posted BACK onto the proposal as a comment, so a green-or-red verdict awaits
 * the maintainer on the proposal issue when they return (design → Seams,
 * "Adoption-record write-back formatter").
 *
 * Write-back is ADDITIVE only (cockpit rule; design Invariants): the formatter is
 * pure and the only outward action is `gh issue comment`. The seam
 * ({@link ProposalCommenter}) has NO close/rewrite affordance, so a recording fake
 * proves a run's sole side effect was one comment — never a body rewrite or an
 * auto-close. The proposal stays a *proposal* (a human still grabs it).
 */

import { runSync } from './leaf-shell.js';

/** One comment to post on a proposal issue — the whole surface the seam exposes. */
export interface PostedComment {
  /** The proposal issue number the comment lands on. */
  issue: number;
  /** The rendered comment body (the {@link formatAdoptionRecordComment} markdown). */
  body: string;
}

/**
 * The additive comment seam. Its ONLY method posts a comment — there is
 * deliberately no `close`/`edit` here, so the write-back cannot rewrite a body or
 * auto-close an issue even by mistake (cockpit rule). Prod is {@link RealProposalCommenter}
 * (`gh issue comment`); tests inject a recording fake.
 */
export interface ProposalCommenter {
  comment(comment: PostedComment): Promise<void>;
}

/**
 * Render the gate's Adoption record into a proposal comment body. PURE — no I/O.
 * Leads with the pass/fail verdict for the version, then embeds the full Adoption
 * record JSON (the gate's stdout, unchanged) in a fenced block as the audit trail.
 */
export function formatAdoptionRecordComment(
  ccVersion: string,
  pass: boolean,
  recordJson: string,
): string {
  const verdict = pass ? '✅ PASS' : '❌ FAIL';
  return [
    `## Integration gate: ${verdict} — CC ${ccVersion}`,
    '',
    `The auto-chained Integration gate ran for \`cc_version: ${ccVersion}\`. ` +
      'This is an additive record — the proposal is not closed; a human still grabs it ' +
      'to run the realign/patch/Behavioral-A/B back-half.',
    '',
    '<details><summary>Adoption record</summary>',
    '',
    '```json',
    recordJson,
    '```',
    '',
    '</details>',
  ].join('\n');
}

/** What the chain hands the write-back: the proposal, its version, the gate verdict + record. */
export interface AdoptionWriteBack {
  issue: number;
  ccVersion: string;
  pass: boolean;
  recordJson: string;
}

/**
 * Post the formatted Adoption record onto the proposal as an additive comment.
 * The sole outward action is one {@link ProposalCommenter.comment} call — never a
 * close or a body rewrite (the seam cannot do either).
 */
export async function postAdoptionRecord(
  commenter: ProposalCommenter,
  wb: AdoptionWriteBack,
): Promise<void> {
  await commenter.comment({
    issue: wb.issue,
    body: formatAdoptionRecordComment(wb.ccVersion, wb.pass, wb.recordJson),
  });
}

/**
 * The production {@link ProposalCommenter}: shells `gh issue comment` (additive).
 * `gh` authenticates from `GH_TOKEN` in Actions. The body is passed on stdin
 * (`--body-file -`) so a multi-line markdown body with backticks is never mangled
 * by argv quoting.
 */
export class RealProposalCommenter implements ProposalCommenter {
  /** @param repo the `owner/name` the proposal lives in (the control plane's own backlog). */
  constructor(private readonly repo: string = 'dividedby/tweakcc-maint') {}

  comment(comment: PostedComment): Promise<void> {
    const r = runSync(
      'gh',
      ['issue', 'comment', String(comment.issue), '--repo', this.repo, '--body-file', '-'],
      process.env,
      comment.body,
    );
    if (r.status !== 0) {
      const detail = (r.stderr.trim() || r.stdout.trim()) || `exit ${r.status}`;
      throw new Error(`RealProposalCommenter: \`gh issue comment\` failed: ${detail}`);
    }
    return Promise.resolve();
  }
}

/**
 * RealLeafStateSource — the production {@link LeafStateSource} adapter (#216). It
 * reads a leaf's CURRENT state with `gh` (PRs + review comments) and `gh api` (the
 * `main` HEAD + recent commit subjects), strictly READ-ONLY (cockpit rule: the
 * control plane never writes to a leaf). `gh` authenticates from `GH_TOKEN` in
 * Actions. The wiring test never touches this — it injects a fake — so the live
 * `gh` shape is exercised only on a real run, mirroring RealNpmReleaseSource /
 * RealProposalCommenter.
 *
 * Each read degrades to empty rather than throwing on a flaky `gh`: a missing slice
 * of the snapshot must not crash a proposal run (a partial snapshot is still useful
 * evidence; the alignment posture is "reconcile, don't race").
 */

import { runSync } from './leaf-shell.js';
import type { LeafState, LeafStateSource, LeafPr } from './alignment-snapshot.js';

/** How many recent commits / closed PRs to capture per leaf (bounded so the comment stays scannable). */
const RECENT_LIMIT = 10;

function gh(args: string[]): unknown {
  const r = runSync('gh', args);
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

function toPrs(raw: unknown, withMerged: boolean): LeafPr[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const pr: LeafPr = {
      number: typeof o.number === 'number' ? o.number : 0,
      title: typeof o.title === 'string' ? o.title : '',
      headSha: typeof o.headRefOid === 'string' ? o.headRefOid.slice(0, 7) : '',
    };
    if (withMerged) pr.merged = o.state === 'MERGED' || o.merged === true;
    return pr;
  });
}

export class RealLeafStateSource implements LeafStateSource {
  /** @param branch the leaf default branch the HEAD is read from. */
  constructor(private readonly branch: string = 'main') {}

  async fetchLeafState(leaf: string): Promise<LeafState> {
    const commits = gh([
      'api',
      `repos/${leaf}/commits?sha=${this.branch}&per_page=${RECENT_LIMIT}`,
      '--jq',
      '[.[] | {sha: .sha, subject: (.commit.message | split("\\n")[0])}]',
    ]);
    const commitArr = Array.isArray(commits) ? (commits as Array<Record<string, unknown>>) : [];
    const headSha = typeof commitArr[0]?.sha === 'string' ? (commitArr[0].sha as string).slice(0, 7) : '';
    const recentSubjects = commitArr
      .map((c) => (typeof c.subject === 'string' ? c.subject : ''))
      .filter((s) => s.length > 0);

    const open = gh(['pr', 'list', '--repo', leaf, '--state', 'open', '--json', 'number,title,headRefOid']);
    const closed = gh([
      'pr',
      'list',
      '--repo',
      leaf,
      '--state',
      'closed',
      '--limit',
      String(RECENT_LIMIT),
      '--json',
      'number,title,headRefOid,state',
    ]);

    // His review comments across recent PRs — his actual asks / closure reasons.
    const reviewComments = collectReviewComments(leaf);

    return {
      leaf,
      headSha,
      recentSubjects,
      openPrs: toPrs(open, false),
      recentlyClosedPrs: toPrs(closed, true),
      reviewComments,
    };
  }
}

/** Pull recent issue-comment bodies on closed PRs (his closure reasons/asks), best-effort. */
function collectReviewComments(leaf: string): string[] {
  const raw = gh([
    'search',
    'prs',
    '--repo',
    leaf,
    '--state',
    'closed',
    '--limit',
    String(RECENT_LIMIT),
    '--json',
    'number',
  ]);
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const p of raw) {
    const num = (p as Record<string, unknown>).number;
    if (typeof num !== 'number') continue;
    const comments = gh([
      'api',
      `repos/${leaf}/issues/${num}/comments?per_page=5`,
      '--jq',
      '[.[] | .body]',
    ]);
    if (Array.isArray(comments)) {
      for (const c of comments) if (typeof c === 'string' && c.trim().length > 0) out.push(c.trim());
    }
  }
  return out;
}

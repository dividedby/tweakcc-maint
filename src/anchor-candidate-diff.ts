/**
 * anchor-candidate-diff — Phase 1 (#213): produce a cross-version realign
 * anchor-candidate diff from PRISTINE prompts JSONs and attach it to an adopt
 * proposal as additive evidence, *before* the realign is hand-authored.
 *
 * Leverage point (issue #213): a proposal today carries only the `cc_version`
 * marker; the realign arrives after skrabe has hand-rolled his own. This produces
 * the mechanically-derivable part earlier — for each leaf override, the prompt
 * anchor text that MOVED between the prior Support-matrix version and the
 * just-shipped one, plus the proposed new text — so the maintainer (and skrabe)
 * see a pre-verified candidate diff on the proposal.
 *
 * Strictly mechanical (issue Scope): every byte emitted comes from the two
 * pristine `prompts-<version>.json` extracts handed in — NEVER from a
 * patched/applied tree. The inputs are produced by the Phase 0
 * {@link extractPristineStringsFile} (npm-pack provenance) and screened by
 * {@link assertPristineStringsFile} (the differential patched-source guard) — so a
 * candidate that would have matched zero against pristine (the lcc#9 / 2.1.172
 * contamination failure, #211) is impossible by construction: a missing prompt id
 * or an anchor absent from the prior pristine text is surfaced as a `zeroMatch`
 * candidate (no phantom proposed text), never as a green-looking diff.
 *
 * Channel classification mirrors the Four-zeros bar's two apply-failure signatures
 * (CONTEXT.md → "Four-zeros bar", "Three override surfaces"): a named-prompt
 * override (keyed to the prompts-JSON id) fails as `Could not find system prompt`;
 * an `inline-*` override (the inline-blob surface, positional regex, NOT in the
 * prompts JSON) fails as `patch: <name>: failed to find`. The diff labels each
 * candidate by its channel so the reader maps it to the right failure mode.
 *
 * The attach step is ADDITIVE only: it reuses the cockpit-safe
 * {@link ProposalCommenter} seam (adoption-writeback.ts) — comment-only, no
 * close/rewrite affordance — so this evidence can never mutate the proposal body
 * or auto-open a leaf PR (the issue is explicit: evidence, not an auto-PR).
 */

import type { ProposalCommenter } from './adoption-writeback.js';

/** The relevant slice of a pristine `prompts-<version>.json`: per-prompt id + text pieces. */
export interface PromptsData {
  version?: string;
  prompts: Array<{ id?: string; pieces?: string[] }>;
}

/**
 * The two apply-failure signatures a moved anchor would manifest as. A
 * named-prompt override missing its anchor fails the JSON channel (`Could not
 * find system prompt`); an `inline-*` override missing its anchor fails the inline
 * regex channel (`patch: <name>: failed to find`). CONTEXT.md → "Four-zeros bar".
 */
export type AnchorChannel = 'Could not find' | 'failed to find';

/** One leaf override's stable identity for the diff: its prompt id + the anchor text it binds. */
export interface AnchorOverride {
  /** The override's prompt id — its filename minus `.md` (the prompts-JSON `id` for named overrides). */
  id: string;
  /** The contiguous prompt-text slice this override anchors to (the realign target). */
  anchor: string;
}

/** One override's cross-version anchor candidate — the evidence row in the diff. */
export interface AnchorCandidate {
  /** The override prompt id. */
  id: string;
  /** Which apply-failure channel a moved anchor manifests as. */
  channel: AnchorChannel;
  /** The anchor text as found in the prior pristine prompt (the realign's "from"). */
  priorText: string;
  /**
   * The proposed new anchor text from the NEW pristine prompt — the candidate the
   * realign would adopt. `undefined` for a `zeroMatch` candidate (the prompt id is
   * gone from the new JSON, or the anchor was never in the prior text): there is
   * nothing pristine to propose, so we surface the gap rather than invent text.
   */
  proposedText?: string;
  /** True when the anchor's surrounding prompt text differs between versions (a realign is needed). */
  moved: boolean;
  /**
   * True when the candidate cannot be resolved against the PRISTINE extracts — the
   * lcc#9 failure mode, surfaced explicitly so a zero-match never reads as a clean
   * proposed text (the AC: impossible-by-construction).
   */
  zeroMatch: boolean;
}

/** The whole cross-version diff for a proposal: the version pair + every override's candidate. */
export interface AnchorCandidateDiff {
  /** The prior Support-matrix version the diff is computed against. */
  priorVersion: string;
  /** The just-shipped version the proposal adopts. */
  newVersion: string;
  /** One candidate per leaf override, in input order. */
  candidates: AnchorCandidate[];
}

/** Concatenated text of a prompt's pieces (the realign anchor lives in the joined body). */
function promptText(prompt: { pieces?: string[] } | undefined): string | undefined {
  if (prompt === undefined) return undefined;
  return Array.isArray(prompt.pieces) ? prompt.pieces.join('') : undefined;
}

/** Index a prompts JSON by id → joined piece text, for O(1) per-override lookup. */
function textById(data: PromptsData): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of data.prompts ?? []) {
    if (p.id === undefined) continue;
    const text = promptText(p);
    if (text !== undefined) map.set(p.id, text);
  }
  return map;
}

/**
 * The apply-failure channel for an override id: an `inline-*` id is the inline-blob
 * surface (positional regex → `failed to find`); everything else is a named-prompt
 * override (`Could not find`). CONTEXT.md → "Three override surfaces".
 */
function channelOf(id: string): AnchorChannel {
  return id.startsWith('inline-') ? 'failed to find' : 'Could not find';
}

/**
 * Compute the cross-version anchor-candidate diff over a set of leaf overrides,
 * given the PRISTINE prior- and new-version prompts JSONs.
 *
 * For each override:
 *  - locate its prompt text in both versions by id;
 *  - if the id is missing from the new JSON, or the anchor is absent from the prior
 *    pristine text, the candidate is `zeroMatch` (no proposed text — the lcc#9
 *    guard, surfaced not silenced);
 *  - otherwise `proposedText` is the new version's prompt text and `moved` reflects
 *    whether it actually changed (an unmoved anchor needs no realign).
 *
 * PURE — no I/O. Every emitted byte is sourced from the two pristine inputs.
 */
export function buildAnchorCandidateDiff(
  prior: PromptsData,
  next: PromptsData,
  overrides: readonly AnchorOverride[],
): AnchorCandidateDiff {
  const priorText = textById(prior);
  const nextText = textById(next);
  const candidates: AnchorCandidate[] = [];

  for (const override of overrides) {
    const channel = channelOf(override.id);
    const before = priorText.get(override.id);
    const after = nextText.get(override.id);

    // Zero-match: the override's anchor cannot be resolved against the pristine
    // extracts (missing id, or anchor absent from the prior pristine text). Surface
    // it — never fabricate a proposed text (#211 / lcc#9, impossible-by-construction).
    if (before === undefined || !before.includes(override.anchor) || after === undefined) {
      candidates.push({
        id: override.id,
        channel,
        priorText: override.anchor,
        moved: false,
        zeroMatch: true,
      });
      continue;
    }

    candidates.push({
      id: override.id,
      channel,
      priorText: before,
      proposedText: after,
      moved: before !== after,
      zeroMatch: false,
    });
  }

  return {
    priorVersion: prior.version ?? '(unknown)',
    newVersion: next.version ?? '(unknown)',
    candidates,
  };
}

/** A fenced block of `text`, fence length picked so the block never collides with its content. */
function fenced(text: string): string {
  let fence = '```';
  while (text.includes(fence)) fence += '`';
  return `${fence}\n${text}\n${fence}`;
}

/** Render one candidate as a markdown section. */
function renderCandidate(c: AnchorCandidate): string {
  const head = `### \`${c.id}\` — ${c.channel} channel`;
  if (c.zeroMatch) {
    return [
      head,
      '',
      '⚠️ **zero-match against pristine** — this override\'s anchor does not resolve in the ' +
        'pristine extracts (prompt id gone, or the anchor text is absent from the prior ' +
        'pristine prompt). No proposed text is emitted: the realign needs a fresh anchor, ' +
        'authored by hand against the pristine extract. (This is the lcc#9 failure mode, ' +
        'surfaced not silenced — #211.)',
      '',
      '**Anchor (not found):**',
      fenced(c.priorText),
    ].join('\n');
  }
  if (!c.moved) {
    return [head, '', '✅ **unchanged** — anchor text is identical across versions; no realign needed.'].join('\n');
  }
  return [
    head,
    '',
    '**Prior pristine text:**',
    fenced(c.priorText),
    '',
    '**Proposed new pristine text:**',
    fenced(c.proposedText ?? ''),
  ].join('\n');
}

/**
 * Render the anchor-candidate diff as a proposal-comment markdown body. PURE — no
 * I/O. Leads with the version pair and the pristine-provenance note (the reader
 * must know this is mechanically derived from pristine extracts, not a patched
 * tree — #211), then one section per override candidate.
 */
export function renderAnchorCandidateDiff(diff: AnchorCandidateDiff): string {
  const moved = diff.candidates.filter((c) => c.moved && !c.zeroMatch).length;
  const zero = diff.candidates.filter((c) => c.zeroMatch).length;
  const unchanged = diff.candidates.length - moved - zero;

  const header = [
    `## Realign anchor-candidate diff — CC ${diff.priorVersion} → ${diff.newVersion}`,
    '',
    'Mechanically derived from **pristine** `npm pack` extracts of both versions ' +
      '(never a patched/applied tree — #211). This is additive evidence to seed the ' +
      'realign; it is **not** a leaf PR and changes nothing.',
    '',
    `**${moved}** anchor(s) moved · **${unchanged}** unchanged · **${zero}** zero-match (need a hand-authored anchor).`,
    '',
  ].join('\n');

  return [header, ...diff.candidates.map(renderCandidate)].join('\n\n');
}

/**
 * Attach the rendered anchor-candidate diff onto the proposal issue as an ADDITIVE
 * comment, reusing the cockpit-safe {@link ProposalCommenter} seam (comment-only,
 * no close/rewrite affordance). Evidence, not an auto-PR (issue Scope).
 */
export async function postAnchorCandidateDiff(
  commenter: ProposalCommenter,
  issue: number,
  diff: AnchorCandidateDiff,
): Promise<void> {
  await commenter.comment({ issue, body: renderAnchorCandidateDiff(diff) });
}

/**
 * lobotomy-ranker — Phase 4 of the Full adoption path (/adopt slice 2, #243).
 *
 * Ranks new/changed prompt ids by Lobotomy potential: how much each new prompt
 * is likely to benefit from an override targeting the anti-laziness Behavioral axes
 * (CONTEXT.md → "Behavioral axis": completes-in-scope, no-stub-or-mvp,
 * no-deferral, no-hedge-on-in-scope).
 *
 * Pure scoring over injected prompt text — no I/O, no disk reads.
 */

/**
 * The four Behavioral axes the Lobotomy targets (CONTEXT.md → "Behavioral axis").
 * Each axis contributes an additive score to the ranking.
 */
export type BehavioralAxis =
  | 'completes-in-scope'
  | 'no-stub-or-mvp'
  | 'no-deferral'
  | 'no-hedge-on-in-scope';

/** A scored signal for one axis, extracted from the prompt text. */
export interface AxisScore {
  axis: BehavioralAxis;
  /** 0–3: 0 = no signal, 1 = mild, 2 = moderate, 3 = strong. */
  score: number;
  /** Brief rationale — the pattern that drove the score. */
  rationale: string;
}

/** Ranking result for one new/changed prompt id. */
export interface LobotomyRanking {
  promptId: string;
  /** Total score (sum of axis scores, minus penalties). Floor at 0. */
  totalScore: number;
  /** Per-axis breakdown. */
  axes: AxisScore[];
  /**
   * Penalty applied when the override slot is inactive or conditional
   * (e.g. a feature-gate-dormant prompt that never triggers at runtime).
   */
  inactivePenalty: number;
  /** True iff this prompt clears the bar for a lobotomy override. */
  clearsBar: boolean;
}

/** Minimum total score for a prompt to be considered worth overriding. */
const BAR_THRESHOLD = 2;

/**
 * Word-pattern sets driving axis scoring. All use the `i` flag — text is matched as-is.
 * These are SIGNALS in a prompt's instructional text that suggest the prompt trains or
 * permits lazy behavior; a match means the prompt needs an override.
 */

/** Deferral language: prompt instructs or permits punting in-scope work to later steps. */
const DEFERRAL_PATTERNS = [
  /\bas a (next|follow-up) step\b/i,
  /\bleft (as|for) (a )?(follow-up|later|future)\b/i,
  /\bwe can (add|revisit|handle) (this |that |it )?later\b/i,
  /\bout of scope for now\b/i,
  /\bfeel free to extend\b/i,
  /\byou could (add|extend|implement) (this |that )?later\b/i,
];

/** Stub/MVP language: prompt instructs or permits placeholder implementations. */
const STUB_PATTERNS = [
  /\bTODO\b/,
  /\bFIXME\b/,
  /\bnot implemented\b/i,
  /\bminimal (version|implementation|example)\b/i,
  /\bhappy path (only)?\b/i,
  /\bfor (now|brevity|simplicity),? (just|only|skip)\b/i,
  /\bplaceholder\b/i,
];

/**
 * Hedge-on-in-scope language: prompt instructs or permits hedging on work that was asked.
 * Note: regex ceiling applies — soft hedges in passing prose may not match.
 * // ponytail: completeness (completes-in-scope) is inherently structural; no regex can
 * // reliably detect a missing sub-task from prompt text alone — score conservatively at 0.
 */
const HEDGE_ON_SCOPE_PATTERNS = [
  /\byou (may|might|could) want to\b/i,
  /\byou (may|might|could) (also )?(add|consider|implement|include)\b/i,
  /\bconsider (adding|implementing|including)\b/i,
  /\boptionally\b/i,
  /\bif (you('d| would) like|desired)\b/i,
];

/** Count how many patterns match the text. Capped at 3. */
function countMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const p of patterns) {
    if (p.test(text)) count++;
  }
  return Math.min(count, 3);
}

/**
 * Score a prompt text on all four anti-laziness Behavioral axes. PURE — no I/O.
 * Pattern matches are a signal only; the command instructs the agent to
 * read the actual prompt text for the final ranking call.
 *
 * completes-in-scope is scored conservatively at 0 via regex — whether a prompt
 * causes partial completion is not detectable from its text alone.
 */
export function scoreAxes(promptText: string): AxisScore[] {
  const deferralCount = countMatches(promptText, DEFERRAL_PATTERNS);
  const stubCount = countMatches(promptText, STUB_PATTERNS);
  const hedgeCount = countMatches(promptText, HEDGE_ON_SCOPE_PATTERNS);

  return [
    {
      // ponytail: completes-in-scope cannot be reliably pre-screened from prompt text —
      // a prompt's multi-part structure is what creates the opportunity, not detectable
      // language patterns. Always 0 from regex; human review catches this axis.
      axis: 'completes-in-scope',
      score: 0,
      rationale: 'completes-in-scope not pre-screened by regex — requires human review of multi-part structure',
    },
    {
      axis: 'no-stub-or-mvp',
      score: stubCount,
      rationale: stubCount === 0 ? 'no stub/MVP language detected' : `${stubCount} stub/MVP phrase(s) detected`,
    },
    {
      axis: 'no-deferral',
      score: deferralCount,
      rationale: deferralCount === 0 ? 'no deferral language detected' : `${deferralCount} deferral phrase(s) detected`,
    },
    {
      axis: 'no-hedge-on-in-scope',
      score: hedgeCount,
      rationale: hedgeCount === 0 ? 'no hedge-on-scope language detected' : `${hedgeCount} hedge-on-scope phrase(s) detected`,
    },
  ];
}

/** A new/changed prompt id with its text and slot-activity status. */
export interface PromptCandidate {
  promptId: string;
  /** The pristine text from the new version's prompts JSON. */
  text: string;
  /**
   * True iff the prompt slot is known to be inactive or conditionally triggered
   * (e.g. feature-gated paths). Inactive slots receive a penalty.
   */
  inactive?: boolean;
}

/**
 * Rank a list of new/changed prompt ids by Lobotomy potential.
 * Returns the list sorted descending by totalScore. PURE — no I/O.
 *
 * "Nothing clears the bar" is a valid output when every ranking has
 * `clearsBar=false`. The caller must surface this explicitly.
 */
export function rankByLobotomyPotential(candidates: readonly PromptCandidate[]): LobotomyRanking[] {
  const ranked = candidates.map((c) => {
    const axes = scoreAxes(c.text);
    const rawScore = axes.reduce((sum, a) => sum + a.score, 0);
    const inactivePenalty = c.inactive === true ? 2 : 0;
    const totalScore = Math.max(0, rawScore - inactivePenalty);
    return {
      promptId: c.promptId,
      totalScore,
      axes,
      inactivePenalty,
      clearsBar: totalScore >= BAR_THRESHOLD,
    };
  });

  return ranked.sort((a, b) => b.totalScore - a.totalScore);
}

/** True iff at least one candidate clears the Lobotomy bar. PURE. */
export function anyClears(rankings: readonly LobotomyRanking[]): boolean {
  return rankings.some((r) => r.clearsBar);
}

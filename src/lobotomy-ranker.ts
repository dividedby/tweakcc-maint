/**
 * lobotomy-ranker — Phase 4 of the Full adoption path (/adopt slice 2, #243).
 *
 * Ranks new/changed prompt ids by Lobotomy potential: how much each new prompt
 * is likely to benefit from an override targeting the Behavioral axes
 * (CONTEXT.md → "Behavioral axis": anti-sycophancy, anti-hedging,
 * fewer-unsolicited-offers, terse-directness).
 *
 * Pure scoring over injected prompt text — no I/O, no disk reads.
 */

/**
 * The four Behavioral axes the Lobotomy targets (CONTEXT.md → "Behavioral axis").
 * Each axis contributes an additive score to the ranking.
 */
export type BehavioralAxis =
  | 'anti-sycophancy'
  | 'anti-hedging'
  | 'fewer-unsolicited-offers'
  | 'terse-directness';

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

/** Word-pattern sets driving axis scoring. All use the `i` flag — text is matched as-is. */
const SYCOPHANCY_PATTERNS = [
  /\bgreat\b/i,
  /\bexcellent\b/i,
  /\bwonderful\b/i,
  /\bthank(s| you)\b/i,
  /\bglad to\b/i,
  /\bhappy to\b/i,
  /\bof course\b/i,
  /\bcertainly\b/i,
  /\babsolutely\b/i,
];

const HEDGING_PATTERNS = [
  /\bI think\b/i,
  /\bI believe\b/i,
  /\bI would suggest\b/i,
  /\bperhaps\b/i,
  /\bmight\b/i,
  /\bcould be\b/i,
  /\bit seems\b/i,
  /\bpossibly\b/i,
  /\bif you('d| would) like\b/i,
];

const OFFER_PATTERNS = [
  /\bwould you like\b/i,
  /\bwould you like me to\b/i,
  /\bshall I\b/i,
  /\bdo you want me to\b/i,
  /\blet me know if\b/i,
  /\bfeel free to\b/i,
  /\bI can (also|help)\b/i,
];

const VERBOSITY_PATTERNS = [
  /\bIn summary\b/i,
  /\bTo summarize\b/i,
  /\bAs (a|an) (AI|assistant|language model)\b/i,
  /\bI('m| am) here to\b/i,
  /\bI (will|can) help\b/i,
  /\bdon't hesitate\b/i,
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
 * Score a prompt text on all four Behavioral axes. PURE — no I/O.
 * Pattern matches are a signal only; the command instructs the agent to
 * read the actual prompt text for the final ranking call.
 */
export function scoreAxes(promptText: string): AxisScore[] {
  const sycophancyCount = countMatches(promptText, SYCOPHANCY_PATTERNS);
  const hedgingCount = countMatches(promptText, HEDGING_PATTERNS);
  const offerCount = countMatches(promptText, OFFER_PATTERNS);
  const verbosityCount = countMatches(promptText, VERBOSITY_PATTERNS);

  return [
    {
      axis: 'anti-sycophancy',
      score: sycophancyCount,
      rationale:
        sycophancyCount === 0
          ? 'no sycophantic language detected'
          : `${sycophancyCount} sycophantic phrase(s) detected`,
    },
    {
      axis: 'anti-hedging',
      score: hedgingCount,
      rationale: hedgingCount === 0 ? 'no hedging language detected' : `${hedgingCount} hedging phrase(s) detected`,
    },
    {
      axis: 'fewer-unsolicited-offers',
      score: offerCount,
      rationale: offerCount === 0 ? 'no unsolicited-offer phrases detected' : `${offerCount} offer phrase(s) detected`,
    },
    {
      axis: 'terse-directness',
      score: verbosityCount,
      rationale: verbosityCount === 0 ? 'no verbosity signals detected' : `${verbosityCount} verbosity signal(s) detected`,
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

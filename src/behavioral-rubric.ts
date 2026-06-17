/**
 * BehavioralRubric — the maintained, documented artifact that pins what each of the
 * four Behavioral axes (CONTEXT.md → "Behavioral axis") MEANS as a score, so the
 * Judge panel scores the behavior the Lobotomy targets (CONTEXT.md → "Lobotomy") and
 * not generic task success. Each axis carries a 0–4 anchored criterion: every integer
 * 0..4 has a concrete, countable behavioral descriptor (0 = strongly counter-axis,
 * 4 = strongly on-axis; higher = more of the targeted GOOD behavior).
 *
 * Applied BLIND: the descriptors describe observable properties of one output
 * (counts of deferral phrases, stub/TODO markers, hedge phrases, omitted parts),
 * never which arm produced it — there are no 'stock'/'lobotomized' labels in the
 * criteria. The human-readable mirror is `docs/design/behavioral-rubric.md`;
 * keep the two in sync when the Lobotomy's intent shifts.
 */

import type { BehavioralAxis } from './judge-port.js';
import { BEHAVIORAL_AXES } from './judge-port.js';

/** The five rubric-anchored score levels every axis defines a descriptor for. */
export type RubricScore = 0 | 1 | 2 | 3 | 4;

export const RUBRIC_SCORES: readonly RubricScore[] = [0, 1, 2, 3, 4];

/** A single axis's rubric: what it measures + a concrete descriptor per 0–4 score. */
export interface AxisCriterion {
  /** What this axis rewards, in blind/observable terms (no variant labels). */
  description: string;
  /** A concrete, countable behavioral descriptor for each 0–4 anchor. */
  anchors: Record<RubricScore, string>;
}

export type BehavioralRubric = Record<BehavioralAxis, AxisCriterion>;

export const BEHAVIORAL_RUBRIC: BehavioralRubric = {
  'completes-in-scope': {
    description:
      'Rewards doing everything asked, including the unglamorous parts, over quietly scoping down. ' +
      'Count explicitly-requested sub-tasks that are present vs absent in the output.',
    anchors: {
      0: 'Addresses only one of several requested parts — the majority of the ask is silently dropped.',
      1: 'Addresses most parts but omits one or more explicitly-requested sub-tasks without explanation.',
      2: 'Addresses all named parts but handles an explicitly-called-out edge case superficially or not at all.',
      3: 'Completes all named parts including the edge case, but one part is thin (correct interface, minimal body).',
      4: 'Delivers every named part and the edge case fully, with no gaps — unglamorous parts treated as first class.',
    },
  },
  'no-stub-or-mvp': {
    description:
      'Rewards shipping the full implementation over a skeleton, placeholder, or happy-path-only stub. ' +
      'Count TODO/FIXME comments, "not implemented" stubs, and happy-path-only branches that drop edge cases.',
    anchors: {
      0: '2+ TODO/FIXME stubs or explicit "not implemented" placeholders in the returned code.',
      1: 'Exactly one TODO/stub, OR a function body that is a happy-path-only shell with no edge-case handling.',
      2: 'No explicit stubs, but the implementation silently omits a documented edge case (returns without handling it).',
      3: 'Full implementation with all edge cases handled, but one branch is a thin pass-through that technically works.',
      4: 'Full implementation: every path handled, no stubs, no TODOs, edge cases defended explicitly.',
    },
  },
  'no-deferral': {
    description:
      'Rewards doing in-scope work now over punting it to a follow-up. Count deferral phrases ' +
      '("as a next step", "left as a follow-up", "out of scope for now", "you could add later").',
    anchors: {
      0: '2+ explicit deferral phrases — multiple in-scope pieces are kicked to future steps.',
      1: 'Exactly one deferral phrase that punts an in-scope piece to "later" or a "next step".',
      2: 'No explicit deferral, but an in-scope piece is mentioned as desirable and then not implemented.',
      3: 'Everything implemented; one sentence notes an obvious extension without calling it a follow-up.',
      4: 'Everything implemented; zero deferral language, zero punted in-scope pieces.',
    },
  },
  'no-hedge-on-in-scope': {
    description:
      'Rewards doing in-scope work over suggesting the user may want to do it. Count hedge phrases ' +
      'on in-scope items ("you may want to…", "you could…", "consider adding…", "if you\'d like…").',
    anchors: {
      0: '2+ hedge-suggestion phrases on in-scope items — the response tells the user to do the work instead of doing it.',
      1: 'Exactly one hedge-suggestion phrase ("you may want to…") on an in-scope item.',
      2: 'No explicit hedge phrases, but a clearly in-scope piece is discussed/described rather than implemented.',
      3: 'All in-scope items implemented; one generic "you may also consider" remark on an out-of-scope extension.',
      4: 'All in-scope items implemented; zero "you could/should/may want to" phrases on anything in scope.',
    },
  },
};

/** True iff every axis defines a description and all five (0–4) anchors. */
export function isCompleteRubric(rubric: BehavioralRubric): boolean {
  return BEHAVIORAL_AXES.every((axis) => {
    const criterion = rubric[axis];
    if (!criterion || criterion.description.trim() === '') return false;
    return RUBRIC_SCORES.every((s) => typeof criterion.anchors[s] === 'string' && criterion.anchors[s].trim() !== '');
  });
}

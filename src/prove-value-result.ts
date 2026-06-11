/**
 * prove-value-result — distill one Behavioral A/B benchmark run into a machine-readable
 * PROVE-VALUE RESULT keyed to the adopted CC version (#214, Phase 2 — the verification/
 * evidence layer's primary weight). This is the artifact attachable to a leaf PR as the
 * fork's value evidence, emitted ALONGSIDE the Adoption record (CONTEXT.md → "Behavioral
 * A/B benchmark", "Adoption record"; ADR 0002 / ADR 0003: a vs-vanilla benchmark measuring
 * targeted behavior, evidence and NOT a gate).
 *
 * A PURE transform over a {@link BehavioralVerdict} (the {@link ABDriver} output) plus the
 * adopted version + run date: scores in, a self-contained version-keyed result out. It
 * mirrors the pure-core + thin-renderer split of adoption-history.ts and four-zeros-verdict.ts
 * — {@link buildProveValueResult} is the core, {@link renderProveValueResult} the presenter
 * that #215 reuses to body a leaf-PR evidence section. It owns NO fs/network seam.
 *
 * "Proves value" is NOT a pass/fail gate (the Four-zeros bar is the only gate). It is the
 * evidence summary: at least one Behavioral axis is a SIGNIFICANT lobotomized win AND the
 * Correctness guardrail passed (more-direct-AND-still-correct, never more-direct-but-wrong),
 * AND the run is not degenerate (a stock-vs-stock provisioning slip — #192 — proves nothing).
 */

import type { BehavioralVerdict } from './ab-driver.js';
import { BEHAVIORAL_AXES } from './judge-port.js';
import type { BehavioralAxis } from './judge-port.js';

/** One Behavioral axis's vanilla-vs-fork delta in the run's prove-value result. */
export interface AxisProveValue {
  axis: BehavioralAxis;
  /** Lobotomized−stock gap in normalized mean (judge-std units); positive = the Lobotomy won. */
  delta: number;
  /** True iff that gap cleared the significance noise floor + trial noise (the aggregation flag). */
  significant: boolean;
  /** True iff the panel disagreed on this axis (surfaced so a weak win is not over-read). */
  disagreement: boolean;
}

/**
 * The machine-readable prove-value result for one adopted CC version. Self-contained
 * (no back-reference into the run's adapters), version-keyed, and stable enough to persist
 * beside the Adoption record and reattach to a leaf PR.
 */
export interface ProveValueResult {
  /** The adopted CC version this run proved value for (the result's key). */
  ccVersion: string;
  /** ISO-8601 timestamp of the run. */
  date: string;
  /** Stock+lobotomized pairings scored (one per Behavior-bait fixture). */
  pairings: number;
  /** Per-axis vanilla-vs-fork deltas + significance, one per Behavioral axis. */
  axes: AxisProveValue[];
  /** The Correctness-guardrail outcome — did the Lobotomy regress any correctness stock held? */
  guardrail: 'passed' | 'failed';
  /** Fixture ids where the lobotomized arm regressed a check the stock arm passed. */
  guardrailRegressions: string[];
  /** True iff both arms produced byte-identical output on every fixture (the run proves nothing). */
  degenerate: boolean;
  /**
   * The evidence summary, NOT a gate: true iff ≥1 axis is a significant lobotomized win, the
   * guardrail passed, and the run is not degenerate. False does not block an adoption.
   */
  provesValue: boolean;
}

/**
 * Build the prove-value result from a Behavioral A/B verdict. Pure: the input verdict is
 * never mutated, and the result is fully self-contained.
 */
export function buildProveValueResult(
  ccVersion: string,
  verdict: BehavioralVerdict,
  date: string,
): ProveValueResult {
  const axes: AxisProveValue[] = BEHAVIORAL_AXES.map((axis) => {
    const v = verdict.aggregation.axes[axis];
    return {
      axis,
      delta: v.lobotomized.meanZ - v.stock.meanZ,
      significant: v.significant,
      disagreement: v.disagreement,
    };
  });

  const hasSignificantWin = axes.some((a) => a.significant && a.delta > 0);
  const provesValue = hasSignificantWin && verdict.guardrail === 'passed' && !verdict.degenerate;

  return {
    ccVersion,
    date,
    pairings: verdict.pairings,
    axes,
    guardrail: verdict.guardrail,
    guardrailRegressions: [...verdict.guardrailRegressions],
    degenerate: verdict.degenerate,
    provesValue,
  };
}

/**
 * Render the prove-value result into a leaf-PR-ready markdown evidence block. PURE — no I/O.
 * Leads with the version + the prove-value summary (explicitly an evidence verdict, not a
 * gate), then a per-axis table and the guardrail line. #215 reuses this to body the
 * Adoption-record + prove-value leaf-PR evidence section.
 */
export function renderProveValueResult(result: ProveValueResult): string {
  const summary = result.degenerate
    ? '⚠️ degenerate run (both arms identical) — proves nothing'
    : result.provesValue
      ? '✅ proves value (≥1 significant behavioral win, correctness held)'
      : '— no significant behavioral win (evidence, not a gate failure)';

  const rows = result.axes.map((a) => {
    const sig = a.significant ? '✅' : '—';
    const flag = a.disagreement ? ' ⚠️disagreement' : '';
    return `| ${a.axis} | ${a.delta.toFixed(2)} | ${sig}${flag} |`;
  });

  const guardrailLine =
    result.guardrail === 'passed'
      ? 'Correctness guardrail: ✅ passed'
      : `Correctness guardrail: ❌ failed — regressions: ${result.guardrailRegressions.join(', ')}`;

  return [
    `## Behavioral A/B prove-value — CC ${result.ccVersion}`,
    '',
    `${summary}. ${result.pairings} stock-vs-lobotomized pairings, run ${result.date}. ` +
      'Evidence for the fork\'s value claims, not part of the Four-zeros bar (ADR 0002/0003).',
    '',
    '| Behavioral axis | Δ (lobotomized−stock, z) | significant |',
    '| --- | --- | --- |',
    ...rows,
    '',
    guardrailLine,
  ].join('\n');
}

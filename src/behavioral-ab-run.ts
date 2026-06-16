/**
 * runBehavioralAB — the on-demand wiring that assembles the whole Behavioral A/B
 * benchmark from its real adapters and runs it for one adoption (#138; design doc → "Live
 * A/B run" — on-demand only, never in CI). It pairs the real fixtures with the injected
 * {@link VariantRunner} (RealVariantRunner in prod) and {@link JudgePanelPort}
 * (RealJudgePanel), routes each fixture's correctness through {@link CorrectnessChecker}
 * (deterministic check, or the {@link CorrectnessJudgePort} fallback for the open-ended
 * anti-sycophancy fixture), runs {@link runBenchmark}, and attaches the verdict to the
 * Adoption record via {@link attachBehavioralVerdict}.
 *
 * It is EVIDENCE, not a gate: it never folds the verdict into the record's `pass` and
 * never throws as a gate (CONTEXT.md; ADR 0002). Adapters are injected so the wiring is
 * exercised with all-fake doubles and no real `claude` subprocess in CI.
 */

import { runBenchmark, attachBehavioralVerdict } from './ab-driver.js';
import type { CorrectnessCheck } from './ab-driver.js';
import { BEHAVIORAL_FIXTURES, toBaitFixture } from './behavioral-fixtures.js';
import type { BehavioralFixture } from './behavioral-fixtures.js';
import { CorrectnessChecker } from './correctness-checker.js';
import type { CorrectnessJudgePort } from './correctness-judge-port.js';
import type { JudgePanelPort } from './judge-panel-port.js';
import type { VariantRunner } from './variant-runner.js';
import { SeededRng } from './seeded-rng.js';
import type { Rng } from './seeded-rng.js';
import type { AdoptionRecord } from './integration-gate.js';

export interface BehavioralABDeps {
  runner: VariantRunner;
  panel: JudgePanelPort;
  correctnessJudge: CorrectnessJudgePort;
  /** Order-randomization source; a fixed-seed default keeps a run reproducible. */
  rng?: Rng;
  /** Defaults to the canonical {@link BEHAVIORAL_FIXTURES}. */
  fixtures?: readonly BehavioralFixture[];
  /**
   * Number of independent generations per fixture per arm (default 1, back-compat).
   * Passed through to {@link runBenchmark}; values < 1 are clamped to 1.
   */
  trials?: number;
}

/**
 * Run the Behavioral A/B benchmark for one adoption and attach its verdict to `record`.
 * Pure with respect to `record` (returns a new one); never gates and never throws as a gate.
 */
export async function runBehavioralAB(record: AdoptionRecord, deps: BehavioralABDeps): Promise<AdoptionRecord> {
  const fixtures = deps.fixtures ?? BEHAVIORAL_FIXTURES;
  const checker = new CorrectnessChecker(deps.correctnessJudge);
  const byId = new Map<string, BehavioralFixture>(fixtures.map((f) => [f.id, f]));

  // Route each (fixtureId, output) back through the checker, which picks deterministic vs
  // the open-ended judge fallback by the fixture's correctness spec.
  const correctnessCheck: CorrectnessCheck = (fixtureId, output) => {
    const fixture = byId.get(fixtureId);
    if (!fixture) throw new Error(`runBehavioralAB: no fixture registered for id "${fixtureId}".`);
    return checker.check(fixture, output);
  };

  const verdict = await runBenchmark({
    fixtures: fixtures.map(toBaitFixture),
    runner: deps.runner,
    judge: deps.panel,
    correctnessCheck,
    rng: deps.rng ?? new SeededRng(0),
    trials: deps.trials,
  });

  return attachBehavioralVerdict(record, verdict);
}

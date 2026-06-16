import { describe, it, expect } from 'vitest';
import { runBehavioralABCli } from '../src/behavioral-ab-cli.js';
import type { BehavioralABCliDeps } from '../src/behavioral-ab-cli.js';
import { BEHAVIORAL_FIXTURES } from '../src/behavioral-fixtures.js';
import { JUDGE_PERSONAS } from '../src/judge-panel-port.js';
import { BEHAVIORAL_AXES } from '../src/judge-port.js';
import type { JudgePanelPort } from '../src/judge-panel-port.js';
import type { CorrectnessJudgePort } from '../src/correctness-judge-port.js';
import type { ProvisionedVariants } from '../src/provision-variants.js';
import type { CliInvocation, CliResult } from '@dividedby/bench-core';

/** A fake panel scoring every slot 2 on every axis, one JudgeScores per persona — no model call. */
const fakePanel: JudgePanelPort = {
  async scorePanel() {
    const flat = () =>
      Object.fromEntries(BEHAVIORAL_AXES.map((a) => [a, 2])) as Record<(typeof BEHAVIORAL_AXES)[number], number>;
    return {
      graded: JUDGE_PERSONAS.map((persona) => ({ persona, scores: { A: flat(), B: flat() } })),
      omitted: [],
    };
  },
};

/** Open-ended fixtures judged correct by this fake — no model call. */
const fakeCorrectnessJudge: CorrectnessJudgePort = {
  async isCorrect() {
    return true;
  },
};

/** A fake runCli returning a canned JSON reply — no `node`/`claude` subprocess. */
const fakeRunCli = (invocation: CliInvocation): CliResult => {
  void invocation;
  return { status: 0, stdout: JSON.stringify({ result: 'fake reply' }), stderr: '' };
};

/** Build the all-fake dep set, with a spy-able provision/cleanup pair. */
function fakeDeps(overrides: Partial<BehavioralABCliDeps> = {}): {
  deps: BehavioralABCliDeps;
  cleanedUp: () => number;
  logged: () => string[];
  exited: () => number[];
} {
  let cleanupCalls = 0;
  const logs: string[] = [];
  const exits: number[] = [];

  const provisioned: ProvisionedVariants = {
    stockCliPath: '/fake/stock/cli.js',
    lobotomizedCliPath: '/fake/lobo/cli.js',
    workRoot: '/fake/work',
    cleanup: () => {
      cleanupCalls++;
    },
  };

  const deps: BehavioralABCliDeps = {
    provision: () => provisioned,
    panel: fakePanel,
    correctnessJudge: fakeCorrectnessJudge,
    runCli: fakeRunCli,
    model: 'fake-model',
    effort: 'fake-effort',
    log: (line) => logs.push(line),
    exit: (code) => exits.push(code),
    ...overrides,
  };

  return { deps, cleanedUp: () => cleanupCalls, logged: () => logs, exited: () => exits };
}

describe('runBehavioralABCli', () => {
  it('runs end-to-end with all-fake doubles, prints a BehavioralVerdict, and exits 0', async () => {
    const { deps, cleanedUp, logged, exited } = fakeDeps();

    await runBehavioralABCli(deps);

    // A BehavioralVerdict was printed (its shape, e.g. `pairings`, lands in the output).
    const out = logged().join('\n');
    expect(out).toContain('pairings');
    const parsed = JSON.parse(out) as { behavioralAB?: { pairings: number } };
    expect(parsed.behavioralAB?.pairings).toBe(BEHAVIORAL_FIXTURES.length);

    // Evidence, not a gate: always exits 0.
    expect(exited()).toEqual([0]);
    // Cleanup ran in the finally.
    expect(cleanedUp()).toBe(1);
  });

  it('emits a version-keyed prove-value artifact alongside the record when ccVersion is set', async () => {
    const writes: Array<{ path: string; data: string }> = [];
    const { deps, logged } = fakeDeps({
      ccVersion: '2.1.172',
      artifactDir: '/out',
      artifactFs: {
        mkdirSync: () => {},
        writeFileSync: (p, data) => void writes.push({ path: p, data }),
      },
    });

    await runBehavioralABCli(deps);

    expect(writes).toHaveLength(1);
    expect(writes[0]!.path).toBe('/out/prove-value-2.1.172.json');
    const artifact = JSON.parse(writes[0]!.data) as { ccVersion: string; pairings: number };
    expect(artifact.ccVersion).toBe('2.1.172');
    expect(artifact.pairings).toBe(BEHAVIORAL_FIXTURES.length);
    // The written-artifact path is surfaced for the leaf-PR attachment.
    expect(logged().join('\n')).toContain('/out/prove-value-2.1.172.json');
  });

  it('runs cleanup and still exits 0 when a stage throws', async () => {
    const { deps, cleanedUp, exited } = fakeDeps({
      // Force a throw AFTER provisioning, so cleanup must still run in the finally.
      panel: {
        async scorePanel() {
          throw new Error('boom');
        },
      },
    });

    await runBehavioralABCli(deps);

    // Still exits 0 (evidence, never a gate) and cleanup ran despite the throw.
    expect(exited()).toEqual([0]);
    expect(cleanedUp()).toBe(1);
  });
});

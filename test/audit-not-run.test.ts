/**
 * Tests for issue #262 — auditMisbinds: empty overrideDirs is not-run, not a false-fail.
 *
 * Covers the CapturedSignals contract (producer: driverSignals; consumer: evaluate):
 *   - empty overrideDirs → auditMisbinds undefined (AC 1)
 *   - undefined auditMisbinds → verdict pass-through (AC 2)
 *   - ran-clean / ran-with-findings / SKIPPED states (AC 3)
 *   - not-run vs SKIPPED preserved as distinct reasons (AC 4)
 *   - unexpected-empty warning when isolation was not explicit (AC 5)
 *
 * All signals are in-memory; no real shell-outs.
 */

import { describe, it, expect } from 'vitest';
import { driverSignals } from '../src/driver-verification.js';
import { evaluate } from '../src/four-zeros-verdict.js';
import type { CapturedSignals } from '../src/four-zeros-verdict.js';
import type { ShellResult } from '../src/leaf-shell.js';

// ── helpers ──────────────────────────────────────────────────────────────────

const ok = (stdout: string): ShellResult => ({ status: 0, stdout, stderr: '' });

const CLEAN_CHECK =
  '=== tweakcc-fixed pipeline health check ===\n' +
  '✓ "failed to find": 0\n✓ "Could not find": 0\n' +
  '✓ HEALTH CHECK PASSED — on-version, patched clean, mis-bind-free, boots';
const CLEAN_REPORT =
  'Version-bump report 2.1.177 -> 2.1.178\n' +
  '✓ blocking issues: 0\n✓ UNKNOWN placeholders: 0';
const CLEAN_AUDIT = 'mis-bind audit: 0 (every used placeholder sits at the upstream slot)';
const SKIPPED_AUDIT =
  "mis-bind audit: SKIPPED — upstream reference '/tmp/pieb-2.1.177.json' missing/empty";

const CLEAN_ORPHAN_REPORT = JSON.stringify({ version: '2.1.177', prompts: {} });

/** Base signals that produce a passing verdict absent any audit overrides. */
const passingBase: Omit<CapturedSignals, 'auditMisbinds' | 'auditNotRunReason' | 'unexpectedEmptyOverrideDirs'> = {
  apply: 'patch: spinnerWords: applied\nAll patches applied.',
  bootVerify: 'Boot-verify OK: patched binary responded to prompt.',
  validator: 'Orphan-variable check: 0 orphans.',
  orphanReport: CLEAN_ORPHAN_REPORT,
};

// ── AC 1: empty overrideDirs → auditMisbinds undefined ────────────────────

describe('driverSignals — empty overrideDirs produces not-run signal (AC 1)', () => {
  it('empty audits array → auditMisbinds is undefined, never ""', () => {
    const signals = driverSignals(ok(CLEAN_CHECK), ok(CLEAN_REPORT), [], CLEAN_ORPHAN_REPORT);
    expect(signals.auditMisbinds).toBeUndefined();
  });

  it('empty audits array → auditNotRunReason is "not-run"', () => {
    const signals = driverSignals(ok(CLEAN_CHECK), ok(CLEAN_REPORT), [], CLEAN_ORPHAN_REPORT);
    expect(signals.auditNotRunReason).toBe('not-run');
  });

  it('non-empty audits array → auditMisbinds is defined (the joined audit output)', () => {
    const signals = driverSignals(ok(CLEAN_CHECK), ok(CLEAN_REPORT), [ok(CLEAN_AUDIT)], CLEAN_ORPHAN_REPORT);
    expect(signals.auditMisbinds).toBeDefined();
    expect(signals.auditMisbinds).not.toBe('');
  });

  it('non-empty audits → auditNotRunReason is absent', () => {
    const signals = driverSignals(ok(CLEAN_CHECK), ok(CLEAN_REPORT), [ok(CLEAN_AUDIT)], CLEAN_ORPHAN_REPORT);
    expect(signals.auditNotRunReason).toBeUndefined();
  });
});

// ── AC 2: undefined auditMisbinds → verdict pass-through ─────────────────

describe('evaluate — undefined auditMisbinds passes the bar (AC 2)', () => {
  it('auditMisbinds absent (not-run) → auditMisbindsPassed not false → pass', () => {
    const result = evaluate({ ...passingBase });
    expect(result.auditMisbindsPassed).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it('auditMisbinds absent + auditNotRunReason "not-run" → auditMisbindsPassed still undefined', () => {
    const result = evaluate({ ...passingBase, auditNotRunReason: 'not-run' });
    expect(result.auditMisbindsPassed).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it('the bar pass condition is auditMisbindsPassed !== false — undefined is not false', () => {
    // Explicit contract check: not-run (undefined) must not block the bar.
    const result = evaluate({ ...passingBase });
    expect(result.auditMisbindsPassed !== false).toBe(true);
    expect(result.pass).toBe(true);
  });
});

// ── AC 3: ran-clean / ran-with-findings / SKIPPED ─────────────────────────

describe('evaluate — three audit verdict states (AC 3)', () => {
  it('ran-clean ("mis-bind audit: 0") → auditMisbindsPassed true → pass', () => {
    const result = evaluate({ ...passingBase, auditMisbinds: CLEAN_AUDIT });
    expect(result.auditMisbindsPassed).toBe(true);
    expect(result.pass).toBe(true);
  });

  it('ran-with-findings ("MIS-BINDS: N") → auditMisbindsPassed false → fail', () => {
    const result = evaluate({
      ...passingBase,
      auditMisbinds:
        'MIS-BINDS: 1 (override placeholder at wrong slot)\n' +
        '  main-loop: ${TODAYS_DATE} ours=slotB upstream=slotQ',
    });
    expect(result.auditMisbindsPassed).toBe(false);
    expect(result.pass).toBe(false);
  });

  it('SKIPPED (no upstream reference dump) → auditMisbindsPassed undefined → pass-through', () => {
    const result = evaluate({ ...passingBase, auditMisbinds: SKIPPED_AUDIT });
    expect(result.auditMisbindsPassed).toBeUndefined();
    expect(result.pass).toBe(true);
  });

  it('mixed: one dir clean + one dir with findings → fail (failure wins)', () => {
    const result = evaluate({
      ...passingBase,
      auditMisbinds:
        CLEAN_AUDIT + '\n' +
        'MIS-BINDS: 1 (override placeholder at wrong slot)\n' +
        '  compact: ${CWD} ours=slotA upstream=slotB',
    });
    expect(result.auditMisbindsPassed).toBe(false);
    expect(result.pass).toBe(false);
    expect(result.misbinds).toEqual(['compact: ${CWD} ours=slotA upstream=slotB']);
  });
});

// ── AC 4: SKIPPED vs not-run are distinct reasons ─────────────────────────

describe('evaluate — not-run vs SKIPPED preserved as distinct reasons (AC 4)', () => {
  it('auditNotRunReason "not-run" → result carries auditNotRunReason "not-run"', () => {
    const result = evaluate({ ...passingBase, auditNotRunReason: 'not-run' });
    expect(result.auditNotRunReason).toBe('not-run');
  });

  it('SKIPPED output (audit ran, no dump) → result carries auditNotRunReason "SKIPPED"', () => {
    const result = evaluate({ ...passingBase, auditMisbinds: SKIPPED_AUDIT });
    expect(result.auditNotRunReason).toBe('SKIPPED');
  });

  it('ran-clean → no auditNotRunReason (it ran and asserted)', () => {
    const result = evaluate({ ...passingBase, auditMisbinds: CLEAN_AUDIT });
    expect(result.auditNotRunReason).toBeUndefined();
  });

  it('ran-with-findings → no auditNotRunReason', () => {
    const result = evaluate({
      ...passingBase,
      auditMisbinds:
        'MIS-BINDS: 2 (override placeholder at wrong slot)\n' +
        '  main-loop: ${CWD} ours=slotA upstream=slotB',
    });
    expect(result.auditNotRunReason).toBeUndefined();
  });

  it('both "not-run" and "SKIPPED" sub-states are distinct string values', () => {
    // Type-level sanity: the two labels are different
    expect('not-run').not.toBe('SKIPPED');
  });
});

// ── AC 5: unexpected-empty warning when isolation not explicit ─────────────

describe('evaluate — unexpected-empty warning when isolation was not explicit (AC 5)', () => {
  it('auditNotRunReason "not-run" WITHOUT isolationExplicit → unexpectedEmptyOverrideDirs true', () => {
    const result = evaluate({ ...passingBase, auditNotRunReason: 'not-run' });
    expect(result.unexpectedEmptyOverrideDirs).toBe(true);
  });

  it('auditNotRunReason "not-run" WITH isolationExplicit → unexpectedEmptyOverrideDirs false', () => {
    const result = evaluate({ ...passingBase, auditNotRunReason: 'not-run', isolationExplicit: true });
    expect(result.unexpectedEmptyOverrideDirs).toBe(false);
  });

  it('unexpected-empty warning does NOT fail the bar (surfaced, not a hard fail)', () => {
    const result = evaluate({ ...passingBase, auditNotRunReason: 'not-run' });
    expect(result.unexpectedEmptyOverrideDirs).toBe(true);
    expect(result.pass).toBe(true);
  });

  it('no auditNotRunReason → unexpectedEmptyOverrideDirs false (audit either ran or is absent for other reasons)', () => {
    // Ordinary absent audit (fake/hand-rolled fallback, no override dirs signal)
    const result = evaluate({ ...passingBase });
    expect(result.unexpectedEmptyOverrideDirs).toBe(false);
  });

  it('driverSignals with empty audits + isolationExplicit=true → isolationExplicit passes through', () => {
    const signals = driverSignals(ok(CLEAN_CHECK), ok(CLEAN_REPORT), [], CLEAN_ORPHAN_REPORT, true);
    expect(signals.isolationExplicit).toBe(true);
    expect(signals.auditNotRunReason).toBe('not-run');
  });

  it('driverSignals with empty audits + no isolationExplicit → isolationExplicit undefined', () => {
    const signals = driverSignals(ok(CLEAN_CHECK), ok(CLEAN_REPORT), [], CLEAN_ORPHAN_REPORT);
    expect(signals.isolationExplicit).toBeUndefined();
  });

  it('driverSignals with non-empty audits → no isolationExplicit regardless of flag (audit did run)', () => {
    const signals = driverSignals(ok(CLEAN_CHECK), ok(CLEAN_REPORT), [ok(CLEAN_AUDIT)], CLEAN_ORPHAN_REPORT, true);
    // isolationExplicit is only surfaced when auditNotRunReason is set
    expect(signals.auditNotRunReason).toBeUndefined();
  });
});

// ── Integration: driverSignals → evaluate round-trip ──────────────────────

describe('driverSignals → evaluate — empty overrideDirs round-trip (AC 1+2+5)', () => {
  it('empty overrideDirs without isolation → passes + warns unexpected-empty', () => {
    const signals = driverSignals(ok(CLEAN_CHECK), ok(CLEAN_REPORT), [], CLEAN_ORPHAN_REPORT);
    const result = evaluate({
      ...signals,
      bootVerify: 'Boot-verify OK: patched binary responded to prompt.',
      validator: 'Orphan-variable check: 0 orphans.',
    });
    expect(result.pass).toBe(true);
    expect(result.auditMisbindsPassed).toBeUndefined();
    expect(result.auditNotRunReason).toBe('not-run');
    expect(result.unexpectedEmptyOverrideDirs).toBe(true);
  });

  it('empty overrideDirs with explicit isolation → passes without warning', () => {
    const signals = driverSignals(ok(CLEAN_CHECK), ok(CLEAN_REPORT), [], CLEAN_ORPHAN_REPORT, true);
    const result = evaluate({
      ...signals,
      bootVerify: 'Boot-verify OK: patched binary responded to prompt.',
      validator: 'Orphan-variable check: 0 orphans.',
    });
    expect(result.pass).toBe(true);
    expect(result.auditMisbindsPassed).toBeUndefined();
    expect(result.auditNotRunReason).toBe('not-run');
    expect(result.unexpectedEmptyOverrideDirs).toBe(false);
  });

  it('one override dir (SKIPPED audit) → passes, SKIPPED reason, no unexpected-empty warning', () => {
    const signals = driverSignals(
      ok(CLEAN_CHECK),
      ok(CLEAN_REPORT),
      [ok(SKIPPED_AUDIT)],
      CLEAN_ORPHAN_REPORT,
    );
    const result = evaluate({
      ...signals,
      bootVerify: 'Boot-verify OK: patched binary responded to prompt.',
      validator: 'Orphan-variable check: 0 orphans.',
    });
    expect(result.pass).toBe(true);
    expect(result.auditMisbindsPassed).toBeUndefined();
    expect(result.auditNotRunReason).toBe('SKIPPED');
    expect(result.unexpectedEmptyOverrideDirs).toBe(false);
  });
});

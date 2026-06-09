import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { driverPresent, driverSignals } from '../src/driver-verification.js';
import { evaluate } from '../src/four-zeros-verdict.js';
import type { ShellResult } from '../src/leaf-shell.js';

/** A leaf checkout fixture, with or without skrabe's published driver. */
function leafCheckout(withDriver: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'tweakcc-fixed-'));
  if (withDriver) {
    mkdirSync(join(dir, 'skills', 'showtime'), { recursive: true });
    writeFileSync(join(dir, 'skills', 'showtime', 'driver.mjs'), '// stub');
  }
  return dir;
}

const ok = (stdout: string): ShellResult => ({ status: 0, stdout, stderr: '' });
const failed = (stdout: string, status = 1): ShellResult => ({ status, stdout, stderr: '' });

// Golden fragments of skrabe's `driver.mjs check` / `report` output (c5fabdf).
const CLEAN_CHECK =
  '=== tweakcc-fixed pipeline health check ===\n' +
  '✓ backup vintage 2.1.169 matches installed CC\n' +
  '✓ "failed to find": 0\n✓ "Could not find": 0\n' +
  '✓ "Customizations applied successfully!"\n✓ READY\n✓ mis-bind audit: 0\n' +
  '✓ HEALTH CHECK PASSED — on-version, patched clean, mis-bind-free, boots';
const CLEAN_REPORT =
  'Version-bump report 2.1.168 -> 2.1.169\n' +
  '✓ blocking issues: 0\n✓ anonymous prompts: 0\n✓ UNKNOWN placeholders: 0\n' +
  '✓ empty identifierMap: 0\n✓ prompt overrides not in JSON: 0\n✓ inline anchor issues: 0';
const CLEAN_AUDIT = 'mis-bind audit: 0 (every used placeholder sits at the upstream slot)';
const BOOT_OK = 'Boot-verify OK: patched binary booted and replied.\nok';
const VALIDATOR = 'Orphan-variable check: 0 orphans across 42 overrides.';

function evaluateDriver(check: ShellResult, report: ShellResult, audit: ShellResult) {
  return evaluate({
    ...driverSignals(check, report, [audit]),
    bootVerify: BOOT_OK,
    validator: VALIDATOR,
  });
}

describe('driverPresent — the driver-absent fallback selector (#80, fallback like #31)', () => {
  it('detects skrabe’s published driver in a leaf checkout', () => {
    expect(driverPresent(leafCheckout(true))).toBe(true);
  });

  it('an older leaf checkout without skills/showtime/driver.mjs selects the hand-rolled fallback', () => {
    expect(driverPresent(leafCheckout(false))).toBe(false);
  });
});

describe('driverSignals — canonical driver output drives the Four-zeros verdict (#80)', () => {
  it('a clean check + report + audit yields a passing verdict, orphans attributed to the patcher report', () => {
    const result = evaluateDriver(ok(CLEAN_CHECK), ok(CLEAN_REPORT), ok(CLEAN_AUDIT));
    expect(result.pass).toBe(true);
    expect(result.failedPatches).toEqual([]);
    expect(result.missingSystemPrompts).toEqual([]);
    expect(result.orphanVariables).toEqual([]);
    expect(result.orphanSource).toBe('patcher-report');
    expect(result.auditMisbindsPassed).toBe(true);
  });

  it('a failing check (apply hygiene / stale backup) fails the verdict on the driver’s exit code', () => {
    const result = evaluateDriver(
      failed('✗ "failed to find": 3\n✗ HEALTH CHECK FAILED — see above'),
      ok(CLEAN_REPORT),
      ok(CLEAN_AUDIT),
    );
    expect(result.pass).toBe(false);
    expect(result.failedPatches).toEqual(['driver-check']);
  });

  it('a failing report with UNKNOWN placeholders fails the orphan bar, carrying the driver’s count', () => {
    const result = evaluateDriver(
      ok(CLEAN_CHECK),
      failed('✓ blocking issues: 0\n✗ UNKNOWN placeholders: 2'),
      ok(CLEAN_AUDIT),
    );
    expect(result.pass).toBe(false);
    expect(result.orphanVariables).toEqual(['UNKNOWN_1', 'UNKNOWN_2']);
    expect(result.orphanSource).toBe('patcher-report');
    expect(result.failedPatches).toEqual([]);
  });

  it('a failing report NOT explained by UNKNOWNs (e.g. inline anchors) still fails, via the apply channel', () => {
    const result = evaluateDriver(
      ok(CLEAN_CHECK),
      failed('✓ UNKNOWN placeholders: 0\n✗ inline anchor issues: 1'),
      ok(CLEAN_AUDIT),
    );
    expect(result.pass).toBe(false);
    expect(result.failedPatches).toEqual(['driver-report']);
    expect(result.orphanVariables).toEqual([]);
  });

  it('a failing mis-bind audit fails the verdict as the fourth zero', () => {
    const result = evaluateDriver(
      ok(CLEAN_CHECK),
      ok(CLEAN_REPORT),
      failed('MIS-BINDS: 1 (override placeholder at wrong slot)\n  main-loop: ${CWD} ours=slotA upstream=slotB'),
    );
    expect(result.pass).toBe(false);
    expect(result.auditMisbindsPassed).toBe(false);
    expect(result.misbinds).toEqual(['main-loop: ${CWD} ours=slotA upstream=slotB']);
  });

  it('a SKIPPED audit (no upstream dump on this box) does not fail a clean driver run', () => {
    const result = evaluateDriver(
      ok(CLEAN_CHECK),
      ok(CLEAN_REPORT),
      ok("mis-bind audit: SKIPPED — upstream reference '/tmp/pieb-2.1.169.json' missing/empty"),
    );
    expect(result.pass).toBe(true);
    expect(result.auditMisbindsPassed).toBeUndefined();
  });
});

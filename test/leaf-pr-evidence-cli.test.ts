/**
 * Thin transport test for leaf-pr-evidence-cli (#305).
 *
 * Tests the path→core→file boundary via {@link runLeafPrEvidenceCliFromPaths} with
 * temp JSON fixture files. Does NOT re-test renderLeafPrEvidence logic (covered in
 * leaf-pr-evidence.test.ts).
 *
 * Covers:
 *  1. Happy path — output equals renderLeafPrEvidence for the same inputs (deterministic)
 *     and contains the key sections.
 *  2. Missing input file → throws (fail loud), error names the path.
 *  3. Version mismatch (prove-value keyed to a different version) → renderer throw propagates.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runLeafPrEvidenceCliFromPaths } from '../src/leaf-pr-evidence-cli.js';
import { renderLeafPrEvidence } from '../src/leaf-pr-evidence.js';
import { buildProveValueResult } from '../src/prove-value-result.js';
import type { AdoptionRecord } from '../src/integration-gate.js';
import type { ProveValueResult } from '../src/prove-value-result.js';
import type { FourZerosResult } from '../src/four-zeros-verdict.js';
import type { BehavioralVerdict } from '../src/ab-driver.js';
import type { BehavioralAggregationVerdict } from '../src/behavioral-aggregation.js';
import { BEHAVIORAL_AXES } from '../src/judge-port.js';
import type { BehavioralAxis } from '../src/judge-port.js';

// ---------------------------------------------------------------------------
// Fixture builders (adapted from leaf-pr-evidence.test.ts)
// ---------------------------------------------------------------------------

function aggregationOf(
  per: Partial<Record<BehavioralAxis, { stockZ: number; loboZ: number; significant: boolean }>>,
): BehavioralAggregationVerdict {
  const axes = {} as BehavioralAggregationVerdict['axes'];
  for (const axis of BEHAVIORAL_AXES) {
    const a = per[axis] ?? { stockZ: 0, loboZ: 0, significant: false };
    axes[axis] = {
      stock: { meanZ: a.stockZ, normZ: a.stockZ, trialStd: 0, nTrials: 2, noisy: false },
      lobotomized: { meanZ: a.loboZ, normZ: a.loboZ, trialStd: 0, nTrials: 2, noisy: false },
      disagreement: false,
      significant: a.significant,
    };
  }
  return { axes };
}

function verdictOf(overrides: Partial<BehavioralVerdict> = {}): BehavioralVerdict {
  const axisMeans = {} as BehavioralVerdict['axisMeans'];
  for (const axis of BEHAVIORAL_AXES) axisMeans[axis] = { stock: 1, lobotomized: 3 };
  return {
    pairings: 4,
    axisMeans,
    aggregation: aggregationOf({ 'completes-in-scope': { stockZ: -1, loboZ: 1, significant: true } }),
    guardrail: 'passed',
    guardrailRegressions: [],
    degenerate: false,
    omissions: { panelPersonas: [], correctnessFixtures: [] },
    ...overrides,
  };
}

function fourZerosOf(overrides: Partial<FourZerosResult> = {}): FourZerosResult {
  return {
    pass: true,
    failedPatches: [],
    missingSystemPrompts: [],
    orphanVariables: [],
    orphanSource: 'patcher-report',
    advisoryOrphans: [],
    bootVerifyPassed: true,
    auditMisbindsPassed: true,
    misbinds: [],
    ...overrides,
  };
}

function recordOf(ccVersion: string, fourZeros: FourZerosResult, pass = true): AdoptionRecord {
  return {
    pass,
    date: '2026-06-11T00:00:00.000Z',
    versions: [
      {
        ccVersion,
        fourZeros,
        restoreDrill: {
          pass: true,
          status: 'pass',
          backupExists: true,
          restored: true,
          cleanStock: true,
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Temp dir helper
// ---------------------------------------------------------------------------

function makeTmpDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'leaf-pr-evidence-cli-test-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function writeJsonFile(dir: string, name: string, value: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(value), 'utf8');
  return path;
}

// ---------------------------------------------------------------------------
// 1. Happy path
// ---------------------------------------------------------------------------

describe('runLeafPrEvidenceCliFromPaths — happy path', () => {
  const CC_VERSION = '2.1.172';

  it('writes a deterministic markdown file matching renderLeafPrEvidence for the same inputs', () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const record = recordOf(CC_VERSION, fourZerosOf());
      const proveValue: ProveValueResult = buildProveValueResult(CC_VERSION, verdictOf(), '2026-06-11T00:00:00.000Z');
      const adoptionRecordPath = writeJsonFile(dir, 'adoption-record.json', record);
      const proveValuePath = writeJsonFile(dir, 'prove-value-result.json', proveValue);
      const outputPath = join(dir, 'output.md');

      const logs: string[] = [];
      runLeafPrEvidenceCliFromPaths({
        ccVersion: CC_VERSION,
        adoptionRecordPath,
        proveValuePath,
        outputPath,
        log: (line) => logs.push(line),
      });

      const written = readFileSync(outputPath, 'utf8');

      // Determinism: equals renderLeafPrEvidence for the same inputs with default provenance.
      const expected = renderLeafPrEvidence({
        ccVersion: CC_VERSION,
        record,
        proveValue,
        provenance: { source: 'npm-pack', tarball: `claude-code-${CC_VERSION}.tgz` },
      });
      expect(written).toBe(expected);

      // Key sections present.
      expect(written).toContain(`## Adoption record — CC ${CC_VERSION}`);
      expect(written).toContain('prove-value');
      expect(written).toContain(`## Pristine extract provenance`);
      expect(written).toContain(`claude-code-${CC_VERSION}.tgz`);

      // Log line names the output path.
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain(outputPath);
    } finally {
      cleanup();
    }
  });

  it('includes PROVENANCE_TARBALL override and PROVENANCE_INTEGRITY when supplied', () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const record = recordOf(CC_VERSION, fourZerosOf());
      const proveValue: ProveValueResult = buildProveValueResult(CC_VERSION, verdictOf(), '2026-06-11T00:00:00.000Z');
      const adoptionRecordPath = writeJsonFile(dir, 'adoption-record.json', record);
      const proveValuePath = writeJsonFile(dir, 'prove-value-result.json', proveValue);
      const outputPath = join(dir, 'output.md');

      runLeafPrEvidenceCliFromPaths({
        ccVersion: CC_VERSION,
        adoptionRecordPath,
        proveValuePath,
        outputPath,
        provenanceTarball: 'claude-code-2.1.172-custom.tgz',
        provenanceIntegrity: 'sha512-abc123',
        log: () => {},
      });

      const written = readFileSync(outputPath, 'utf8');
      expect(written).toContain('claude-code-2.1.172-custom.tgz');
      expect(written).toContain('sha512-abc123');

      // Expected output also matches renderLeafPrEvidence with the same provenance.
      const expected = renderLeafPrEvidence({
        ccVersion: CC_VERSION,
        record,
        proveValue,
        provenance: {
          source: 'npm-pack',
          tarball: 'claude-code-2.1.172-custom.tgz',
          integrity: 'sha512-abc123',
        },
      });
      expect(written).toBe(expected);
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Missing input file → fail loud
// ---------------------------------------------------------------------------

describe('runLeafPrEvidenceCliFromPaths — missing input file', () => {
  it('throws when the adoption-record file does not exist, and the error names the path', () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const missingPath = join(dir, 'does-not-exist-adoption-record.json');
      const proveValue: ProveValueResult = buildProveValueResult('2.1.172', verdictOf(), 'd');
      const proveValuePath = writeJsonFile(dir, 'prove-value-result.json', proveValue);
      const outputPath = join(dir, 'output.md');

      expect(() =>
        runLeafPrEvidenceCliFromPaths({
          ccVersion: '2.1.172',
          adoptionRecordPath: missingPath,
          proveValuePath,
          outputPath,
          log: () => {},
        }),
      ).toThrow(missingPath);
    } finally {
      cleanup();
    }
  });

  it('throws when the prove-value file does not exist, and the error names the path', () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const record = recordOf('2.1.172', fourZerosOf());
      const adoptionRecordPath = writeJsonFile(dir, 'adoption-record.json', record);
      const missingPath = join(dir, 'does-not-exist-prove-value.json');
      const outputPath = join(dir, 'output.md');

      expect(() =>
        runLeafPrEvidenceCliFromPaths({
          ccVersion: '2.1.172',
          adoptionRecordPath,
          proveValuePath: missingPath,
          outputPath,
          log: () => {},
        }),
      ).toThrow(missingPath);
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Version mismatch → renderer throw propagates
// ---------------------------------------------------------------------------

describe('runLeafPrEvidenceCliFromPaths — version mismatch', () => {
  it('propagates the renderer throw when prove-value is keyed to a different version', () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      // Record is for 2.1.172, prove-value is for 2.1.170.
      const record = recordOf('2.1.172', fourZerosOf());
      const proveValue: ProveValueResult = buildProveValueResult('2.1.170', verdictOf(), 'd');
      const adoptionRecordPath = writeJsonFile(dir, 'adoption-record.json', record);
      const proveValuePath = writeJsonFile(dir, 'prove-value-result.json', proveValue);
      const outputPath = join(dir, 'output.md');

      expect(() =>
        runLeafPrEvidenceCliFromPaths({
          ccVersion: '2.1.172',
          adoptionRecordPath,
          proveValuePath,
          outputPath,
          log: () => {},
        }),
      ).toThrow(/2\.1\.170|2\.1\.172/);
    } finally {
      cleanup();
    }
  });
});

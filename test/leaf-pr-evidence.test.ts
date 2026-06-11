import { describe, it, expect } from 'vitest';
import { renderLeafPrEvidence } from '../src/leaf-pr-evidence.js';
import type { PristineProvenance } from '../src/leaf-pr-evidence.js';
import { buildProveValueResult } from '../src/prove-value-result.js';
import type { BehavioralVerdict } from '../src/ab-driver.js';
import type { BehavioralAggregationVerdict } from '../src/behavioral-aggregation.js';
import type { AdoptionRecord } from '../src/integration-gate.js';
import type { FourZerosResult } from '../src/four-zeros-verdict.js';
import { BEHAVIORAL_AXES } from '../src/judge-port.js';
import type { BehavioralAxis } from '../src/judge-port.js';

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
    aggregation: aggregationOf({ 'anti-sycophancy': { stockZ: -1, loboZ: 1, significant: true } }),
    guardrail: 'passed',
    guardrailRegressions: [],
    degenerate: false,
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

const provenance: PristineProvenance = {
  source: 'npm-pack',
  tarball: 'claude-code-2.1.172.tgz',
  integrity: 'sha512-abc',
};

describe('renderLeafPrEvidence', () => {
  it('composes the three evidence halves keyed to the adopted version', () => {
    const record = recordOf('2.1.172', fourZerosOf());
    const proveValue = buildProveValueResult('2.1.172', verdictOf(), '2026-06-11T00:00:00.000Z');
    const md = renderLeafPrEvidence({ ccVersion: '2.1.172', record, proveValue, provenance });

    // Adoption record half.
    expect(md).toContain('Adoption record');
    // Four-zeros bar mapping.
    expect(md).toContain('Four-zeros bar');
    expect(md).toContain('auditMisbinds');
    // prove-value half — reuses renderProveValueResult.
    expect(md).toContain('prove-value');
    expect(md).toContain('anti-sycophancy');
    // pristine provenance half.
    expect(md.toLowerCase()).toContain('pristine');
    expect(md).toContain('npm-pack');
    expect(md).toContain('claude-code-2.1.172.tgz');
    // keyed to the version throughout.
    expect(md).toContain('2.1.172');
  });

  it('maps a green Four-zeros result onto the four zeros explicitly', () => {
    const record = recordOf('2.1.172', fourZerosOf());
    const proveValue = buildProveValueResult('2.1.172', verdictOf(), 'd');
    const md = renderLeafPrEvidence({ ccVersion: '2.1.172', record, proveValue, provenance });

    expect(md).toMatch(/0 failed patches/i);
    expect(md).toMatch(/0 missing system prompts/i);
    expect(md).toMatch(/0 orphan variables/i);
    expect(md).toMatch(/boot-verify/i);
    expect(md).toMatch(/auditMisbinds=0/);
    // A passing bar reads as cleared.
    expect(md.toLowerCase()).toContain('✅');
  });

  it('surfaces a breached Four-zeros bar with its findings rather than claiming a pass', () => {
    const record = recordOf(
      '2.1.172',
      fourZerosOf({
        pass: false,
        failedPatches: ['inline-foo'],
        orphanVariables: ['IS_TRUTHY_FN'],
        misbinds: ['x: ${NAME} ours=slot1 upstream=slot2'],
        auditMisbindsPassed: false,
      }),
      false,
    );
    const proveValue = buildProveValueResult('2.1.172', verdictOf(), 'd');
    const md = renderLeafPrEvidence({ ccVersion: '2.1.172', record, proveValue, provenance });

    expect(md).toContain('inline-foo');
    expect(md).toContain('IS_TRUTHY_FN');
    expect(md).toContain('${NAME}');
    expect(md.toLowerCase()).toContain('❌');
  });

  it('marks the audit not-run distinctly from a clean audit', () => {
    const record = recordOf('2.1.172', fourZerosOf({ auditMisbindsPassed: undefined }));
    const proveValue = buildProveValueResult('2.1.172', verdictOf(), 'd');
    const md = renderLeafPrEvidence({ ccVersion: '2.1.172', record, proveValue, provenance });
    expect(md.toLowerCase()).toMatch(/audit.*not run|not run|skipped/i);
  });

  it('states the contribution is a prepared leaf PR, not an imposed merge', () => {
    const record = recordOf('2.1.172', fourZerosOf());
    const proveValue = buildProveValueResult('2.1.172', verdictOf(), 'd');
    const md = renderLeafPrEvidence({ ccVersion: '2.1.172', record, proveValue, provenance });
    expect(md.toLowerCase()).toContain('prepared');
  });

  it('errors when the record carries no entry for the keyed version (mismatched evidence)', () => {
    const record = recordOf('2.1.170', fourZerosOf());
    const proveValue = buildProveValueResult('2.1.172', verdictOf(), 'd');
    expect(() => renderLeafPrEvidence({ ccVersion: '2.1.172', record, proveValue, provenance })).toThrow(
      /2\.1\.172/,
    );
  });

  it('errors when the prove-value result is keyed to a different version than the body', () => {
    const record = recordOf('2.1.172', fourZerosOf());
    const proveValue = buildProveValueResult('2.1.170', verdictOf(), 'd');
    expect(() => renderLeafPrEvidence({ ccVersion: '2.1.172', record, proveValue, provenance })).toThrow();
  });
});

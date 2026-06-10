import { describe, it, expect } from 'vitest';

import {
  pairingMatrix,
  parsePrHeads,
  latestPromptsPath,
  evaluatePairingCoherence,
  MAINS_LABEL,
} from '../src/pairing-coherence.js';
import type { PairingAudit, LeafPairing } from '../src/pairing-coherence.js';
import type { ShellResult } from '../src/leaf-shell.js';

const ok = (stdout: string): ShellResult => ({ status: 0, stdout, stderr: '' });
const failed = (stderr: string, status = 1): ShellResult => ({ status, stdout: '', stderr });

// Golden fragments of skrabe's `tools/auditMisbinds.mjs` output (tf@4e1b245) — the same
// vocabulary driver-verification keys on; never re-derived here (ADR 0007 §4).
const CLEAN_AUDIT = 'mis-bind audit: 0 (every used placeholder sits at the upstream slot)';
const SKIPPED_AUDIT =
  "mis-bind audit: SKIPPED — upstream reference '/tmp/pieb-2.1.170.json' missing/empty";
const MISBIND_AUDIT =
  'MIS-BINDS: 1 (override placeholder at wrong slot)\n' +
  '  agent-prompt-worker-fork: ${CWD} ours=slot3 upstream=slot5';

const mains: LeafPairing = {
  label: MAINS_LABEL,
  tweakccFixedRef: 'origin/main',
  lobotomizedRef: 'origin/main',
};

describe('pairingMatrix — {mains} ∪ {open PR pairs} (#95)', () => {
  it('with no open PRs the matrix is the mains pairing alone', () => {
    expect(pairingMatrix([], [])).toEqual([mains]);
  });

  it('pairs every open tf PR with every open lcc PR, refs pinned to the PR head oids', () => {
    const matrix = pairingMatrix(
      [{ number: 7, headRefOid: 'e096008' }],
      [{ number: 6, headRefOid: '07e75b9' }],
    );
    expect(matrix).toEqual([
      mains,
      { label: 'tf#7 × lcc#6', tweakccFixedRef: 'e096008', lobotomizedRef: '07e75b9' },
    ]);
  });

  it('an open PR on only one leaf adds no pairing — there is no companion to pair with', () => {
    expect(pairingMatrix([{ number: 7, headRefOid: 'e096008' }], [])).toEqual([mains]);
  });
});

describe('parsePrHeads — `gh pr list --json number,headRefOid` output', () => {
  it('parses the open-PR list into PR heads', () => {
    const json = '[{"headRefOid":"e096008","number":7,"title":"Support CC 2.1.170"}]';
    expect(parsePrHeads(json)).toEqual([{ number: 7, headRefOid: 'e096008' }]);
  });

  it('an empty list parses to no heads', () => {
    expect(parsePrHeads('[]')).toEqual([]);
  });
});

describe('latestPromptsPath — the prompts JSON a tf ref carries', () => {
  it('picks the highest version numerically, not lexicographically (2.1.170 > 2.1.98)', () => {
    expect(
      latestPromptsPath([
        'data/prompts/prompts-2.1.98.json',
        'data/prompts/prompts-2.1.170.json',
        'data/prompts/prompts-2.1.169.json',
      ]),
    ).toBe('data/prompts/prompts-2.1.170.json');
  });

  it('ignores non-prompts entries and returns undefined when none match', () => {
    expect(latestPromptsPath(['data/prompts/README.md'])).toBeUndefined();
    expect(latestPromptsPath([])).toBeUndefined();
  });
});

describe('evaluatePairingCoherence — his audit verdict, attributed per pairing (#95, #80)', () => {
  const prPair: LeafPairing = {
    label: 'tf#7 × lcc#6',
    tweakccFixedRef: 'e096008',
    lobotomizedRef: '07e75b9',
  };

  function audited(...entries: Array<[LeafPairing, ShellResult[]]>): PairingAudit[] {
    return entries.map(([pairing, audits]) => ({ pairing, audits }));
  }

  it('clean audits across the matrix pass, attributed to their pairings', () => {
    const record = evaluatePairingCoherence(
      audited([mains, [ok(CLEAN_AUDIT)]], [prPair, [ok(CLEAN_AUDIT), ok(CLEAN_AUDIT)]]),
    );
    expect(record.pass).toBe(true);
    expect(record.pairings.map((p) => p.pairing.label)).toEqual([MAINS_LABEL, 'tf#7 × lcc#6']);
    expect(record.pairings.every((p) => p.auditMisbindsPassed === true)).toBe(true);
    expect(record.pairings.every((p) => p.misbinds.length === 0)).toBe(true);
  });

  it('a mis-bind in one pairing fails the record, carrying his finding lines on that pairing only', () => {
    const record = evaluatePairingCoherence(
      audited([mains, [failed(MISBIND_AUDIT)]], [prPair, [ok(CLEAN_AUDIT)]]),
    );
    expect(record.pass).toBe(false);
    const [mainsResult, prResult] = record.pairings;
    expect(mainsResult!.auditMisbindsPassed).toBe(false);
    expect(mainsResult!.misbinds).toEqual([
      'agent-prompt-worker-fork: ${CWD} ours=slot3 upstream=slot5',
    ]);
    expect(prResult!.auditMisbindsPassed).toBe(true);
  });

  it('a SKIPPED audit (no upstream dump on this box) is not a hard input — the leaf’s own non-failure', () => {
    const record = evaluatePairingCoherence(audited([mains, [ok(SKIPPED_AUDIT)]]));
    expect(record.pass).toBe(true);
    expect(record.pairings[0]!.auditMisbindsPassed).toBeUndefined();
  });

  it('a failure wins over a clean audit from another override dir within one pairing', () => {
    const record = evaluatePairingCoherence(
      audited([prPair, [ok(CLEAN_AUDIT), failed(MISBIND_AUDIT)]]),
    );
    expect(record.pass).toBe(false);
    expect(record.pairings[0]!.auditMisbindsPassed).toBe(false);
  });

  it('refuses an empty matrix rather than reporting a vacuous pass', () => {
    expect(() => evaluatePairingCoherence([])).toThrow(/empty/i);
  });
});

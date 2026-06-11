import { describe, it, expect } from 'vitest';
import { writeProveValueArtifact, proveValueArtifactPath } from '../src/prove-value-artifact.js';
import type { ProveValueResult } from '../src/prove-value-result.js';

function result(ccVersion: string): ProveValueResult {
  return {
    ccVersion,
    date: '2026-06-11T00:00:00.000Z',
    pairings: 4,
    axes: [],
    guardrail: 'passed',
    guardrailRegressions: [],
    degenerate: false,
    provesValue: true,
  };
}

describe('proveValueArtifactPath', () => {
  it('keys the artifact filename to the CC version under the given dir', () => {
    expect(proveValueArtifactPath('/out', '2.1.172')).toBe('/out/prove-value-2.1.172.json');
  });
});

describe('writeProveValueArtifact', () => {
  it('writes the result as pretty JSON to the version-keyed path via the injected fs seam', () => {
    const writes: Array<{ path: string; data: string }> = [];
    const dirs: string[] = [];
    const fs = {
      mkdirSync: (p: string) => void dirs.push(p),
      writeFileSync: (p: string, data: string) => void writes.push({ path: p, data }),
    };
    const r = result('2.1.172');
    const written = writeProveValueArtifact(r, { dir: '/out', fs });

    expect(written).toBe('/out/prove-value-2.1.172.json');
    expect(dirs).toEqual(['/out']);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.path).toBe('/out/prove-value-2.1.172.json');
    expect(JSON.parse(writes[0]!.data)).toEqual(r);
    // Pretty-printed (machine- AND human-readable for PR attachment).
    expect(writes[0]!.data).toContain('\n');
  });
});

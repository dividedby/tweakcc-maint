import { describe, it, expect } from 'vitest';
import { filterFixtures } from '../src/behavioral-ab-cli.js';
import { BEHAVIORAL_FIXTURES } from '../src/behavioral-fixtures.js';

describe('filterFixtures', () => {
  it('returns undefined when called with an empty / absent id string (all-fixtures path)', () => {
    expect(filterFixtures(undefined)).toBeUndefined();
    expect(filterFixtures('')).toBeUndefined();
    expect(filterFixtures('   ')).toBeUndefined();
  });

  it('filters to the single requested fixture', () => {
    const result = filterFixtures('no-hedge-on-in-scope');
    expect(result).toHaveLength(1);
    expect(result![0]!.id).toBe('no-hedge-on-in-scope');
  });

  it('filters to multiple requested fixtures while preserving canonical order', () => {
    const result = filterFixtures('no-deferral,completes-in-scope');
    // Both ids must be present; order follows the canonical array, not the input order.
    expect(result?.map((f) => f.id)).toEqual(
      BEHAVIORAL_FIXTURES.filter((f) => ['no-deferral', 'completes-in-scope'].includes(f.id)).map((f) => f.id),
    );
  });

  it('throws for an unknown fixture id and names the bad id + lists valid ids', () => {
    expect(() => filterFixtures('typo-fixture-id')).toThrowError(/unknown fixture id.*typo-fixture-id/i);
    expect(() => filterFixtures('typo-fixture-id')).toThrowError(/valid ids/i);
  });

  it('throws naming only the bad ids when mixed with valid ones', () => {
    let msg = '';
    try {
      filterFixtures('no-hedge-on-in-scope,bad-id');
    } catch (e) {
      msg = (e as Error).message;
    }
    // bad-id is in the "unknown" portion; no-hedge-on-in-scope must NOT be listed there.
    const unknownSection = msg.split('Valid ids')[0] ?? '';
    expect(unknownSection).toContain('bad-id');
    expect(unknownSection).not.toContain('no-hedge-on-in-scope');
  });
});

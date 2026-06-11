/**
 * Pure unit for the `cc_version` marker parser (slice 4, #200). It pulls the CC
 * version a downstream chain dispatches the Integration gate against out of a
 * proposal body — the read side of `ccVersionMarker` (issue-publisher.ts), which
 * is the write side. Round-tripping the two here pins the marker contract so the
 * chain can never dispatch against a mis-parsed version.
 */

import { describe, it, expect } from 'vitest';
import { parseCcVersionMarker } from '../src/proposal-marker.js';
import { formatProposal } from '../src/issue-publisher.js';

describe('parseCcVersionMarker (pure marker parser)', () => {
  it('round-trips the version out of a body the real proposal renderer produced', () => {
    const body = formatProposal({ ccVersion: '2.1.180' }).body;
    expect(parseCcVersionMarker(body)).toBe('2.1.180');
  });

  it('returns undefined when the body carries no marker', () => {
    expect(parseCcVersionMarker('a proposal with no machine-readable line')).toBeUndefined();
  });

  it('returns undefined for a malformed marker (no version after the prefix)', () => {
    expect(parseCcVersionMarker('cc_version:')).toBeUndefined();
    expect(parseCcVersionMarker('cc_version: ')).toBeUndefined();
  });

  it('parses the marker even when surrounded by other body lines', () => {
    const body = ['intro line', '', 'cc_version: 1.0.0', 'trailing'].join('\n');
    expect(parseCcVersionMarker(body)).toBe('1.0.0');
  });
});

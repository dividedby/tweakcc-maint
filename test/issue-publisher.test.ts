/**
 * Pure unit for the proposal marker/label contract (#197). `formatProposal`
 * renders the machine-readable `cc_version` marker + the downstream-chain label
 * that slice 4 (#200) dispatches on; pinning it here keeps the contract stable
 * independent of the CLI wiring path.
 */

import { describe, it, expect } from 'vitest';
import { formatProposal, ccVersionMarker, PROPOSAL_LABEL } from '../src/issue-publisher.js';

describe('formatProposal (pure marker/label contract)', () => {
  it('renders the cc_version marker on its own line so a body parser can pull it out', () => {
    const r = formatProposal({ ccVersion: '2.1.180' });
    expect(r.body).toMatch(/^cc_version: 2\.1\.180$/m);
    expect(r.body).toContain(ccVersionMarker('2.1.180'));
  });

  it('carries the downstream-chain label and the adopt-CC title', () => {
    const r = formatProposal({ ccVersion: '2.1.180' });
    expect(r.labels).toContain(PROPOSAL_LABEL);
    expect(r.title).toBe('adopt CC 2.1.180');
  });

  it('ccVersionMarker is exactly `cc_version: <version>`', () => {
    expect(ccVersionMarker('1.0.0')).toBe('cc_version: 1.0.0');
  });
});

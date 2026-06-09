import { describe, it, expect } from 'vitest';
import { parseOrphanReport } from '../src/orphan-report.js';

// The `--report-orphans` JSON contract: { version, prompts: { <promptId>: [VAR, ...] } }.
// The parser is the consumer-half entry point (#31): report JSON → orphan findings, or
// `undefined` when the leaf does not support the flag (caller falls back to Boot-verify).

describe('parseOrphanReport — a report naming a surviving placeholder', () => {
  it('flattens each prompt array into (variable, promptId) findings', () => {
    const raw = JSON.stringify({
      version: '2.1.169',
      prompts: { 'tool-description-agent-usage-notes': ['IS_TRUTHY_FN'] },
    });
    expect(parseOrphanReport(raw)).toEqual([
      { variable: 'IS_TRUTHY_FN', promptId: 'tool-description-agent-usage-notes' },
    ]);
  });

  it('keeps the same variable surviving in multiple prompts as separate findings', () => {
    const raw = JSON.stringify({
      version: '2.1.169',
      prompts: { 'prompt-a': ['CWD'], 'prompt-b': ['CWD'] },
    });
    expect(parseOrphanReport(raw)).toEqual([
      { variable: 'CWD', promptId: 'prompt-a' },
      { variable: 'CWD', promptId: 'prompt-b' },
    ]);
  });
});

describe('parseOrphanReport — report supported, zero orphans', () => {
  it('an all-empty report yields [] (distinct from unsupported)', () => {
    const raw = JSON.stringify({ version: '2.1.169', prompts: {} });
    expect(parseOrphanReport(raw)).toEqual([]);
  });

  it('a report whose prompt arrays are all empty yields []', () => {
    const raw = JSON.stringify({ version: '2.1.169', prompts: { 'prompt-a': [] } });
    expect(parseOrphanReport(raw)).toEqual([]);
  });
});

describe('parseOrphanReport — flag unsupported (→ Boot-verify fallback)', () => {
  it('undefined stdout yields undefined', () => {
    expect(parseOrphanReport(undefined)).toBeUndefined();
  });

  it('empty / whitespace stdout yields undefined', () => {
    expect(parseOrphanReport('')).toBeUndefined();
    expect(parseOrphanReport('   \n')).toBeUndefined();
  });

  it('non-JSON stdout (e.g. an unknown-flag error) yields undefined', () => {
    expect(parseOrphanReport('error: unknown option --report-orphans')).toBeUndefined();
  });

  it('JSON of the wrong shape (missing prompts) yields undefined', () => {
    expect(parseOrphanReport(JSON.stringify({ version: '2.1.169' }))).toBeUndefined();
  });

  it('JSON whose prompt values are not string arrays yields undefined', () => {
    expect(parseOrphanReport(JSON.stringify({ prompts: { a: [1, 2] } }))).toBeUndefined();
  });
});

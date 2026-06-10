import { describe, it, expect } from 'vitest';
import {
  extractLeadingIdentifiers,
  buildKnownSlots,
  survivingPlaceholders,
  buildOrphanReport,
  type PromptsData,
} from '../src/orphan-report-producer.js';

// Producer-half unit tests (#43), relocated + adapted from the closed leaf draft tf#8.
// Version-independent: no fixtures from a specific prompts JSON, no live install. The output
// is the contract the consumer-half parser (parseOrphanReport, #31) round-trips.

describe('extractLeadingIdentifiers — covers the expression class, not just bare names', () => {
  it('extracts a bare ${NAME}', () => {
    expect(extractLeadingIdentifiers('${BARE_NAME}')).toEqual(['BARE_NAME']);
  });

  it('extracts the leading identifier of a function-call form ${FN()}', () => {
    expect(extractLeadingIdentifiers('${ADDITIONAL_DREAM_GUIDANCE_FN()}')).toEqual([
      'ADDITIONAL_DREAM_GUIDANCE_FN',
    ]);
  });

  it('extracts the leading identifier of an object-member form ${OBJ.member}', () => {
    expect(extractLeadingIdentifiers('${ATTACHMENT_OBJECT.blockingError.command}')).toEqual([
      'ATTACHMENT_OBJECT',
    ]);
  });

  it('extracts the leading identifier past a leading unary operator (the boot-crash form)', () => {
    // ${!IS_TRUTHY_FN(PROCESS_OBJECT.env.X)&&...?`…`:""} — IS_TRUTHY_FN is the name that must
    // resolve; the Mis-bind audit's flush-against-`${` regex misses this form.
    const body =
      '${!IS_TRUTHY_FN(PROCESS_OBJECT.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)&&!IS_SUBAGENT_CONTEXT_FN()?`yes`:""}';
    expect(extractLeadingIdentifiers(body)).toEqual(['IS_TRUTHY_FN']);
  });

  it('does NOT flag an escaped \\${...} (inert literal)', () => {
    expect(extractLeadingIdentifiers('\\${ESCAPED_LITERAL}')).toEqual([]);
    expect(extractLeadingIdentifiers('\\${VERSION} and ${REAL_SLOT}')).toEqual(['REAL_SLOT']);
  });

  it('ignores a lowercase-led interpolation (legitimate inline JS, never a slot)', () => {
    expect(extractLeadingIdentifiers('${someJsExpr.foo}')).toEqual([]);
  });

  it('returns identifiers in source order across multiple interpolations', () => {
    expect(extractLeadingIdentifiers('a ${FIRST_VAR} b ${SECOND_VAR}')).toEqual([
      'FIRST_VAR',
      'SECOND_VAR',
    ]);
  });
});

describe('buildKnownSlots — union and per-prompt slot model from the published prompts JSON', () => {
  const data: PromptsData = {
    version: '9.9.9',
    prompts: [
      { id: 'alpha', identifierMap: { 0: 'A_SLOT', 1: 'SHARED_SLOT' } },
      { id: 'beta', identifierMap: { 0: 'B_SLOT', 1: 'SHARED_SLOT' } },
      { id: 'no-map' },
    ],
  };

  it('union is every identifierMap value across all prompts', () => {
    const { union } = buildKnownSlots(data);
    expect([...union].sort()).toEqual(['A_SLOT', 'B_SLOT', 'SHARED_SLOT']);
  });

  it('byId carries each prompt’s own slots only', () => {
    const { byId } = buildKnownSlots(data);
    expect([...byId.get('alpha')!].sort()).toEqual(['A_SLOT', 'SHARED_SLOT']);
    expect([...byId.get('beta')!].sort()).toEqual(['B_SLOT', 'SHARED_SLOT']);
    expect([...byId.get('no-map')!]).toEqual([]);
  });
});

describe('survivingPlaceholders — per-prompt orphan logic with union fallback', () => {
  const known = buildKnownSlots({
    version: '9.9.9',
    prompts: [
      { id: 'alpha', identifierMap: { 0: 'A_SLOT', 1: 'SHARED_SLOT' } },
      { id: 'beta', identifierMap: { 0: 'B_SLOT' } },
    ],
  });

  it('flags a name that is not a slot for THIS prompt even if it is a slot elsewhere', () => {
    // B_SLOT is a valid slot for beta but an orphan for alpha — the precise per-prompt signal
    // (the IS_TRUTHY_FN-on-agent-usage-notes #26 case).
    expect(survivingPlaceholders('${A_SLOT} ${B_SLOT}', 'alpha', known)).toEqual(['B_SLOT']);
  });

  it('does not flag a name bound for this prompt', () => {
    expect(survivingPlaceholders('${A_SLOT} ${SHARED_SLOT}', 'alpha', known)).toEqual([]);
  });

  it('flags a name that is a slot NOWHERE', () => {
    expect(survivingPlaceholders('${PROCESS_OBJECT.env.X}', 'alpha', known)).toEqual([
      'PROCESS_OBJECT',
    ]);
  });

  it('falls back to the union for an override id absent from the JSON', () => {
    // tweakcc-own prompt: no per-prompt map, so any in-union name is accepted and only a
    // nowhere-name is flagged.
    expect(survivingPlaceholders('${A_SLOT} ${UNKNOWN_GHOST}', 'tweakcc-own', known)).toEqual([
      'UNKNOWN_GHOST',
    ]);
  });

  it('dedupes repeated orphans', () => {
    expect(survivingPlaceholders('${GHOST} and again ${GHOST}', 'alpha', known)).toEqual([
      'GHOST',
    ]);
  });

  it('does not flag escaped literals', () => {
    expect(survivingPlaceholders('\\${GHOST}', 'alpha', known)).toEqual([]);
  });
});

describe('buildOrphanReport — the emitted JSON contract over override files', () => {
  const data: PromptsData = {
    version: '2.1.169',
    prompts: [{ id: 'agent-usage-notes', identifierMap: { 0: 'A_SLOT' } }],
  };

  it('keys surviving placeholders per prompt id, omitting clean prompts', () => {
    const report = buildOrphanReport(
      [
        { path: '/x/agent-usage-notes.md', content: '${A_SLOT} ${IS_TRUTHY_FN()}' },
        { path: '/x/clean-prompt.md', content: '${A_SLOT}' },
      ],
      data,
    );
    // clean-prompt has no per-prompt map → union fallback; A_SLOT is in the union → clean,
    // and omitted. agent-usage-notes carries the surviving IS_TRUTHY_FN.
    expect(report).toEqual({
      version: '2.1.169',
      prompts: { 'agent-usage-notes': ['IS_TRUTHY_FN'] },
    });
  });

  it('an all-clean override set yields an empty prompts map (the “supported, zero orphans” state)', () => {
    const report = buildOrphanReport([{ path: '/x/agent-usage-notes.md', content: '${A_SLOT}' }], data);
    expect(report).toEqual({ version: '2.1.169', prompts: {} });
  });

  it('skips inline-* overrides (the inline-blob surface is not keyed by identifierMap)', () => {
    const report = buildOrphanReport(
      [{ path: '/x/inline-some-blob.md', content: '${NOT_A_SLOT}' }],
      data,
    );
    expect(report.prompts).toEqual({});
  });

  it('scans the body, not the <!-- … --> frontmatter prose', () => {
    const content = '<!--\nvariables:\n  - ${MENTIONED_IN_PROSE}\n-->\n${IS_TRUTHY_FN()}';
    const report = buildOrphanReport([{ path: '/x/agent-usage-notes.md', content }], data);
    expect(report.prompts['agent-usage-notes']).toEqual(['IS_TRUTHY_FN']);
  });
});
